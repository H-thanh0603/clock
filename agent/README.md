# AI Agents — Aurel & Co. (shopping + merchant)

Phần AI Agent của đồ án clock: tích hợp [anthropics/commerce-agents](https://github.com/anthropics/commerce-agents)
(Apache-2.0, vendor tại `vendor/`) vào website Aurel & Co.

Hai agent chạy trên dữ liệu **thật** của backend NestJS:

| Agent | Dành cho | Làm gì |
|---|---|---|
| **Shopping** (concierge) | Khách hàng | Tìm kiếm, so sánh, tư vấn đồng hồ, tự điền giỏ hàng, tra cứu đơn theo mã `AC-…`, trả lời chính sách (đổi trả, khiếu nại, vận chuyển) |
| **Merchant** (trợ lý vận hành) | Admin | Số liệu dashboard, alert tồn kho thấp, đơn PENDING, **đề xuất thay đổi giá/tồn kho/hiển thị** theo mô hình staged change (propose → preview → approve → apply) |

Không có đơn hàng nào được đặt tự động: giỏ hàng được agent điền, khách bấm
checkout như bình thường (`/checkout` của FE). Mọi ghi của merchant agent đều
**staged** — chỉ khi operator duyệt thì mới PATCH xuống BE (và BE ghi
`ProductEvent` audit trail như mọi thao tác admin khác).

## Kiến trúc

```
Client (chat UI / curl)
   │ SSE
   ▼
agent host (FastAPI, aurel_agents/host.py)          :8100
   │  ShoppingAgent / MerchantAgent  ← vendor/ (commerce-agents)
   │      │ tools/gates/skills của upstream
   │      ▼
   │  AurelStorefront / AurelMerchant  (adapter — code của đồ án)
   │      │
   │      ▼
   │  ClockClient (httpx: JWT cookie + CSRF double-submit)
   │      │
   ▼      ▼
Backend clock (NestJS :4000) → PostgreSQL
```

Ba lớp trách nhiệm:

1. **`vendor/`** — 5 package Python của commerce-agents, **không sửa** (đánh dấu
   `linguist-generated` qua `.gitattributes`): prompt, skills, tool contracts,
   provenance gates, staged-change ledger. `UPSTREAM_COMMIT.txt` ghi commit gốc.
2. **`aurel_agents/`** — code của đồ án:
   - `clock_client.py`: HTTP client một-user cho REST API clock. Tự cấp CSRF
     double-submit token (`/auth/csrf`), gắn header `x-csrf-token` cho mọi
     method ghi, 401 → login lại rồi retry. Register-if-new cho shopper demo,
     admin bắt buộc login (không tự tạo admin).
   - `shopping/backend.py`: map `GET /products`, `/products/{slug}`, `POST/PATCH/DELETE /cart`,
     `/orders/mine`, `/orders/by-code/{code}` lên `StorefrontBackend`. Policies
     là nội dung tĩnh đồng bộ `src/app/legal/` (clock không có API policy).
     Checkout handoff trỏ về `/checkout` của FE — model không bao giờ thấy URL.
   - `merchant/backend.py`: map `/admin/stats`, `/admin/products`, `/admin/orders`
     lên `MerchantBackend`. Staged change dùng `ChangeLedger` của upstream;
     `apply_change` là nơi duy nhất ghi thật (`PATCH /admin/products/{slug}`).
     Campaign/promotion → `ChangeNotApplicable` (clock không có hệ thống này —
     model sẽ nói rõ với operator thay vì giả vờ làm).
   - `config.py`: provider trừu tượng. `AsyncAnthropic(base_url=…)` trỏ tới
     **bất kỳ gateway tương thích Anthropic Messages API** — z.ai, OpenRouter,
     LiteLLM, Bedrock/Vertex proxy... Không phụ thuộc key Anthropic trực tiếp.
   - `host.py`: FastAPI app, 2 endpoint chat SSE + health; transcript in-memory
     theo session.

## Chạy

Yêu cầu: backend clock đang chạy (docker compose, đã migrate + seed), Python 3.11+.

```bash
cd agent
cp .env.example .env          # điền AGENT_API_KEY (+ AGENT_BASE_URL nếu qua gateway)
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn aurel_agents.host:app --port 8100
```

Chat thử:

```bash
curl -N -X POST localhost:8100/shop/chat \
  -H 'content-type: application/json' \
  -d '{"message": "Tôi muốn mua tourbillon dưới 150k USD, còn chiếc nào?"}'

curl -N -X POST localhost:8100/merchant/chat \
  -H 'content-type: application/json' \
  -d '{"message": "Cho tôi xem tình hình kinh doanh tháng này"}'
```

Trả về là stream SSE: `session` → (`text_delta` | `tool_call` | `ui` | `cart_update`
| `change_update`) → `done`. Event `ui` chứa component (product carousel, plan
checklist, staged-change card...) render được trong FE nếu muốn tích hợp sâu.

## Test

```bash
cd agent && source .venv/bin/activate
pytest            # 21 test: CSRF, login/register, retry 401, mapping 2 adapter,
                   # staged-change lifecycle, guardrail, ChangeNotApplicable
ruff check .      # lint sạch
```

Test dùng `respx` mock toàn bộ HTTP — không cần BE thật, không cần API key.

## Ghi chú tích hợp & thay đổi ngoài agent/

- `backend/Dockerfile`: thêm `ARG/ENV DATABASE_URL` (prisma.config.ts cần biến
  này ngay khi `prisma generate`), context build chuyển về repo-root và copy
  `src/data/{products,straps,format}.ts` vào image để `npm run seed` chạy được
  trong container (seed import `../../src/data/products`).
- `backend/src/products/products.module.ts`: thêm `exports: [ProductsService]` —
  `AdminService` inject `ProductsService` qua `AdminModule` nhưng thiếu exports
  làm Nest DI lỗi khi khởi động (`UnknownDependenciesException`).
- `docker-compose.yml`: mount pgdata theo chuẩn Postgres 18 (`/var/lib/postgresql`
  thay vì `/var/lib/postgresql/data` — image 18+ từ chối mount cũ).

## Đạo đức & an toàn kế thừa từ upstream

- **Fencing + provenance gates**: model chỉ được phép nhắc id sản phẩm nó đã thấy
  trong session; giỏ chỉ nhận id đã qua search/details.
- **Caps**: số lượng mỗi dòng, số dòng, % đổi giá mỗi change, số restock... chặn
  ở tool-call layer trên mọi path.
- **Staged writes**: merchant agent không bao giờ ghi thẳng; operator duyệt từng change.
- **Memory validation**: upstream validate + lọc fact trước khi lưu.

Xem thêm `vendor/docs/safety.md`, `vendor/docs/backends.md` (bản gốc tiếng Anh).

## License

- `vendor/` — của Anthropic PBC, Apache-2.0 (giữ nguyên `vendor/LICENSE`).
- Phần còn lại của `agent/` — theo license của đồ án clock.
