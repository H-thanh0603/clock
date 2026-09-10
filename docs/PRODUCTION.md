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
   không làm lệch đối soát; mỗi đơn giới hạn 3 payment PENDING.

## 5. Backup

Stack prod có sẵn service `db-backup` chạy sẵn trong compose (không cần
crontab VPS): pg_dump mỗi sáng 02:00, giữ 14 bản (`BACKUP_KEEP`), file nằm
ở `./backups/` trên host. Xem log: `docker compose ... logs db-backup`.

Tùy chọn thêm cron rsync nếu vẫn muốn nhân bản ra chỗ khác:

```cron
0 3 * * * rsync -a /opt/clock/backups/ backup-host:/srv/aurel-backups/
```

Đồng bộ `backups/` ra chỗ khác (rsync/S3) — backup cùng ổ đĩa với DB thì
mất ổ là mất cả hai. Test restore mỗi quý trên DB rỗng.

## 6. Cập nhật / rollback

- Cập nhật: `git pull && docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`
  rồi `exec backend npx prisma migrate deploy`. (Sau khi có CI — mục P1.6 —
  bước này tự động.)
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

## 7. Các dịch vụ tùy chọn (đều có fallback an toàn khi bỏ trống)

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
- **Uptime monitor ngoài**: trỏ 1 dịch vụ (UptimeRobot...) vào
  `https://<DOMAIN>/backend/health` mỗi 5 phút — cảnh báo khi backend/DB xuống.
