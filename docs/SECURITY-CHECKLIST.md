# Security Audit — 20 điểm checklist

Ngày: 13/09/2026 · Phạm vi: toàn bộ repo (frontend Next.js 16, backend NestJS 11 + Prisma 7 + PostgreSQL 18, AI agents Python, Docker/Caddy/CI).

Kết quả: **19/20 PASS** — 1 mục vá trong đợt audit này (20. Scan dependencies).

| # | Mục | Trạng thái |
|---|---|---|
| 1 | Hide API keys | ✅ PASS |
| 2 | Check env variables | ✅ PASS |
| 3 | Purge Git secrets | ✅ PASS |
| 4 | Protect admin routes | ✅ PASS |
| 5 | Enforce server-side auth | ✅ PASS |
| 6 | Check user permissions | ✅ PASS |
| 7 | Enable RLS/DB rules | ✅ PASS* |
| 8 | Hash passwords | ✅ PASS |
| 9 | Secure session cookies | ✅ PASS |
| 10 | Encrypt sensitive data | ✅ PASS* |
| 11 | Validate user input | ✅ PASS |
| 12 | Prevent XSS | ✅ PASS |
| 13 | Prevent SQL injection | ✅ PASS |
| 14 | Prevent CSRF/CORS | ✅ PASS |
| 15 | Secure file uploads | ✅ PASS |
| 16 | Prevent field tampering | ✅ PASS |
| 17 | Add rate limiting | ✅ PASS |
| 18 | Security headers / HTTPS | ✅ PASS |
| 19 | Disable debug & prod settings | ✅ PASS |
| 20 | Scan dependencies | 🔧 **VÁ TRONG ĐỢT NÀY** |

---

## Chi tiết từng mục

### 1. Hide API keys ✅

- Không có API key thật nào trong code. Tất cả qua env: `JWT_SECRET`, `VNPAY_HASH_SECRET`, `S3_*`, `AGENT_API_KEY`, `MEILI_MASTER_KEY`, `SENTRY_DSN`, SMTP/Telegram.
- Chỉ `NEXT_PUBLIC_*` được expose ra browser (`NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_SENTRY_DSN` — thiết kế công khai, không phải secret). Token merchant (`AGENT_MERCHANT_TOKEN`) KHÔNG BAO GIỜ là `NEXT_PUBLIC_*`: FE gọi vận hành qua Next route `/api/agent/*` (server verify role ADMIN + gắn token phía server). Mọi `NEXT_PUBLIC_*_TOKEN` trong bundle đều coi như public.
- Model API key (`AGENT_API_KEY`) sống trong `agent/.env` (không commit) và chỉ dùng phía server host (`agent/aurel_agents/config.py`), không bao giờ xuyên qua FE.
- Thư viện secret-scan pattern (`sk-`, `AKIA`, `ghp_`, private key PEM) trên working tree: 0 kết quả.

### 2. Check env variables ✅

- `.env`, `.env.prod`, `agent/.env` được `.gitignore` đầy đủ (`.env`, `.env*.local`, có `!.env.example`).
- Mẫu `.env.example` / `.env.prod.example` không chứa giá trị thật — chỉ placeholder (`doi-mat-khau-manh-o-day`, `tao-moi-bang-openssl-rand-hex-32`).
- Fail-fast đúng chỗ: `sessionSecret()` throw khi thiếu `JWT_SECRET`; compose prod fail-fast khi thiếu `MEILI_MASTER_KEY`; seed từ chối chạy ở production khi thiếu `ADMIN_PASSWORD`.
- Ghi chú: `.env` hiện chỉ chứa 2 URL công khai (không secret), an toàn.

### 3. Purge Git secrets ✅

- Scan toàn bộ 112 commits của `git rev-list --all` theo pattern key AWS/GitHub/OpenAI/PEM: **0 kết quả**.
- Chỉ các file `*.env.example` (placeholder) từng được commit — không file `.env` thật trong history.
- Không cần filter-repo/purge gì thêm.

### 4. Protect admin routes ✅

Hai lớp, fail-closed:
- **FE**: `src/proxy.ts` (Next middleware) chặn `/admin/*` — forward cookie sang `BE /auth/me`, không phải ADMIN → redirect `/login` hoặc `/`. Backend chết → redirect login (fail-closed, không leak trang).
- **BE**: `AdminGuard` trên `@Controller('admin')` + `UploadsController` (`admin/uploads`) — check role trong DB mỗi request, không tin role trong JWT.
- Guard role-DB hóa nên việc sửa JWT role cũng vô dụng — token phải khớp `tokenVersion` + role DB hiện tại.

### 5. Enforce server-side auth ✅

- `RequiredAuthGuard` / `OptionalSessionGuard` / `AdminGuard` đọc cookie JWT (HttpOnly), verify `tokenVersion` với DB → logout/đổi pass giết phiên cũ.
- Delegation token (AI agent "act on behalf") tách aud (`aurel-agent`), TTL 30 phút, không lẫn được với session token (verify check aud/scope ngược chiều — session token có aud/scope → reject).
- Every authenticated request đều verify với DB → không có "trust the token blindly".

### 6. Check user permissions ✅

- IDOR check ở `orders.cancel`: owner = `userId` khớp HOẶC contact khớp (case-insensitive) → không hủy được đơn người khác.
- `orders/mine`, wishlist đều filter theo `user.id` từ session (không nhận userId từ client).
- Delegation chỉ cấp cho CUSTOMER — admin không delegate (tách quyền).
- Chỉ một chỗ cần để mắt theo thời gian: `GET /orders/by-code/:code` là public (theo thiết kế — khách vãng lai tra đơn bằng code), đã có rate limit 30/phút.

### 7. Enable RLS/DB rules ✅*

- Không dùng Postgres RLS ở mức dòng (Prisma ORM + single service user) — thay bằng: **every query đi qua Prisma với WHERE userId từ session**, enum thật ở DB (Role/OrderStatus/PaymentStatus — CHECK constraints), FK + cascade đúng.
- Nhắc nhở khi mở rộng: nếu thêm Read-replica hoặc dịch vụ thứ hai truy cập DB trực tiếp, cần bật RLS trên `Order.userId`, `CartItem.userId`, `WishlistItem.userId`.

### 8. Hash passwords ✅

- bcrypt (`bcryptjs`) — `BCRYPT_COST` env (4–15, rác → 10), prod compose default 12 (~250ms/hash).
- Chống timing-enumeration: login với user không tồn tại vẫn chạy `bcrypt.compare` với `DUMMY_HASH`.
- Chặn CPU-DoS: password input cắt 72 byte (giới hạn bcrypt).
- Đổi password → tăng `tokenVersion` → mọi token cũ chết.

### 9. Secure session cookies ✅

- `HttpOnly` + `SameSite` (Lax dev / None khi cross-site prod) + `Secure` khi prod (`COOKIE_SAMESITE=none` → auto Secure).
- Prod qua Caddy reverse proxy `/backend/*` cùng origin → cookie first-party, không cần SameSite=None nữa.
- JWT HS256, issuer check, TTL 7 ngày, `tokenVersion` revoke.
- CSRF cookie riêng `aurel_csrf` (readable by design cho double-submit).

### 10. Encrypt sensitive data ✅*

- Mật khẩu: bcrypt (một chiều). TLS: Caddy auto-HTTPS (Let's Encrypt) cho mọi traffic ngoài. DB trong compose network nội bộ, không expose port ra ngoài.
- Backups (pg_dump) nằm trong volume `backups/` đã gitignore; compose không mount ra host port.
- Điểm cộng khi scale: chưa có encryption-at-rest riêng (dùng whatever DB host/VPS cung cấp — trên VPS thường là LUKS/dm-crypt của provider). Không có dữ liệu card nào lưu (VNPay redirect flow — PCI scope ở VNPay).

### 11. Validate user input ✅

- Global `ValidationPipe` NestJS với `whitelist: true` (bỏ field lạ), `transform: true`.
- Validation thủ công chặt ở mọi entrance: email regex, password 6–72, `qty` clamp 1–99, `items.slice(0, 50)`, name/contact/address trim + required.
- Inquiry payload: cap 4KB, depth ≤ 3, ≤ 30 keys, scalar-only (`normalizePayload`).
- Body cap 256kb JSON/urlencoded (chống CPU-DoS JSON khổng lồ).

### 12. Prevent XSS ✅

- React escaping mặc định; chỉ 2 chỗ `dangerouslySetInnerHTML` (JSON-LD) đều qua `safeJsonLd()` — escape `<` thành `\u003c` chống `</script>` breakout (đã có commit `ec93e02` + test).
- Upload: whitelist ext + MIME → không lưu được `.html`/`.svg` (stored XSS qua `/uploads/`) — commit `d3862f0` + 10 test.
- Header `X-Content-Type-Options: nosniff` cả FE (next.config) và BE (helmet).
- Telegram notify: HTML-escape payload trước khi gửi.

### 13. Prevent SQL injection ✅

- 100% query qua Prisma (parameterized). 2 chỗ `$queryRaw` (metrics + health) dùng **tagged template** → tự parameterize, không nối chuỗi. `trunc` và `span` là giá trị whitelist rồi mới vào query.
- Không có string interpolation vào SQL ở bất kỳ đâu.

### 14. Prevent CSRF/CORS ✅

- **CSRF**: double-submit cookie (`aurel_csrf` + header `x-csrf-token`), áp mọi POST/PATCH/PUT/DELETE trừ login/register/csrf (chưa có session để ride). Token ≥ 16 ký tự, random 24 byte.
- **CORS**: fail-closed — không bao giờ `*` khi `credentials: true`; origin từ `FRONTEND_URL` env, rỗng → fallback localhost. Agent host cũng whitelist origin tường minh.

### 15. Secure file uploads ✅

- Admin-only (`AdminGuard`).
- Whitelist MIME (JPEG/PNG/WebP) **và** extension (client có thể giả MIME — check cả hai).
- Max 5MB (multer `fileSize` limit).
- Tên file random: `Date.now()-randomBytes(8).hex` — không dùng tên gốc (chống path traversal).
- Serve với `Cache-Control immutable` + content-type từ storage service, KHÔNG execute.
- Nâng cấp dependency multer 2.2.0 → 2.3.0 (vá 4 advisory DoS + **file size limit bypass via async fileFilter race** — trực tiếp liên quan endpoint này).

### 16. Prevent field tampering ✅

- Giá: **LUÔN từ DB** theo slug (audit SEC-001/SEC-002) — client gửi `priceUsd` bị bỏ qua khi sản phẩm tồn tại; VND suy từ USD × tỷ lệ, không tin `priceVnd` client.
- `role`/`userId`/`status` không nhận từ body — lấy từ session/DB; `whitelist: true` ValidationPipe bỏ field lạ.
- Thanh toán: `expectedVnd` đóng băng lúc tạo URL, settle idempotent theo `txnRef` trong 1 transaction, conditional UPDATE chống oversell + double-settle.
- Thanh toán mô phỏng fail-closed ở prod (chỉ VNPay thật).
- Một ngoại lệ có chủ đích: hàng bespoke (slug không tồn tại) nhận giá client nhưng đơn **phải** qua PENDING để concierge duyệt — không auto-confirm, không tự coi là đã thu.

### 17. Add rate limiting ✅

- Toàn cục: `ThrottlerGuard` 200 req/phút (default).
- Siêu chặt theo endpoint nhạy cảm: login 10/phút, register 5/phút, delegation 6/phút, đổi password 5/phút, order-create + by-code 30/phút.
- Agent host: rate limit chat theo IP (60/phút configurable), turn cap mỗi session/ngày → 429.
- Lưu ý scale: throttler in-memory — 1 instance BE thì đúng, nhiều instance cần Redis store (đã ghi chú trong AUDIT.md §6).

### 18. Security headers / HTTPS ✅

- **BE**: helmet (default set: nosniff, frameguard, noSniff, hidePoweredBy...) + HSTS 1 năm includeSubDomains chỉ prod (dev http không áp).
- **FE** (next.config headers): `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`.
- HTTPS: Caddy auto-TLS Let's Encrypt, redirect 80→443.
- `Cache-Control: no-store` middleware cho mọi API path ngoài `/uploads/` (chặn proxy/browser cache dữ liệu cá nhân).

### 19. Disable debug & prod settings ✅

- Nest logger: prod chỉ `['warn', 'error']`, dev full.
- Không có `console.log` trong backend src (0 kết quả khi grep ngoài test).
- Simulated payment methods: tự TẮT khi `NODE_ENV=production` bất kể env (`simulatedMethodsEnabled` fail-closed).
- Stack trace không leak về client (exception filter → Sentry, response chỉ message).
- Sentry: chỉ active khi có `SENTRY_DSN`, noop trong dev/CI; sourcemap không public (disable khi không có auth token).
- Không có debug flag/GraphQL playground/Swagger UI expose.

### 20. Scan dependencies 🔧 VÁ

**Trước:**
- BE prod: 10 vulnerabilities (2 moderate + 8 high): multer 2.2.0 (4 advisory: DoS multipart field names, FD leak, **file size bypass via async fileFilter race**, oversized array index), mysql2 3.15.3 (2 high: plaintext credential leak + decompression-bomb DoS), deepmerge-ts 7.1.5 (stack exhaustion).
- FE: 0 vulnerabilities.

**Đã vá** — `backend/package.json` thêm `overrides`:
```json
"overrides": { "multer": "^2.3.0", "mysql2": "^3.24.4", "deepmerge-ts": "^8.0.2" }
```
(Không thể upgrade trực tiếp vì Prisma 7 pin `mysql2@3.15.3` exact + `@prisma/config` pin `deepmerge-ts@7.1.5` — dùng npm overrides thay vì downgrade Prisma 6 breaking-change.)

**Sau:** `npm audit` (prod + dev): **0 vulnerabilities**. Verified: typecheck BE xanh, 141/141 test BE pass.

**Ghi chú CI**: repo có workflow chạy test — nên thêm bước `npm audit --audit-level=high` vào CI để không tụt lại. `npm audit fix --force` (downgrade prisma 6) KHÔNG nên dùng — overrides an toàn hơn.

---

## Điểm cần theo dõi (không chặn, theo thời gian)

1. **Throttler in-memory** — đúng cho 1 instance; thêm Redis store khi scale BE horizontally.
2. **RLS** — nếu thêm service thứ 2 truy cập DB trực tiếp, bật Postgres RLS trên bảng có `userId`.
3. **`GET /orders/by-code/:code` public** — thiết kế cho khách vãng lai, có rate limit; cân nhắc thêm contact-verify khi có traffic thật lớn.
4. **Agent admin demo password** — `config.py` có fallback `Admin123!` khi thiếu env; prod đã có `ADMIN_EMAIL/ADMIN_PASSWORD` bắt buộc (seed fail-fast). Nên bỏ fallback mặc định khi ra production thật.
5. **CI audit step** — thêm `npm audit --audit-level=high` vào GitHub Actions để phát hiện advisory mới.
