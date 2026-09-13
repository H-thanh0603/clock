# AI Agents — Aurel & Co. (shopping + merchant)

Phần AI Agent của đồ án clock: tích hợp [anthropics/commerce-agents](https://github.com/anthropics/commerce-agents)
(Apache-2.0, vendor tại `vendor/`) vào website Aurel & Co.

Hai agent chạy trên dữ liệu **thật** của backend NestJS:

| Agent | Dành cho | Làm gì |
|---|---|---|
| **Shopping** (concierge) | Khách hàng | Tìm kiếm, so sánh, tư vấn đồng hồ, tự điền giỏ hàng, tra cứu đơn theo mã `AC-…`, trả lời chính sách (đổi trả, khiếu nại, vận chuyển) |
| **Merchant** (trợ lý vận hành) | Admin | Số liệu dashboard + time-series (`/admin/metrics`), alert tồn kho thấp, đơn PENDING, **đề xuất thay đổi giá/tồn kho/hiển thị/khuyến mãi/campaign** theo mô hình staged change (propose → preview → approve → apply, duyệt qua chat hoặc `POST /merchant/changes/{id}/approve`) |

## Tính năng agent-only (chatbot không làm được)

Chatbot chỉ tồn tại khi có user message — 4 tính năng dưới cần **tiến trình
dài hạn + loop nền + tool ghi trạng thái**, thứ chatbot không có:

1. **Proactive monitoring** — merchant agent TỰ chạy mỗi
   `AGENT_MONITOR_INTERVAL_S` giây (mặc định 300) mà không ai hỏi: quét
   tồn kho thấp, đơn PENDING tích tụ, publish alert ra feed (`GET /alerts`).
   FE poll feed → admin thấy ngay không cần mở chat.
2. **Watch "báo tôi khi về hàng/giảm giá"** — khách nói "báo tôi khi
   chiếc X về lại hàng / giảm 10%"; shopping agent lưu qua tool `set_watch`
   (PresentationExtension — đúng seam upstream, không sửa vendor), loop nền
   kiểm tra định kỳ và thông báo khi khớp. Watch persist qua restart.
3. **Task tự trị multi-step** — loop tool của agent (search → details →
   so sánh → điền giỏ) đã chạy tự trị theo mục tiêu; watch mở rộng thành
   task chạy **sau khi user rời đi** (deferred task).
4. **Cross-agent handoff** — khách khiếu nại với concierge ( heuristic từ
   khoá "khiếu nại/bị trầy/chưa nhận được...") → tự mở ticket vào
   `data/tickets.json` + alert cho merchant agent; merchant scan vòng sau
   đọc ticket và đề xuất xử lý. 2 agent cộng tác, chatbot đơn không có
   khái niệm này.

Endpoints mới: `GET /alerts`, `GET /shop/watches?session_id=`,
`POST /shop/watches/{id}/cancel`, `POST /shop/monitor/run` (chạy 1 vòng
ngay — demo). Data: `data/{alerts,watches,tickets}.json`. Event SSE mới:
`handoff` (concierge xác nhận đã ghi ticket). UI component mới:
`watch_confirmed` (card xác nhận watch cho FE).

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
    - `merchant/backend.py`: map `/admin/stats`, `/admin/products`, `/admin/orders`,
      `/admin/metrics`, `/admin/promotions`, `/admin/campaigns` lên `MerchantBackend`.
      Staged change dùng `ChangeLedger` của upstream (persist `data/ledger-merchant.json`);
      `apply_change` là nơi duy nhất ghi thật (`PATCH /admin/products/{slug}`,
      `POST /admin/promotions` + giá KM, `POST/PATCH /admin/campaigns`).
   - `config.py`: provider trừu tượng. `AsyncAnthropic(base_url=…)` trỏ tới
     **bất kỳ gateway tương thích Anthropic Messages API** — z.ai, OpenRouter,
     LiteLLM, Bedrock/Vertex proxy... Không phụ thuộc key Anthropic trực tiếp.
   - `host.py`: FastAPI app, 2 endpoint chat SSE + health; transcript in-memory
     theo session.

## Provider LLM (tùy chọn gateway)

Runtime upstream là Anthropic Messages API, nhưng client trỏ được tới nhiều
provider qua `AGENT_BASE_URL` (đã verify header thực tế cho từng bên):

| Provider | `AGENT_BASE_URL` | `AGENT_AUTH_HEADER` | `AGENT_MODEL` |
|---|---|---|---|
| TokenRouter (đã test E2E) | `https://api.tokenrouter.com` (**không** `/v1` — SDK tự thêm) | `bearer` | `z-ai/glm-5.3-free` (+ `AGENT_MAX_TOKENS=8192`) |
| DeepSeek (Anthropic API gốc) | `https://api.deepseek.com/anthropic` | `x-api-key` (mặc định) | `deepseek-chat`, `deepseek-reasoner` |
| OpenRouter | `https://openrouter.ai/api/v1` | `bearer` | `anthropic/claude-*`, `deepseek/deepseek-chat`, ... |
| LiteLLM proxy | URL proxy của bạn | `x-api-key` | tùy deployment |
| Anthropic trực tiếp | (bỏ trống) | `x-api-key` | `claude-sonnet-5` |

Ghi chú:

- **DeepSeek** hỗ trợ Anthropic API gốc ([docs](https://api-docs.deepseek.com/guides/anthropic_api)) — `tools`/`tool_use`/`tool_result` (cái agent cần) đầy đủ; tên model `claude-*` nếu quên đổi sẽ tự map về model DeepSeek.
- **OpenRouter** có endpoint `/v1/messages` nhưng chỉ chấp nhận `Authorization: Bearer` — nên có `AGENT_AUTH_HEADER=bearer`.
- **LiteLLM** là cầu nối tổng quát nhất: `/v1/messages` dịch sang provider bất kỳ (OpenAI-compatible, Bedrock, Gemini...) — xem `vendor/docs/deployment.md`. Nếu provider không nói Anthropic format, dùng LiteLLM làm lớp dịch thay vì sửa code agent.
- Lưu ý chung: prompt của upstream dựa trên hành vi Claude (tuân thủ tool-call chặt). Model khác càng mạnh càng giữ được chất lượng agent; model nhỏ có thể phá fencing/gates — ưu tiên model tool-calling tốt.

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

## Ba đường chạy (3 runtimes của upstream)

Cùng prompt/skills/tools, khác vòng loop:

| Path | Lệnh | Ghi chú |
|---|---|---|
| **Messages API** (mặc định) | `uvicorn aurel_agents.host:app --port 8100` (hoặc service `agent` trong compose) | host ở đây, grounding + memory đầy đủ |
| **Agent SDK** | `python -m aurel_agents.sdk_console shop --once "..."` / `... merchant --once "..."` (REPL nếu bỏ `--once`) | loop do SDK chạy, backend vẫn Aurel thật |
| **Managed Agents (MCP)** | `python -m aurel_agents.mcp shop` (`:8200/mcp`) / `python -m aurel_agents.mcp merchant` (`:8201/mcp`) | hosted agent trỏ vào; merchant path set `require_host_approval=False` (approval là platform `always_ask`) |

## Prod-hardening của host

- **Transcript persist**: `data/sessions/{session_id}.json` (cap 200 msg) — restart không mất hội thoại.
- **Giỏ isolate theo session**: mỗi chat session có shopper riêng (`shop+<prefix>@...`, tự register) — không dùng chung giỏ như trước. Merchant giữ 1 admin client chung, audit theo `operator:{session}`.
- **Ledger persist**: `data/ledger-merchant.json` — pending changes + audit trail sống qua restart.
- **Approve trực tiếp** (không cần chat): `GET /merchant/changes`, `POST /merchant/changes/{id}/approve|discard` — FE có thể gắn nút Duyệt/Bỏ.
- **Auth merchant**: đặt `AGENT_MERCHANT_TOKEN` thì `/merchant/*` yêu cầu header `x-agent-token`.
- **Rate-limit**: `AGENT_CHAT_RATE_LIMIT_PER_MIN` (mặc định 60 req/phút/IP, `0` = tắt).
- **Docker**: `agent/Dockerfile` + service `agent` trong `docker-compose.yml` (dev `:8100`) và `docker-compose.prod.yml` (Caddy route `/agent/*`, FE prod dùng cùng origin).

## Test

```bash
cd agent && source .venv/bin/activate
pytest            # 39 test adapter (CSRF, login/register, retry 401, mapping,
                   # staged-change lifecycle, guardrail, promotion/campaign thật,
                   # restart-recovery, transcript/ledger/rate-limit/multi-user...)
pytest tests/upstream   # 150 test cross-package của Anthropic — nguyên bản, chỉ sửa
                   # 2 dòng path (REPO_ROOT → vendor/)
ruff check .      # lint sạch (vendor/ + tests/upstream/ được exclude)
```

- Test adapter dùng `respx` mock toàn bộ HTTP — không cần BE thật, không cần API key.
- `tests/upstream/` là 6 suites cross-package của upstream (turn loop, consumption
  paths, system switches, search envelope, role registries, platform seams) —
  chứng minh agent loop vendor hoạt động đúng thiết kế gốc. Để chạy được, repo
  vendor đủ cả 3 đường: `runtime-agent-sdk` + `managed-agents` (MCP servers) +
  `examples/` (mock backend theo upstream). Khác biệt duy nhất với upstream:
  `REPO_ROOT` trỏ vào `vendor/` và `mcp` pin `<2` (upstream viết cho FastMCP 1.x).

## Memory persistence

Host tạo `JsonFileMemoryStore` (file JSON trong `agent/data/`, đã gitignore) cho
từng role và gọi `agent.update_memory(...)` ngay sau khi turn stream xong — đúng
hợp đồng upstream ("run it once the reply has streamed"). Agent giờ **nhớ preference
qua session và qua restart** ("khách thích mặt 40mm" được trích thành fact, lọc
sensitve qua `MemoryWriteFilter`, feed lại vào turn sau qua tier-one facts).
Event `memory` (nếu có fact mới) cũng được emit cuối stream.
Transcript chat persist riêng (`data/sessions/{id}.json`), ledger persist
(`data/ledger-merchant.json`) — xem "Prod-hardening của host" ở trên.

## FE trang /agent

`src/app/agent/page.tsx` — chat UI (2 tab: Khách hàng / Vận hành) consume đúng
event vocabulary phía trên:
- `text_delta` ghép dần; `tool_call`/`progress` hiện status line khi agent gọi tool
- `ui` render **generative components** theo design system Obsidian & Champagne:
  `present_products` → grid card sản phẩm (link sang trang chi tiết), `present_comparison`
  → bảng so sánh (đánh dấu ★ đề xuất, spec map theo label), `present_plan`/`present_guide`
  → checklist, `present_metrics` → tiles số liệu (▲▼ %), `present_change_preview` +
  `change_update` → staged-change card (before → after, "chờ duyệt/applied/discarded")
- `cart_update` → card giỏ hàng + link checkout; `memory` fact được lưu thông suốt
- Cấu hình: `NEXT_PUBLIC_AGENT_URL` (mặc định `http://127.0.0.1:8100`); CORS đã mở
  trong host cho FE dev ở `localhost:3100`

Logic stream tách trong `src/lib/agent-events.ts` (parser + reducer thuần,
test được bằng vitest node-environment — 8 test riêng).

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
- `src/app/agent/page.tsx` + `src/lib/agent-events.ts`: trang chat FE; thêm mục
  nav "AI Concierge" trong `src/components/Header.tsx`.

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
