# Vận hành production (VPS + Docker)

## 1. Domain + DNS (làm trước mọi thứ)

1. Mua domain, tạo bản ghi DNS `A @ → <IP-VPS>` (và `A www → <IP-VPS>` nếu dùng).
2. Chờ DNS lan tỏa: `dig +short shop.example.com` phải trả về IP VPS.
3. Caddy trong `docker-compose.prod.yml` sẽ tự xin TLS Let's Encrypt khi
   container chạy lần đầu (cần port 80/443 mở ra internet).

## 2. Secrets (không bao giờ commit)

```bash
cp .env.prod.example .env.prod
openssl rand -hex 32   # dán vào JWT_SECRET
```

Điền `DOMAIN`, `POSTGRES_PASSWORD` mạnh, `JWT_SECRET` mới. File `.env.prod`
đã gitignored — chỉ tồn tại trên VPS.

## 3. Deploy lần đầu

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
docker compose -f docker-compose.prod.yml exec backend npm run seed
```

`npm run seed` tạo admin từ `ADMIN_EMAIL`/`ADMIN_PASSWORD` trong `.env.prod`
— **không đặt 2 biến này thì seed từ chối chạy ở production** (guard chống
mật khẩu mặc định). Đăng nhập và đổi mật khẩu ngay sau khi tạo.
Chạy lại seed về sau là an toàn: sản phẩm merchant đã sửa (giá/mô tả...)
được giữ nguyên, seed chỉ thêm mới hoặc đồng bộ SP chưa ai đụng tới.

Kiểm tra: `https://<DOMAIN>/health` (qua `/backend`? trực tiếp backend không
public — check log `docker compose ... logs backend`), trang chủ 200,
đăng nhập admin, tạo 1 đơn COD test rồi hủy.

## 4. VNPay production

1. Lấy `VNPAY_TMN_CODE` + `VNPAY_HASH_SECRET` production ở merchant portal,
   điền vào `.env.prod`, **đặt `VNPAY_ENV=production`** (đổi sang cổng thật;
   thiếu TMN code khi ở chế độ production thì backend throw, không lén
   chạy sandbox), `up -d` lại backend.
2. Trong portal VNPay, đăng ký:
   - Return URL: `https://<DOMAIN>/backend/payments/vnpay/return`
   - IPN URL: `https://<DOMAIN>/backend/payments/vnpay/ipn`
3. Ma trận test bắt buộc (dùng thẻ test trước, rồi 1 giao dịch thật mệnh giá nhỏ):
   - [ ] Thanh toán thành công → đơn PAID, giỏ clear, `/orders/<code>?paid=1`
   - [ ] Hủy giữa chừng ở cổng VNPay → đơn ở PENDING, giỏ còn nguyên
   - [ ] Thẻ sai/response code khác 00 → payment FAILED, đơn PENDING
   - [ ] F5 trang return nhiều lần → không double-settle (idempotent)
   - [ ] Đối chiếu `txnRef` trong DB với sao kê merchant portal cuối ngày
4. Lưu ý code: `expectedVnd` đã đóng băng lúc tạo URL nên đổi giá sau đó
   không làm lệch đối soát; mỗi đơn giới hạn 3 payment PENDING;
   `POST /payments/vnpay/create` throttle 10/phút chống spam link.
5. Đối soát cuối ngày (bắt buộc khi thu tiền thật): query DB
   `SELECT "txnRef", status FROM "Payment" WHERE method='vnpay'` so với sao
   kê merchant portal — `txnRef` nào SUCCESS ở cổng mà PENDING ở DB thì
   kiểm tra IPN có tới không (firewall/log `vnp_ResponseCode`); lệch amount
   thì tra `expectedVnd` vs `totalVnd` lúc tạo link.
6. Xoay key VNPay (TMN/HASH_SECRET): đổi ở portal → cập nhật `.env.prod` →
   `up -d --build backend` restart (BE đọc env lúc khởi động, không hot-reload).
   Key cũ chết ngay — link thanh toán tạo trước đó vẫn settle được vì
   checksum verify bằng key mới sẽ FAIL → khách bấm link cũ nhận
   `reason=checksum`, tạo link mới là xong. Không downtime DB.

## 5. Backup

Stack prod có sẵn service `db-backup` chạy sẵn trong compose (không cần
crontab VPS): pg_dump mỗi sáng 02:00, giữ 14 bản (`BACKUP_KEEP`), file nằm
ở `./backups/` trên host. Xem log: `docker compose ... logs db-backup`.

**Offsite (bắt buộc khi có data khách thật):** backup cùng ổ VPS với DB —
mất ổ là mất cả hai. Compose có sidecar `db-offsite` (image rclone) tự đẩy
bản mới nhất lên remote 03:00 mỗi sáng — **không phụ thuộc crontab VPS**
(cron trên host hay bị quên khi dựng máy mới). Cài đặt 1 lần:

```bash
# 1) Cấu hình remote rclone trên host (B2/S3/...), đặt tên remote, vd "b2":
rclone config
# 2) Điền vào .env.prod rồi `docker compose ... up -d db-offsite`:
#   OFFSITE_REMOTE="b2:aurel-backups"
#   OFFSITE_RCLONE_CONFIG="/root/.config/rclone/rclone.conf"
```

Sidecar verify size remote = size local sau mỗi lần đẩy (đẩy nửa vời sẽ báo
`SIZE LỆCH`), và tự `rclone delete --min-age OFFSITE_KEEPd` để giữ vòng đời
remote dài hơn local (local 14 bản ~2 tuần, remote 30 ngày) — bảo vệ khi dữ
liệu hỏng âm thầm đã lan vào cả bản local. Chưa đặt `OFFSITE_REMOTE` thì
sidecar ngủ êm, chỉ giữ backup local. Xem log:
`docker compose ... logs db-offsite`.

`scripts/offsite-backup.sh` vẫn dùng được cho máy không chạy compose (đẩy
thủ công / cron riêng) — cùng intent, không có verify size.

**Restore drill (mỗi quý 1 lần):** backup chưa restore thử = chưa có backup.
Sidecar tự verify ~tuần 1 lần (restore vào DB scratch + so số bảng). Ngoài
ra nên drill tay trên DB rỗng mỗi quý:

```bash
./scripts/restore-db.sh backups/aurel-YYYYMMDD-HHMMSS.sql.gz "-f docker-compose.prod.yml --env-file .env.prod"
# nhập DELETE để xác nhận → kiểm tra đếm đơn/user → migrate deploy nếu schema cũ
```

Khi có offsite, mỗi quý drill **từ bản remote** (không phải bản local) 1 lần
— kéo file về rồi restore, để chắc chắn chain local→remote→restore thật sự
chạy được:

```bash
rclone copy "b2:aurel-backups/aurel-<stamp>.sql.gz" /tmp/ \
  && ./scripts/restore-db.sh /tmp/aurel-<stamp>.sql.gz "-f docker-compose.prod.yml --env-file .env.prod"
```

## 6. Cập nhật / rollback

- Cập nhật tay (không qua CI): `git pull`, backup trước, migrate trước
  (`run --rm --no-deps backend npx prisma migrate deploy`), rồi
  `up -d --build backend frontend agent caddy meilisearch` — KHÔNG `up -d`
  toàn file (tránh restart `db`/`db-backup` không cần thiết). Xong kiểm tra
  smoke: backend `/health` + trang chủ 200 (CI deploy tự làm bước này).
- Rollback: `docker compose ... up -d --build` lại ở commit cũ
  (`git checkout <sha>`). Migrate DOWN không tự động — chỉ rollback code
  khi migration mới tương thích ngược; ngược lại phải viết migration sửa.

## 7. Giám sát tối thiểu

- UptimeRobot/Uptime Kuma check `https://<DOMAIN>/` + backend `/health`
  (qua container) mỗi 5 phút, báo Telegram khi down.
- `docker compose -f docker-compose.prod.yml logs -f backend` khi tra sự cố
  — mọi request đều có `[request-id]` trong log + header `X-Request-Id`,
  ghép chuỗi log↔Sentry↔khách báo lỗi bằng id này.
- **Sentry (nên bật, miễn phí)**: tạo project ở sentry.io (platform
  "Next.js" cho FE + "Node.js" cho BE), lấy DSN điền:
  - `SENTRY_DSN` (backend — lỗi 5xx, exception chưa xử lý)
  - `NEXT_PUBLIC_SENTRY_DSN` (frontend — UI crash qua error boundary)
  Rồi `up -d --build backend frontend`. Bỏ trống cả 2 = noop an toàn.
  Sentry cảnh báo email/Slack ngay khi có lỗi mới — không cần ai trông 24/7.

## 8. Xoay secret (khi lộ / nhân sự nghỉ)

Chi tiết ma trận xem `docs/AGENT-PERMISSIONS.md` §6. Tóm tắt thao tác:

| Lộ gì | Làm gì |
|---|---|
| Session user / nhân sự nghỉ | Đổi pass user đó (hoặc admin đổi role về CUSTOMER) → `tokenVersion++` giết mọi token cũ ngay |
| `AGENT_MERCHANT_TOKEN` | Đổi token trong `.env.prod` + restart host agent; token cũ chết ngay |
| `AGENT_API_KEY` | Xoay ở provider + `agent/.env`, restart host |
| `JWT_SECRET` | Xoay + restart BE (mọi session/delegation/sig chết cùng lúc — chấp nhận, báo user đăng nhập lại) |
| `VNPAY_HASH_SECRET` | Đổi ở portal + `.env.prod`, restart BE (xem §4 mục 6) |

## 9. Media tĩnh qua CDN (R2/S3 + domain riêng, optional)

Video hero (mp4 nặng) + ảnh catalog đang serve từ chính VPS — vài nghìn
lượt xem là hết băng thông. FE đã hỗ trợ prefix qua
`NEXT_PUBLIC_MEDIA_BASE_URL` (helper `src/lib/media.ts`): trống = serve
local như cũ, có giá trị = mọi `/images/*` + video hero trỏ sang CDN.

1. Tạo R2 bucket (Cloudflare, egress rẻ) + custom domain
   `media.<DOMAIN>` + public read cho 2 prefix `images/*`,
   `swiss-luxury-watches-and-chronographs/*`.
2. Sync lần đầu + mỗi khi thêm ảnh mới vào `public/`:
   `rclone sync ./public/ r2:aurel-media/ --include '{images/**,swiss-luxury-watches-and-chronographs/**}'`
   (JSON-LD cũng tự trỏ ảnh sang CDN để Google lấy được).
3. Điền `NEXT_PUBLIC_MEDIA_BASE_URL="https://media.<DOMAIN>"` vào
   `.env.prod`, build lại frontend. Verify: mở trang, ảnh/video load từ
   domain media (DevTools → Network).
4. Lưu ý: `preload="none"` KHÔNG đặt cho video hero vì nó `autoPlay`
   (đặt cũng vô nghĩa — autoplay vẫn tải). Tiết kiệm thật đến từ CDN
   (băng thông VPS), không phải từ bớt byte (trình duyệt vẫn cần byte đó).

## 10. Các dịch vụ tùy chọn (đều có fallback an toàn khi bỏ trống)

- **Ảnh upload**: điền `S3_*` trong `.env.prod` để lưu ảnh lên S3/R2/MinIO;
  bỏ trống = lưu disk volume `uploads/` (vẫn an toàn vì có volume mount).
- **Thông báo**: `TELEGRAM_*` (admin nhận đơn mới/paid ngay lập tức) và
  `SMTP_*` (email xác nhận cho khách) — nên bật ít nhất Telegram.
- **Hóa đơn điện tử**: mỗi đơn PAID tự sinh record Invoice. Đủ `EINVOICE_*`
  thì backend tự phát hành qua API nhà cung cấp; không thì invoice ở trạng
  thái PENDING_ISSUE để kế toán phát hành qua portal và đối chiếu bằng
  `externalRef`/số hóa đơn.
- **Form đặt hẹn / bespoke**: lưu table `Inquiry`, xem ở
  `GET /inquiries` (admin token) — concierge xử lý theo trạng thái
  NEW → CONTACTED → CLOSED.
- **Meilisearch (search catalog)**: service `meilisearch` trong compose prod
  (image pin `v1.53.2`, volume `meili_data`). `MEILI_MASTER_KEY` trong
  `.env.prod` là **bắt buộc** (compose fail-fast khi thiếu) — sinh bằng
  `openssl rand -hex 16`. Backend index toàn bộ catalog lúc start + upsert
  sau mỗi admin write; nếu service chết, search tự fallback Prisma `contains`
  (catalog vẫn dùng được bình thường). Muốn verify:
  `docker compose -f docker-compose.prod.yml ps meilisearch` (status healthy)
  và test search có dấu lỗi chính tả trên trang catalog.
- **Uptime monitor ngoài**: trỏ 1 dịch vụ (UptimeRobot...) vào
  `https://<DOMAIN>/backend/health` mỗi 5 phút — cảnh báo khi backend/DB xuống.
