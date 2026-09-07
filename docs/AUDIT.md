# Production Readiness & Architecture Audit — Aurel & Co. (clock)

Ngày: 07/09/2026 · HEAD: `a937e0a` · Phạm vi: toàn bộ repo (frontend Next.js 16, backend NestJS 11 + Prisma 7 + PostgreSQL 18, Docker/Caddy/CI).

Mọi kết luận dưới đây dựa trên code/schema/config đã đọc trực tiếp, có `file:line`. Không có benchmark — các khẳng định về throughput được ghi rõ là "cần load test để xác nhận".

---

## 1. Executive Summary

Hệ thống là **modular monolith 3 tầng khá gọn (Next.js BFF-ish + NestJS + Postgres)** với **nền bảo mật thanh toán tốt bất ngờ** so với quy mô dự án: settle VNPay idempotent + HMAC + amount-đóng-băng, chốt giá server-side, chống oversell bằng conditional UPDATE trong transaction, CSRF double-submit, fail-closed CORS, guard 3 lớp cho admin.

**Tuy nhiên có 1 kết cấu P0 và cụm P1 chặn上架 production thật:** (1) các phương thức thanh toán `centurion/escrow/deposit` là **mô phỏng** — tự CONFIRM đơn + ghi payment SUCCESS + trừ tồn kho mà không có tiền nào thu được; (2) hủy đơn bị double-restock tồn kho khi 2 request chạy song song và admin hủy thì không hoàn stock; (3) Product table **0 secondary index** trong khi list endpoint filter/sort/count mỗi request; (4) settle VNPay không nằm trong 1 transaction DB.

Xếp loại tổng thể: **🟡 YES — Có thể production nhưng cần hardening** (quy mô nhỏ, sau khi vá P0). Điểm: **62/100**.

---

## 2. System Architecture Overview

```
Browser ──► Next.js 16 (FE :3000/3200)
            ├─ server components: fetch BE qua lib/api (no-store / revalidate 60s)
            └─ client components: csrfFetch → BE trực tiếp (cross-origin dev / same-origin prod)
         ──► NestJS 11 (BE :4000) ──► Prisma 7 ──► PostgreSQL 18 (:5432, prod trong compose)
            ├─ auth (JWT HS256 7d, cookie HttpOnly, tokenVersion revoke, DB check mỗi request)
            ├─ products / cart / wishlist / orders / payments(VNPay) / inquiries / invoices / notify / admin
            └─ uploads: disk volume hoặc S3-compatible (StorageService)
Caddy (TLS LE, gzip) → reverse proxy FE + /backend/* → BE
docker-compose.prod: db + db-backup (pg_dump 02:00) + backend + frontend + caddy
CI: test (FE+BE) → deploy manual (scp + compose up + migrate deploy)
```

**Đánh giá kiến trúc:** Tách lớp đúng chuẩn cho quy mô này — service layer gọn, logic giá tập trung `common/pricing.ts`, settle logic dùng chung return/IPN. KHÔNG cần microservices; modular monolith là lựa chọn đúng. Bottleleneck kiến trúc duy nhất: **BE là single instance + DB lookup mỗi authenticated request** (chấp nhận được tới vài trăm RPS).

---

## 3. Production Readiness Score

| Category | Score /10 | Ghi chú nhanh |
|---|---:|---|
| Architecture | 7.5 | Modular monolith đúng vị; thiếu state machine đơn nhất cho order status |
| Backend | 7 | Transaction đúng chỗ (create), sai chỗ (settle/cancel); unbounded queries |
| Frontend | 6.5 | next/image đúng; filter client-side chỉ áp dụng trong 1 page — sai kết quả khi catalog lớn |
| Database | 5.5 | 0 index phụ trên Product; String thay enum; không CHECK constraint |
| Scalability | 5 | OFFSET pagination, count() mỗi request, 1 instance, không cache layer |
| Security | 7.5 | CSRF/JWT/CORS/rate-limit tốt; guest pay-URL hole; bcryptjs cost 10 |
| Performance | 6 | N+1: không; payload list nặng (specs+narrative); guard = 1 SELECT user/request |
| Reliability | 5.5 | Non-atomic settle; deploy start code mới trước migrate; FE không healthcheck |
| Data integrity | 6 | Oversell chặn tốt; double-restock + admin-cancel leak tồn kho |
| Testing | 5.5 | 62 test chất lượng cao cho logic tiền; 0 test auth service/FE/e2e |
| DevOps | 6 | CI sạch, secrets đúng; deploy manual, no health-gate, rollback thủ công |
| Observability | 4.5 | Health endpoints có; không có request-id/metrics/alerting |
| Disaster recovery | 6.5 | Backup sidecar + script + restore doc; chưa có restore drill tự động |
| Maintainability | 7 | Code đọc được, comment tiếng Việt rõ ý; README 7 byte = onboarding kém |

**Overall Production Readiness Score: 62/100** — chạy production quy mô nhỏ được sau khi vá P0; chưa scale-ready.

---

## 4. Critical Issues — P0

### PAY-001 · Phương thức thanh toán mô phỏng tự CONFIRM đơn thu tiền ảo
- **Component:** Backend payments/orders · **Location:** `backend/src/orders/orders.service.ts:11,130-138,181-187`; FE fake progress `src/app/checkout/page.tsx:100-105`
- **Problem:** `centurion/escrow/deposit` (và `cod`) → `status=CONFIRMED`, `paidUsd=totalUsd` (hoặc 20%), Payment row `SUCCESS` với `txnRef=SIM-*`; không có rails thật.
- **How it fails:** Khách chọn "Centurion Black" → đơn CONFIRMED, tồn kho trừ, hóa đơn sinh — không một đồng nào được thu. Bất kỳ ai cũng "mua" sản phẩm giá 3.6 tỷ ₫ miễn phí.
- **Impact:** Mất tiền (trực tiếp) · Data integrity · Tồn kho.
- **Solution:** Chặn 3 method này bằng env/feature flag (chỉ bật ở dev); production chỉ cho `vnpay`. Effort: **Low**. Priority: **P0**.

### ORD-001 · Hủy đơn double-restock (race) + admin hủy không hoàn stock
- **Location:** `backend/src/orders/orders.service.ts:284-320` (check status NGOÀI tx, `update` không điều kiện, `increment` không điều kiện); `backend/src/admin/admin.service.ts:51-82` (admin → CANCELLED không restock).
- **How it fails:** 2 lần cancel song song (F5/hai tab) → cả 2 qua check `PENDING` → cả 2 commit → tồn kho +2 lần đơn vị. Admin CONFIRMED→CANCELLED → hàng "bốc hơi" vĩnh viễn khỏi tồn kho.
- **Impact:** Data integrity · Tồn kho sai → oversell/undersell thực tế · Bán hàng gian lận có thể.
- **Solution:** Cancel dùng `updateMany({ where: { id, status: 'PENDING' }, data: {...} })` + check `count===1` trước restock (toàn bộ trong 1 tx); admin cancel tách nhánh: nếu `from ∈ {PENDING, CONFIRMED}` → restock. Effort: **Medium**. Priority: **P0**.

### DB-001 · Product table không có index phụ nào; list query seq-scan + count mỗi request
- **Location:** `backend/prisma/schema.prisma:45-68` (chỉ PK + unique reference); query tại `backend/src/products/products.service.ts:99-123`.
- **Problem:** Filter `collection`, sort `priceUsd/createdAt`, search `contains insensitive` — tất cả seq scan; kèm `count(*)` mỗi request. 6 sản phẩm: vô hại. 10.000+ sản phẩm: mỗi lần lật page catalog = full scan + count full scan.
- **Impact:** Performance · Scalability (DB choke đầu tiên).
- **Solution:** `@@index([collection, priceUsd])`, `@@index([createdAt])`; search chuyển pg_trgm GIN hoặc Postgres FTS (đã có tiếng Việt `unaccent`? cần kiểm tra config locale) — tối thiểu thêm `@@index([name])` cho contains. Effort: **Low-Medium**. Priority: **P0** trước khi gắn catalog thật (vì đó là lúc bảng phình).

---

## 5. High Priority Issues — P1

| ID | Vấn đề | Location | Tác động thực tế | Effort |
|---|---|---|---|---|
| ORD-002 | Settle VNPay không nằm trong 1 DB transaction: payment SUCCESS xong crash → order kẹt PENDING (thiếu PAID), giỏ không clear | `backend/src/common/vnpay.ts:161-178` | Crash giữa chừng = trạng thái lệch tiền-đơn; phải sửa tay trong DB | Medium |
| PAY-002 | Guest order: ai giữ `orderId` (cuid lộ qua URL return?) đều tạo được pay-URL VNPay | `backend/src/payments/payments.service.ts:94-95` | Lạm dụng tạo URL thanh toán rác; tiền vẫn an toàn (expectedVnd đóng băng) | Low |
| API-001 | `GET /orders/mine` không `take` — trả TOÀN BỘ đơn + items của user | `orders.service.ts:270-277` | Khách VIP 500 đơn → response MB-size, chậm, DDOS-ish tự nhiên | Low |
| API-002 | `admin.listUsers` không pagination; `admin.list` orders `take:100` không có page — dữ liệu cũ VÔ HÒM (không thể xem) | `admin.service.ts:30-39,132-161` | 1000+ user/đơn: backoffice mù phần cũ; response phình | Medium |
| API-003 | List product trả đủ cột nặng (specs JSON, narrative Text, images[]) cho MỖI dòng của grid | `products.service.ts:27-69` | Payload list phình theo nội dung; 10k SP × narrative dài = chậmcatalog | Low |
| SEC-001 | Cart `priceUsd/name/image` client-supplied, không đối chiếu Product, không FK | `backend/src/common/cart.ts:101-137`; schema `:133` | Giỏ hiển thị giá/ảnh giả (tấn công chính là khách tự hại), rác DB; checkout đã re-price nên không mất tiền | Medium |
| OPS-001 | Deploy: `up -d --build` chạy code mới TRƯỚC `migrate deploy` | `.github/workflows/deploy.yml` | Mỗi deploy có window code/schema lệch nhau → lỗi 500 ngẫu nhiên theo deploy | Low |
| FE-001 | Filters `/collections` chỉ lọc trong 9 item của page hiện tại; state không vào URL | `src/app/collections/page.tsx:57-71,132-144` | Catalog thật lớn: filter **im lặng sai** (đây là bug nghiệp vụ chứ không chỉ UX) | Medium |
| DB-002 | `Payment.method`, `Inquiry.type/status`, `Invoice.status`, `ProductEvent.action` = String tự do; không CHECK constraint nào (stock≥0, qty>0, price≥0) | schema `:112-127,184-215` | Trạng thái rác lọt DB từ bug/đội sau; migration enum là việc khó làm khi đã có data | Medium |

---

## 6. Medium Issues — P2

1. **SEC-002** — bcryptjs (pure JS) cost 10: đủ an toàn, nhưng ~100ms/hash dưới load cao làm login thành bottleneck; chuyển `bcrypt` native + cost 12 khi có traffic. (`auth.service.ts:83`)
2. **PERF-001** — Guard authenticated = 1 SELECT user mỗi request (`guards.ts:30-38`). Đúng về revocation, tốn về DB: mỗi 100 RPS auth'd = 100 SELECT/s. Cần cache ngắn (5s) hoặc xác stateless + tokenVersion check thưa nếu scale.
3. **PERF-002** — OFFSET pagination (`skip/take`) — page sâu (`?page=5000`) quét skip-row lớn; chuyển keyset (`createdAt,id`) khi bảng order/product >1M dòng. Hiện tại OK.
4. **FE-002** — Admin ProductManager fetch `limit=50` một lần (`src/lib/db.ts:41`) — không quản lý được >50 sản phẩm; không phân trang backoffice.
5. **OPS-002** — Backend Docker chạy root, không prune dev-deps (image phình), không HEALTHCHECK trong image (FE prod cũng không có healthcheck — Caddy proxy vào FE chết không hay biết).
6. **OBS-001** — Không request-id/correlation-id, không metrics (p95, error-rate, DB pool), không alerting (chỉ có uptime gợi ý trong runbook). Sentry + 1 Prometheus node exporter là mức tối thiểu.
7. **DATA-001** — `Inquiry.payload` JSON client tự do không giới hạn kích thước (`inquiries.controller.ts:33`) — spam storage vector nhỏ; cap 4KB.
8. **TEST-001** — Auth service (login/register/revoke) và CSRF middleware không có test — đây chính là 2 cổng bảo mật quan trọng nhất.
9. **SEC-003** — Order code `AC-YYYY-NNNNNN` với `Math.random` (~900k không gian) + `byCode` public: chấp nhận được vì response đã strip PII + throttle 30/min, nhưng nên chuyển 8-10 ký tự crypto-random.
10. **OPS-003** — `statsCache` 60s process-local (`admin.service.ts:20-22`) — sai lệch giữa nhiều instance (hiện 1 instance, ghi chú khi scale).

## 7. Low Priority — P3

- `featured` sort là giả (map sang price desc) — `products.service.ts:107-114`.
- `inBoutique=false` vẫn hiện trong catalog public (`products.service.ts:99-106`) — trái ngược UX admin "tắt Boutique để ẩn".
- Raw `<img data-alt>` (không phải `alt`) ở 5 chỗ — a11y + mất optimize.
- ProductEvent UPDATE chỉ lưu tên field thay đổi, không old/new value — audit trail yếu.
- README 7 bytes — onboarding chỉ có thể qua tribal knowledge.
- "Doanh thu" admin stats tính cả PENDING chưa thu tiền (`admin.service.ts:104-108`).
- Cart qty có thể vượt 99 sau nhiều lần merge (increment không cap cộng dồn).

---

## 8–17. Reviews rút gọn theo chiều sâu

**Database:** Bảng sẽ phình nhanh nhất: `OrderEvent` (mỗi đơn 1-n event) và `Payment`. `Order`/`CartItem` ổn. Cần `EXPLAIN ANALYZE` cho: list products với filter+sort khi có 10k+ rows; `findByTxnRef` (đã có index); admin stats groupBy khi orders >100k. **N+1: không phát hiện** (include/groupBy đúng chỗ).

**Concurrency (chương 9 prompt):** Kịch bản A+B mua SP cuối: **an toàn** (conditional update, một bên 400 — test đã cover proxy-level). Kịch bản 2 người hủy/cancel+admin đổi trạng thái song song: **lost-update + double-restock** (ORD-001). Settle IPN + return song song: **an toàn** (conditional update + re-read, đã test). Register/createProduct song song: 500 P2002 chấp nhận được.

**Cache (10):** Hiện chỉ có: Next Data Cache revalidate 60s cho catalog + immutable cho uploads. **Chưa cần Redis** — Redis chỉ giải quyết được 2 việc ở hệ này khi tới ~1k RPS: (a) cache read-model catalog (bỏ DB hit cho list), (b) rate-limit phân tán khi chạy nhiều BE instance. Trước mức đó, thêm Redis là cargo cult. CDN: cần sớm cho `/uploads/*` và `/_next/static` (đã có integration S3).

**Queue (11):** Email/Telegram hiện gửi inline trong request (swallow-error, không block). Với quy mô hiện tại đủ. Khi đơn/ngày > ~500 hoặc thêm image-processing: BullMQ + 1 worker container, retry 3, DLQ. Ghi nhận: e-invoice issue qua provider cũng nên vào queue sau.

**External (12):** VNPay down → đơn PENDING vô hạn (không tự expire!) — cần cron hủy đơn PENDING >24h + hoàn stock. Telegram/SMTP down → bỏ qua êm (đã đúng). S3 down → upload admin fail (đúng hành vi).

**File/Storage (13):** MIME allowlist + 5MB + tên random hex — tốt. Thiếu: scan virus (P3 cho quy mô VN), không có resize/thumbnail (lỗi admin upload ảnh 5MB thẳng vào card catalog — ảnh không được optimize khi serve `/uploads` qua BE, không qua next/image optimizer... thật ra FE dùng next/image với src `/backend/uploads/...` thì có optimizer đứng giữa nếu same-origin prod — cần xác nhận cấu hình `images.remotePatterns`).

**Search (14):** `contains insensitive` = ILIKE %% — đủ tới ~10-50k SP với index pg_trgm; trên 100k SP hoặc cần typo-tolerance tiếng Việt → Meilisearch (dễ) hơn ES (quá nặng cho nhu cầu).

**Reliability (16):** DB down 30s → mọi authenticated request 500 (guard SELECT fail) + catalog 500 (client hiện lỗi DB đã có UI). FE vẫn render các trang tĩnh. Restart giữa settle → ORD-002. Deploy lỗi → rollback thủ công `git checkout` + rebuild (doc có, không tự động).

**DevOps (18):** CI sạch (test 2 phía trước merge), deploy manual có backup-before-deploy (tốt!), nhưng không health-gate/rollback tự động. Developer mới clone: **không thể onboarding từ README** — phải đoán `.env`, compose, seed.

**Observability (20):** Có `/health` BE + healthcheck compose db/BE. Không request-id, không metrics/alert. Sentry (FE errors + BE exceptions) là investments tiếp theo rẻ nhất.

---

## 22–23. Growth Simulation & Bottleneck

| Thành phần | Hiện tại (6 SP) | 10k SP | 100k SP | 100M records |
|---|---|---|---|---|
| Database | nhàn | Product seq-scan + count → chậm dần (DB-001) | catalog ~1-2s/query không index; index xong vẫn ổn | cần read replica + keyset; OrderEvent/Inquiry partition theo tháng |
| Search | ILIKE đủ | ILIKE + trgm index đủ | cần Meilisearch | Meilisearch/Typesense cluster |
| Images | disk OK | S3 (đã có integration) bắt buộc | S3 + CDN bắt buộc | S3 + CDN + resize-on-upload |
| API | 1 node đủ | 1 node đủ (rate 200/min chặn spam) | cần 2-3 node BE + LB compose; throttle phân tán | cần Redis rate-limit + queue cho notify |
| Cache | Next 60s đủ | + Cache-Control catalog SWR | Redis read-model catalog | Redis + CDN HTML cho trang tĩnh |

## 24. User Growth — cần thay đổi gì

- **100–1.000 users:** không đổi gì. Hiện tại ổn.
- **10.000 users:** vá P0/P1 + thêm Sentry + pg_trgm + admin pagination. 1 VPS 2vCPU/4GB đủ.
- **100.000 users:** BE 2 instance + Redis (cache + rate-limit), CDN, queue email, expire-order cron, keyset pagination.
- **1.000.000 users:** out of scope cho single-Postgres modular monolith hiện trạng — cần: read replicas, tách search service, tách payment worker, có thể tách order service. **Không khuyến nghị vẽ vời từ bây giờ.**

---

## 24b. Production Scenario (chương 34 prompt)

- **A (100 concurrent):** ổn. DB pool mặc định Prisma đủ; guard SELECT + list query indexed OK.
- **B (1.000 concurrent):** ~500-800 RPS thực tế → BE CPU Node.js đơn node bắt đầu bão; DB vẫn ổn nếu có index; login burst làm CPU nghẽn (bcrypt 100ms mỗi lần).
- **C (10.000 concurrent):** vượt xa thiết kế hiện tại — rate limit 200/min/IP sẽ chặn trước khi hạ tầng chết (tinh tế: hạn chế DDOS nhưng cũng từ chối khách thật).
- **D (DB ×100):** mọi seq-scan (list, search) sập hiệu năng trước khi khác — DB-001 là đầu tiên, sau đó OFFSET sâu.
- **E (traffic ×10 đột biến):** Caddy OK; BE Node single-process chậm dần, Throttler bắt đầu 429; không có autoscale (compose tĩnh) → chấp nhận degrade có kiểm soát.
- **F (DB mất kết nối 30s):** trang client hiện "Không kết nối DB" (đã có); mọi POST đơn fail 500 — không có retry/hàng đợi ở BE cho create-order (khách phải tự đặt lại). Restart: compose `restart: unless-stopped` kéo lại.
- **G (Redis down):** không có Redis — không áp dụng.
- **H (VNPay timeout):** khách kẹt ở cổng; đơn PENDING không tự hết hạn → cần cron expire.
- **I (server crash):** container restart; đơn hàng đang trong transaction thì rollback sạch (Postgres atomicity) — trừ window ORD-002.
- **J (deploy bug):** rollback thủ công theo doc; không health-gate — lỗi push buổi tối nằm tới sáng nếu không ai theo dõi.
- **K (2 users cập nhật cùng resource):** cùng cart item → merge increment OK; cùng hủy đơn → double restock (ORD-001); cùng đổi trạng thái admin → last-write-wins.
- **L (spam API):** throttle 200/min + login 10/min + inquiry 5/min → spam bị chặn ở IP; **không phân tán** — spoof nhiều IP (botnet) vượt qua (chỉ scale-level concern).

---

## 25. Recommended Production Architecture (quy mô mục tiêu ~10k users)

```
Client → CDN (Cloudflare: /_next/static, /uploads, catalog HTML SWR)
       → Caddy (TLS, gzip) → Next.js FE (x1) 
                              → NestJS BE (x1-2, tách được vì stateless ngoài cookie)
                                  ├─ PostgreSQL (x1 + backup sidecar + replica khi cần)
                                  ├─ Redis (chỉ khi BE ≥2: rate-limit + catalog cache)
                                  ├─ BullMQ worker (email/e-invoice) — khi cần
                                  └─ S3-compatible (ảnh) + CDN
Monitoring: Sentry (FE+BE) · UptimeRobot → /health · Postgres exporter + Grafana (P3)
```

## 26. Migration Roadmap

**Phase 0 — trước khi mở bán (P0, ~2-3 ngày):** PAY-001 flag-off method mô phỏng · ORD-001 conditional cancel + admin restock · DB-001 index Product + pg_trgm.

**Phase 1 — Hardening (P1, ~1 tuần):** ORD-002 settle trong 1 tx · expire PENDING cron · pagination orders/mine + admin · list projection nhẹ · deploy顺序 migrate-trước-start + README onboarding.

**Phase 2 — Scale (khi có traffic thật):** Sentry + metrics · FE-001 filter server-side + URL state · S3/CDN ảnh · BE 2 instance + Redis rate-limit.

**Phase 3 — Large:** Meilisearch · keyset pagination · read replica · queue worker.

**Phase 4 — Future (chỉ khi thật lớn):** partitioning OrderEvent/Inquiry, tách service.

---

## 27. Final Verdict

### 🟡 YES — Có thể production (quy mô nhỏ) nhưng BẮT BUỘC hardening trước khi thu tiền thật

Lý do chính:
1. **P0 PAY-001**: thanh toán mô phỏng tự xác nhận "đã thu tiền" — nếu mở VNPay thật song song 3 method này, mất tiền là chắc chắn xảy ra trong tuần đầu.
2. **P0 ORD-001/DB-001**: tồn kho sai và catalog seq-scan là 2 vấn đề nổ ngay khi có catalog + khách thật (không cần "quy mô lớn" — 100 sản phẩm và 10 khách hủy đơn song song là đủ).
3. Phần còn lại của hệ thống (auth, CSRF, VNPay settle, idempotency, transaction tạo đơn, test 62 case cho logic tiền) là **đáng tin hơn mặt trung bình các dự án cùng cỡ** — không cần rewrite, chỉ cần vá đúng chỗ.

## 28. Top 10 phải sửa ngay

| # | Việc | Severity | Effort |
|---|---|---|---|
| 1 | Tắt/flag-off 3 method thanh toán mô phỏng ở prod | 🔴 P0 | Low |
| 2 | Cancel: conditional update + restock trong 1 tx | 🔴 P0 | Medium |
| 3 | Admin cancel → restock (nếu from PENDING/CONFIRMED) | 🔴 P0 | Low |
| 4 | Index Product (collection+price, createdAt, name-trgm) | 🔴 P0 | Low |
| 5 | Bọc settle VNPay trong $transaction | 🟠 P1 | Medium |
| 6 | Cron hết hạn đơn PENDING + hoàn stock | 🟠 P1 | Medium |
| 7 | Pagination: orders/mine, admin list, ProductManager | 🟠 P1 | Medium |
| 8 | Deploy: migrate TRƯỚC start; README onboarding | 🟠 P1 | Low |
| 9 | Sentry + uptime alert | 🟡 P2 | Low |
| 10 | Filters collections → server-side + URL state | 🟡 P2 | Medium |

## 29. Bảng tổng vấn đề

| # | Vấn đề | Severity | Production Impact | Scalability Impact | Effort | Priority |
|---|---|---|---|---|---|---|
| 1 | Phương thức thanh toán mô phỏng tự CONFIRM (PAY-001) | 🔴 | Mất tiền trực tiếp | — | Low | P0 |
| 2 | Double-restock khi hủy song song + admin hủy không hoàn stock (ORD-001) | 🔴 | Tồn kho sai, oversell | Cao dần theo user | Medium | P0 |
| 3 | Product 0 index + count mỗi request (DB-001) | 🔴 | Catalog chậm khi SP nhiều | DB choke đầu tiên | Low | P0 |
| 4 | Settle VNPay non-atomic (ORD-002) | 🟠 | Tiền-đơn lệch trạng thái khi crash | — | Medium | P1 |
| 5 | Unbounded queries: orders/mine, listUsers, admin orders không paging (API-001/002) | 🟠 | Response phình, backoffice mù dữ liệu cũ | Chặn scale data | Medium | P1 |
| 6 | List payload nặng specs/narrative (API-003) | 🟠 | Catalog chậm | Chặn catalog lớn | Low | P1 |
| 7 | Guest pay-URL + cart client-trusted data (PAY-002, SEC-001) | 🟠 | Lạm dụng nhỏ | — | Low-Med | P1 |
| 8 | Deploy start-code-trước-migrate (OPS-001) | 🟠 | Window 500 ngẫu nhiên mỗi deploy | — | Low | P1 |
| 9 | Filter collections client-side 1-page (FE-001) | 🟡 | Kết quả lọc sai | Sai hoàn toàn khi catalog lớn | Medium | P2 |
| 10 | Enum-as-String + không CHECK constraint (DB-002) | 🟡 | Trạng thái rác lâu dài | Migration khó sau này | Medium | P2 |

## 30. Scale — hiện trạng vs cần thay đổi

| Scale | Hiện trạng | Bottleneck đầu tiên | Cần thay đổi |
|---|---|---|---|
| 1K users | Ổn (sau P0) | Không | Chỉ ops cơ bản |
| 10K users | Ổn nếu đã làm Phase 0+1 | Guard-SELECT/request + catalog DB hit | Sentry, pg_trgm, pagination, S3 ảnh |
| 100K users | Không ổn | BE single-node, rate-limit per-IP, OFFSET | BE×2 + Redis, CDN, queue, expire-cron |
| 1M users | Không thuộc thiết kế hiện tại | Tất cả | Replica, search service, tách worker — quyết định khi đến |
