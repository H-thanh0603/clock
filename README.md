# Aurel & Co. — E-commerce đồng hồ cao cấp

Next.js 16 (frontend + BFF-ish) · NestJS 11 + Prisma 7 (backend) · PostgreSQL 18 · VNPay · Docker/Caddy.

> Tài liệu vận hành production: [`docs/PRODUCTION.md`](docs/PRODUCTION.md) · Bảng tự audit: [`docs/AUDIT.md`](docs/AUDIT.md)

## Kiến trúc

```
Browser → Next.js (FE :3000, /backend/* rewrite → BE)
       → NestJS (BE :4000, REST + cookie JWT session)
       → PostgreSQL (:5432)
Caddy: TLS tự động, reverse proxy FE + /backend/* (prod)
```

- **Frontend** (`src/`): Next.js App Router, Tailwind. Server components gọi BE qua `lib/api`; client components qua `lib/api-client` (kèm CSRF double-submit).
- **Backend** (`backend/`): NestJS modular monolith — auth (JWT + tokenVersion), products, cart, wishlist, orders (conditional update chống oversell), payments (VNPay HMAC + idempotent settle trong 1 transaction), inquiries, invoices, notify (Telegram/SMTP), admin. Prisma schema: `backend/prisma/schema.prisma`.
- **Dev**: docker compose (Postgres + backend), FE chạy `next dev` ngoài compose.
- **Prod**: `docker-compose.prod.yml` (db + db-backup + backend + frontend + caddy).

## Chạy local (dev)

Yêu cầu: Node 22+, Docker.

```bash
# 1. Env
cp .env.example .env            # BACKEND_URL=http://localhost:4000
cp backend/.env.example backend/.env 2>/dev/null || true
# JWT_SECRET dev: chuỗi bất kỳ ≥32 ký tự

# 2. Postgres + backend (docker compose dev)
docker compose up -d --build    # db :5433, backend :4000

# 3. Migrate + seed (admin + 6 SP demo)
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed

# 4. Frontend
npm install
npm run dev                     # http://localhost:3100
```

Đăng nhập admin: `admin@aurel.local` / `Admin123!` (**chỉ dev** — seed prod bắt buộc `ADMIN_PASSWORD` env, thiếu thì từ chối chạy).

Chạy test:

```bash
npm test                        # FE (vitest)
cd backend && npm test          # BE — 97 test: tiền, auth, csrf, expire...
npx tsc --noEmit                 # typecheck FE
cd backend && npx tsc --noEmit -p tsconfig.json   # typecheck BE
```

## Deploy production (tóm tắt)

Chi tiết đầy đủ: `docs/PRODUCTION.md`. Tóm tắt:

```bash
# Trên VPS: trỏ DNS A → IP, mở 80/443
cp .env.prod.example .env.prod   # điền DOMAIN, POSTGRES_PASSWORD, JWT_SECRET
                                # (openssl rand -hex 32), ADMIN_EMAIL/PASSWORD,
                                # VNPAY_*, optional: S3, Telegram, SMTP, Sentry
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml exec backend npx prisma migrate deploy
docker compose -f docker-compose.prod.yml exec backend npm run seed   # lần đầu
```

Sau đó deploy qua GitHub Actions (workflow **Deploy production** — thứ tự: backup → build → migrate → swap container).

## Quy ước quan trọng

- **Tiền**: giá USD là nguồn sự thật, VND = USD × tỷ lệ (`common/pricing.ts`); VNPay settle idempotent, `expectedVnd` đóng băng lúc tạo URL. Không bao giờ tin giá client.
- **Thanh toán mô phỏng** (`centurion/escrow/deposit/cod`): tự động TẮT khi `NODE_ENV=production`.
- **Migrations**: chỉ thêm — cột/bảng mới, không đổi/xóa (không có migrate DOWN tự động). Rollback = code cũ + forward-fix migration.
- **Env secrets**: `.env`, `.env.prod` KHÔNG commit. `.env*.example` là mẫu.
- **Backup**: sidecar `db-backup` pg_dump 02:00 hằng ngày giữ `BACKUP_KEEP` bản + `scripts/backup-db.sh` thủ công; restore: `scripts/restore-db.sh <file>` (nên chạy thử 1 lần mỗi quý).
