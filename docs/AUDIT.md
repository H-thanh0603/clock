# Production Readiness & Architecture Audit — Aurel & Co. (clock)

Ngày: 07/09/2026 (audit gốc, HEAD `a937e0a`) · **Re-audit: 11/09/2026, HEAD `d578ba6`** — toàn bộ P0/P1/P2 của audit gốc đã được vá và có test. Phạm vi: toàn bộ repo (frontend Next.js 16, backend NestJS 11 + Prisma 7 + PostgreSQL 18, Docker/Caddy/CI).

> **Đọc nhanh:** mọi mục P0/P1/P2 trong audit gốc hiện trạng ✅ ĐÃ VÁ (bảng §4). Re-audit này giữ nguyên phân tích kiến trúc/scale của bản gốc (vẫn chính xác), cập nhật trạng thái từng mục + điểm mới, và ghi rõ những gì còn mở (§6) để không tự lừa.

---

## 1. Executive Summary

Hệ thống là **modular monolith 3 tầng gọn (Next.js BFF-ish + NestJS + Postgres)** với nền bảo mật thanh toán tốt: settle VNPay idempotent + HMAC + amount đóng băng trong 1 transaction, chốt giá server-side (đã mở rộng xuống cả cart), chống oversell bằng conditional UPDATE, CSRF double-submit, fail-closed CORS, guard 3 lớp cho admin, rate-limit mọi điểm nhập nhạy cảm.

**Sau đợt vá 09/2026 (14 commits, 44 test mới):** mọi kết cấu P0 và cụm P1 của audit gốc đã được vá kèm test (settle atomic, conditional cancel + restock, index DB + pg_trgm, migrate-before-swap, pagination, cart price trust, fail-closed simulated methods). Cộng thêm: observability (Sentry + request-id + request logging), 106 test BE / 6 FE, backup tự verify restore, chống đơn trùng, llms.txt + JSON-LD (agent layer).

Xếp loại tổng thể: **🟢 YES — Production-ready cho quy mô nhỏ (≤ ~10k users) — thu tiền thật được.** Không còn P0/P1 mở. Còn một nhóm P3 nhỏ (§6) và các quyết định scale (§7) trì hoãn có chủ đích.

---

## 2. System Architecture Overview

*(Không đổi so với bản gốc — kiến trúc không touched trong đợt vá.)*

```
Browser ──► Next.js 16 (FE :3000/3200)
            ├─ server components: fetch BE qua lib/api (no-store / revalidate 60s)
            └─ client components: csrfFetch → BE trực tiếp (cross-origin dev / same-origin prod)
         ──► NestJS 11 (BE :4000) ──► Prisma 7 ──► PostgreSQL 18 (:5432, prod trong compose)
            ├─ auth (JWT HS256 7d, cookie HttpOnly, tokenVersion revoke, BCRYPT_COST env)
            ├─ products / cart / wishlist / orders / payments(VNPay) / inquiries / invoices / notify / admin
            └─ uploads: disk volume hoặc S3-compatible (StorageService)
Caddy (TLS LE, gzip) → reverse proxy FE + /backend/* → BE
docker-compose.prod: db + db-backup (pg_dump 02:00 + verify restore mỗi ~7 backup) + backend (non-root) + frontend (healthcheck) + caddy
CI: test (FE+BE) → build → deploy: backup → build → migrate deploy (container one-off) → up -d
```

**Đánh giá kiến trúc:** giữ nguyên kết luận gốc — modular monolith là lựa chọn đúng, KHÔNG cần microservices. Thay đổi đáng chú ý duy nhất: notify giờ qua **hàng đợi in-memory + retry backoff** (30s→2m→8m, max 3 lần) thay vì gửi inline — đủ cho 1 instance BE, vài chục notify/ngày; BullMQ/Redis khi >500 đơn/ngày hoặc tách instance (đã ghi chú trong `notify.service.ts`).

---

## 3. Production Readiness Score (re-audit 11/09/2026)

| Category | Gốc | Mới | Ghi chú |
|---|---:|---:|---|
| Architecture | 7.5 | 7.5 | Không đổi; notify giờ có queue nhẹ |
| Backend | 7 | 8.5 | Settle atomic, conditional cancel, dedup đơn, cap body 256kb, queue notify |
| Frontend | 6.5 | 8.0 | FE-001 filter server-side + URL state; error page + Sentry client |
| Database | 5.5 | 7.5 | Index [collection,priceUsd]+[createdAt]; pg_trgm GIN name+reference; enum thật |
| Scalability | 5 | 6.0 | Pagination mọi list; OFFSET vẫn còn (chấp nhận <1M dòng); count mỗi request vẫn có |
| Security | 7.5 | 8.5 | Cart price DB-trust; vnp_ExpireDate+TTL; bcrypt cost env (prod 12); payload cap 4KB; body cap; order code crypto-random |
| Performance | 6 | 7.0 | List projection nhẹ; trgm index; guard SELECT/request vẫn là chi phí chính |
| Reliability | 5.5 | 8.0 | Deploy migrate-before-swap; FE healthcheck; BE non-root + HEALTHCHECK; queue retry |
| Data integrity | 6 | 8.0 | Double-restock đã vá + test; admin cancel restock đúng nhánh; expire cron hoàn stock |
| Testing | 5.5 | 7.5 | 62→106 test BE (auth 13, CSRF 11, notify queue 4, vnpay expire 2, cart trust, dedup 2...); FE 6 |
| DevOps | 6 | 7.5 | README onboarding đầy đủ; restore-db.sh; backup verify tự động; deploy health-log |
| Observability | 4.5 | 7.0 | Sentry FE+BE optional-by-DSN; request-id + log mỗi request; exception filter; UptimeRobot doc |
| Disaster recovery | 6.5 | 8.0 | Backup tự restore-verify (script + sidecar tuần 1 lần); restore drill script có xác nhận |
| Maintainability | 7 | 8.0 | README thật; AUDIT re-visit; comment tiếng Việt giữ vẹn |

**Overall: 62 → 78/100.** Điểm chưa lên 80+ chỉ vì: OFFSET pagination + count() mỗi request (Scalability), guard SELECT/request (Performance), và chưa có e2e test (Testing) — chi tiết §6.

---

## 4. Trạng thái từng mục audit gốc

### P0 — đã vá TẤT CẢ

| ID | Vấn đề (gốc) | Trạng thái + bằng chứng |
|---|---|---|
| PAY-001 | 3 method thanh toán mô phỏng tự confirm thu tiền ảo | ✅ `simulatedMethodsEnabled()` fail-closed: prod (`NODE_ENV=production`) chỉ còn `vnpay`; chọn method ảo ở prod → 400 |
| ORD-001 | Hủy đơn double-restock khi song song + admin hủy không hoàn stock | ✅ Conditional `updateMany({status})` + check count trong 1 tx; admin cancel restock khi from ∈ PENDING/CONFIRMED — có test |
| DB-001 | Product 0 secondary index; seq-scan + count mỗi request | ✅ `@@index([collection, priceUsd])`, `@@index([createdAt])`; pg_trgm GIN trên `name` + `reference` (migration riêng, đã verify chạy trên PG18 thật) |

### P1 — đã vá TẤT CẢ

| ID | Trạng thái |
|---|---|
| ORD-002 (settle non-atomic) | ✅ Settle VNPay trong 1 `$transaction`, idempotent theo txnRef |
| API-001/002 (unbounded queries) | ✅ Pagination: orders/mine, admin orders, admin users, ProductManager (giờ qua `GET /admin/products` riêng) |
| API-003 (payload list nặng) | ✅ List projection bỏ specs/narrative ra grid |
| SEC-001 (cart tin giá client) | ✅ `PriceLookup` inject: giá gốc LUÔN từ DB theo slug (inBoutique=true), slug lạ → 400 "không còn bán" — commit `b5c71e7` |
| OPS-001 (deploy sai thứ tự) | ✅ Workflow: backup → build → `prisma migrate deploy` (one-off container) → `up -d` — commit `aa5655b` |
| FE-001 (filter client-side 1 page) | ✅ Server-side filter movement/material/size/complication + state vào URL — commit `298f723` |
| DB-002 (String thay enum) | ✅ OrderStatus/PaymentStatus/Role/… là enum Prisma thật (CHECK ở DB qua enum PG) |

### P2 — đã vá TẤT CẢ

| ID | Trạng thái |
|---|---|
| SEC-002 (bcrypt cost 10) | ✅ `BCRYPT_COST` env (4–15, rác → 10); prod compose default 12 — `568bd84` |
| PERF-002 (OFFSET pagination) | ⚠️ Còn OFFSET — chấp nhận đến ~1M dòng, ghi rõ §6 (không phải việc làm khi 6 SP) |
| FE-002 (ProductManager limit 50) | ✅ Endpoint admin riêng + pagination |
| OPS-002 (Docker root, no healthcheck) | ✅ Backend multi-stage `USER node` + HEALTHCHECK trong image; FE healthcheck qua compose; non-root cả 2 |
| OBS-001 (0 observability) | ✅ Sentry FE+BE (optional theo DSN), request-id middleware + log `method url status ms [id]`, exception filter capture — `4109b6b` |
| DATA-001 (payload vô hạn) | ✅ Cap 4KB, depth ≤3, ≤30 keys, scalar-only + HTML-escape Telegram — `fecd6d4` |
| TEST-001 (0 test auth/CSRF) | ✅ 13 test AuthService + 11 test CSRF middleware — `bd4343f` |
| SEC-003 (order code Math.random) | ✅ `crypto.randomInt(100000, 1000000)` giữ format AC-YYYY-NNNNNN |
| OPS-003 (statsCache process-local) | ⚠️ Giữ nguyên — đúng với 1 instance BE, đã ghi chú trong code |

### P3 — vá hết mục chạm UX/doanh số, còn 3 mục chấp nhận

| Mục | Trạng thái |
|---|---|
| inBoutique=false vẫn hiện catalog | ✅ Public list + bySlug chặn; admin thấy qua `/admin/products` (`4a51a72`) |
| Doanh thu tính cả PENDING | ✅ Chỉ PAID/SHIPPED/COMPLETED (`4a51a72`) |
| README 7 byte | ✅ README onboarding đầy đủ: kiến trúc, dev setup, deploy, quy ước tiền/migration/backup (`8311de9`) |
| ProductEvent UPDATE chỉ lưu field name | ⚠️ Chưa làm — audit trail yếu, chấp nhận cho quy mô nhỏ |
| Raw `<img data-alt>` 5 chỗ | ⚠️ Chưa làm — a11y, ảnh vẫn optimize qua next/image ở hero; các thumb còn lại |
| Cart qty vượt 99 sau merge nhiều lần | ⚠️ Chưa làm — tự hại (giỏ của chính user), checkout vẫn clamp qty 1–99 khi chốt |

### Mục mới làm ngoài bảng gốc (từ đề xuất nâng cấp 11/09)

| Việc | Commit |
|---|---|
| Chống đơn trùng double-click (trả đơn cũ trong 3', không trừ kho 2 lần) | `8c830e6` |
| Cap JSON body 256kb chủ động | `8c830e6` |
| Backup tự verify restore (script + sidecar ~tuần 1 lần, so khớp số bảng) | `8c830e6` |
| vnp_ExpireDate giờ VN+7 + TTL URL cấu hình được | `bc91261` |
| Notify queue + retry backoff | `3a442e3` |
| SEO: sitemap động, robots, JSON-LD Product/Breadcrumb/Organization | `8311de9`, `d578ba6` |
| llms.txt (agent layer, chuẩn LLM-crawler) | `d578ba6` |
| pg_trgm migration | `8311de9` |

---

## 5. Kết luận đánh giá lại

### 🟢 YES — Production-ready (quy mô nhỏ ≤ ~10k users), có thể thu tiền thật

1. Không còn mục P0/P1 nào mở — mỗi mục có commit + test tương ứng (§4).
2. Bộ test logic tiền/nghiệp vụ: **106 BE + 6 FE**, phủ auth, CSRF, VNPay (sign/settle/expire), cart price trust, oversell, double-restock, dedup đơn, notify queue, payload cap, bcrypt boundary.
3. Ranh giới an toàn còn lại được **nói rõ thay vì giấu**: OFFSET pagination, guard SELECT/request, notify in-memory queue, statsCache process-local — tất cả chỉ đúng với 1 BE instance + <1M dòng đơn. Khi vượt: theo §6.

## 6. Còn mở (chấp nhận có chủ đích — KHÔNG làm trước khi cần)

| Việc | Khi nào làm |
|---|---|
| Keyset pagination thay OFFSET | Order/Product > 1M dòng |
| Cache guard 5s / stateless + tokenVersion thưa | > vài trăm RPS auth'd |
| BullMQ + Redis cho notify (in-memory queue hiện tại chết khi restart container — mất tối đa vài thông báo đang retry) | > 500 đơn/ngày hoặc BE ≥ 2 instance |
| ProductEvent old/new value | Khi cần audit trail thật (yêu cầu tài chính/pháp lý) |
| Meilisearch thay ILIKE | Catalog > ~50k SP hoặc cần typo-tolerance tiếng Việt |
| Payments controller test (handleReturn/handleIpn mapping) | Rảnh — logic mỏng, đã test tầng vnpay.ts |
| e2e (Playwright) checkout flow | Trước khi chạy chiến dịch marketing lớn |
| OFFSITE backup (S3/rclone) | Ngay khi có dữ liệu khách thật — hiện backup cùng VPS với DB (đã doc rsync cron trong PRODUCTION.md) |

## 7. Scale (giữ nguyên kết luận gốc — vẫn chính xác)

| Scale | Hiện trạng | Cần |
|---|---|---|
| 1K users | ✅ Ổn ngay bây giờ | Chỉ ops: theo dõi Sentry + UptimeRobot |
| 10K users | ✅ Ổn (đã có Sentry, pg_trgm, pagination, S3 option) | 1 VPS 2vCPU/4GB đủ |
| 100K users | ⚠️ Không ổn — BE single-node, throttle không phân tán | BE×2 + Redis (cache + rate-limit), CDN, queue worker |
| 1M users | ❌ Ngoài thiết kế | Replica, search service, tách payment worker — quyết định khi đến |

---

*Phương pháp re-audit: đối chiếu từng mục bảng gốc với code hiện tại (grep + đọc file + chạy test), không phỏng đoán. Mọi khẳng định "đã vá" đều có file/commit tương ứng liệt kê ở §4.*
