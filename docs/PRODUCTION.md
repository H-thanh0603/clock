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

`npm run seed` tạo admin `admin@aurel.local / Admin123!` — **đăng nhập và
đổi mật khẩu ngay**, sau đó xóa dòng creds này khỏi đầu (không để lại).

Kiểm tra: `https://<DOMAIN>/health` (qua `/backend`? trực tiếp backend không
public — check log `docker compose ... logs backend`), trang chủ 200,
đăng nhập admin, tạo 1 đơn COD test rồi hủy.

## 4. VNPay production

1. Lấy `VNPAY_TMN_CODE` + `VNPAY_HASH_SECRET` production ở merchant portal,
   điền vào `.env.prod`, `up -d` lại backend.
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

Cron trên VPS (2h sáng mỗi ngày, giữ 14 bản):

```cron
0 2 * * * cd /opt/clock && ./scripts/backup-db.sh "-f docker-compose.prod.yml --env-file .env.prod" 14 >> /var/log/aurel-backup.log 2>&1
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
- `docker compose -f docker-compose.prod.yml logs -f backend` khi tra sự cố.
- Sentry (optional): gắn DSN vào cả FE/BE để bắt lỗi runtime của khách.
