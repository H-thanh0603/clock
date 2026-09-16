# Ma trận quyền — AI Agents & Backend (Aurel & Co.)

Một trang duy nhất trả lời: **ai (người/agent) được làm gì, qua cửa nào,
giới hạn nào, thu hồi bằng cách nào.** Mọi khẳng định đều có file dẫn chứng
— code là nguồn sự thật, tài liệu này chỉ là bản đồ.

> Nguyên tắc nền: agent KHÔNG có quyền gì riêng. Mọi thao tác của agent đều
> mượn quyền của một tài khoản đã tồn tại (shopper demo / user được delegate /
> admin service account) và chịu đúng guard như người dùng tài khoản đó.

## 1. Role & danh tính

| Danh tính | Cấp ở đâu | Sống bao lâu |
|---|---|---|
| Khách vãng lai (chưa login) | Không có — dùng API public + `by-code` tối thiểu | — |
| CUSTOMER (session cookie `aurel_session`) | `POST /auth/login\|register` | 7 ngày, giết bằng `tokenVersion++` (logout/đổi pass) |
| ADMIN (session, role check trong DB mỗi request) | Seed/cấp tay trong DB | Như trên |
| Delegation (cookie `aurel_delegation`, aud `aurel-agent`) | `POST /auth/delegation` — **chỉ CUSTOMER**, admin xin là 403 | 30 phút, user gia hạn (agent không tự gia hạn) |
| Shopper demo (`shop+<prefix>@…`, tự register) | Agent host tạo khi chat session mới | Cron BE dọn sau 24h không đơn |
| Service account merchant agent | Seed từ `AGENT_ADMIN_EMAIL/PASSWORD`, role ADMIN | Tay (đổi pass trong DB) |

Nguồn: `backend/src/common/guards.ts`, `session.ts`, `auth.controller.ts:89-99`,
`agent/aurel_agents/session_pool.py`, `backend/src/agents/agent-shopper-cleanup.service.ts`.

## 2. Backend API — ai gọi được gì

| Nhóm endpoint | Vãng lai | CUSTOMER | ADMIN |
|---|---|---|---|
| `GET /products`, detail SP đang bán | ✅ | ✅ | ✅ |
| `POST /orders` (tạo đơn, consent bắt buộc) | ✅ | ✅ | ✅ |
| `GET /orders/by-code/:code` | status tối thiểu | full nếu chính chủ/contact/sig | full nếu chính chủ |
| Hủy đơn vãng lai bằng mã + contact (`by-code/:code/cancel`, 10/phút) | ✅ | — | — |
| Hủy đơn chính chủ (`:id/cancel`) | ❌ | ✅ | ✅ |
| `GET /orders/mine`, cart, wishlist | ❌ | ✅ (đúng userId session) | ✅ (tài khoản của mình) |
| `POST /auth/delegation` | ❌ | ✅ | ❌ (403 cố ý) |
| `GET /admin/*` (stats, orders, users, products CRUD, uploads, promotions, campaigns, metrics), `GET /inquiries` | ❌ | ❌ (403) | ✅ (`AdminGuard` check role DB) |
| Đổi trạng thái đơn, refund (`REFUNDED` + refundRef), xác nhận thu tay (+ paymentRef) | ❌ | ❌ | ✅ |
| `POST /inquiries` (rate-limit 5/phút) | ✅ | ✅ | ✅ |

Chi tiết tra cứu tối thiểu + sig xem đơn: `orders.service.ts:byCode/signOrderCode`.

## 3. Agent host (`:8100`, sau Caddy là `/agent/*`)

| Endpoint | Ai gọi | Ghi chú |
|---|---|---|
| `POST /shop/chat` | Công khai (rate/IP + budget session + budget toàn host) | Giỏ riêng mỗi session; delegation thì dùng giỏ/đơn thật của user |
| `POST /merchant/chat`, `GET /merchant/changes`, approve/discard, `POST /shop/monitor/run` | Token `x-agent-token` (**bắt buộc ở prod** — thiếu thì host không chạy) | FE prod gọi qua Next route `/api/agent/*` (verify ADMIN + giữ token ở server) |
| `GET /alerts?scope=shop` | Công khai nhưng chỉ alert watch của chính session | Ticket/kho/PENDING không lọt ra |
| `GET /alerts` (ops), `GET /activity` | Token như merchant | Chứa khiếu nại + actor/session → không public |

Nguồn: `agent/aurel_agents/host.py`, `src/app/api/agent/[...path]/route.ts`.

## 4. Merchant agent được / không được gì

| Được | Không được (không tồn tại tool nào) |
|---|---|
| Đọc stats, metrics, products, PENDING orders | Đặt đơn / checkout (`create_order` **không tồn tại theo thiết kế**) |
| **Stage** change (giá/tồn kho/ẩn-hiện/promotion/campaign) vào ledger | Ghi thẳng — mọi write qua `apply_change` sau duyệt |
| `apply_change` sau khi operator duyệt (chat hoặc API), kèm drift-check + ProductEvent audit | Hoàn tiền, xóa SP/user, đổi role, chạm payments/users |
| Caps cứng của ledger: đổi giá ≤ 20%/lần, KM ≤ 50%, campaign ≤ $10k (`merchant_agent/config.py`) | Vượt cap, promotion chồng lên SP đang KM (BE chặn 409) |

## 5. Secrets — sống ở đâu, cấm đi đâu

| Secret | Sống ở | TUYỆT ĐỐI KHÔNG |
|---|---|---|
| `JWT_SECRET` | BE (+ seed/dev local) | Xuống browser, vào log |
| `AGENT_MERCHANT_TOKEN` | Host agent + Next server (env server-side) | `NEXT_PUBLIC_*` (xuống bundle = public) |
| `AGENT_API_KEY` | Host agent (`agent/.env`, không commit) | Mọi nơi khác |
| `VNPAY_HASH_SECRET`, `MEILI_MASTER_KEY`, `POSTGRES_PASSWORD`, `ADMIN_PASSWORD`, SMTP/Telegram, `EINVOICE_*` | `.env.prod` trên VPS (không commit) | Git, log, bundle FE |
| Được ra browser | Chỉ `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_AGENT_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_MEDIA_BASE_URL` | — |

## 6. Thu hồi khi lộ / nhân sự nghỉ

| Tình huống | Làm gì |
|---|---|
| Lộ session user / nhân sự nghỉ | Đổi pass → `tokenVersion++` giết mọi token cũ (logout cũng vậy) |
| Lộ `AGENT_MERCHANT_TOKEN` | Đổi token ở `.env.prod` + restart host; token cũ chết ngay (so chuỗi, không JWT) |
| Lộ `AGENT_API_KEY` | Xoay key ở provider + `agent/.env`, restart host |
| Lộ `JWT_SECRET` | Xoay + restart BE (mọi session/delegation/sig cũ chết cùng lúc — chấp nhận) |
| Admin nghỉ việc | Đổi role về CUSTOMER trong DB (guard đọc DB mỗi request → hiệu lực ngay) + đổi `ADMIN_PASSWORD`/`AGENT_ADMIN_PASSWORD` nếu họ từng biết |

## 7. Cấm kỵ vĩnh viễn (ghi để khỏi ai "tiện tay" mở)

1. Không thêm tool `create_order` / auto-checkout cho bất kỳ agent nào.
2. Không expose tool merchant (giá/kho/KM/approve) ra WebMCP/trang public nếu sau này làm.
3. Không đưa token merchant vào `NEXT_PUBLIC_*`.
4. Không cho agent chạm DB trực tiếp — mọi thao tác qua REST API (giữ nguyên).
5. Không tắt `AGENT_REQUIRE_MERCHANT_TOKEN` ở prod.
