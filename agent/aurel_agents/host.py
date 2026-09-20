# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Agent host: FastAPI app chạy shopping + merchant agent của Aurel & Co.

Endpoints:
- POST /shop/chat        — chat với concierge (shopping agent), stream SSE
- POST /merchant/chat    — chat với trợ lý vận hành (merchant agent), stream SSE
- GET  /merchant/changes — staged changes đang chờ duyệt (JSON)
- POST /merchant/changes/{id}/approve — duyệt + apply change
- POST /merchant/changes/{id}/discard — hủy change
- GET  /alerts            — alert feed (proactive agent: watch + merchant scan)
- GET  /shop/watches      — watch active của 1 session (query ?session_id=)
- POST /shop/monitor/run  — chạy 1 vòng monitor ngay (demo/thử)
- GET  /health           — trạng thái
- GET  /                 — mô tả API

Paths chạy (xem agent/README.md):
- Messages API (mặc định, ở đây): ``uvicorn aurel_agents.host:app --port 8100``
- Agent SDK: ``python -m aurel_agents.sdk_console shop|merchant --once "..."``
- Managed Agents (MCP): ``python -m aurel_agents.mcp shop|merchant``

Prod-hardening: transcript persist theo session (``data/sessions/``), giỏ
isolate theo session (mỗi session 1 shopper ``shop+<prefix>``), ledger
persist (``data/ledger-merchant.json``), rate-limit chat theo IP,
``AGENT_MERCHANT_TOKEN`` bảo vệ endpoint merchant khi đặt.

Proactive (agent-only, chatbot không có vì không tồn tại khi không chat):
``ProactiveMonitor`` chạy nền mỗi ``AGENT_MONITOR_INTERVAL_S`` giây —
check watch "báo tôi khi về hàng/giảm giá" của khách, scan tồn kho thấp +
đơn PENDING, đọc handoff tickets. Kết quả publish ``AlertFeed`` và FE
poll ``GET /alerts``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from aurel_agents.activity import ActivityLog
from aurel_agents.config import (
    MERCHANT_SKILLS,
    SHOPPING_SKILLS,
    build_anthropic_client,
    build_merchant_config,
    build_shopping_config,
    get_settings,
)
from aurel_agents.paths import (
    ACTIVITY_FILE,
    ALERTS_FILE,
    DATA_DIR,
    LEDGER_FILE,
    MEMORY_STORE_FILE,
    SESSIONS_DIR,
    TASKS_FILE,
    TICKETS_FILE,
    WATCHES_FILE,
)
from aurel_agents.proactive import (
    AlertFeed,
    ProactiveMonitor,
    TaskStore,
    Ticket,
    TicketStore,
    WatchStore,
    acquire_single_instance_lock,
)
from aurel_agents.session_pool import (
    PooledStorefront,
    RateLimiter,
    TranscriptStore,
    load_ledger,
    sanitize_session_id,
    save_ledger,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("aurel-agents")


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    # Delegation JWT (BE /auth/delegation cấp) — agent hành động thay user
    # thật: giỏ/đơn/wishlist là của user, không phải shopper demo.
    delegation_token: str | None = None
    # Trang FE đang xem (agentic web: agent biết context người dùng).
    page_type: str | None = None
    product_id: str | None = None
    # Id trace FE sinh cho turn này (FE → host → BE). Bỏ trống thì host tự sinh.
    trace_id: str | None = None


def _sanitize_trace_id(raw: str | None) -> str:
    """Chuẩn hoá trace id từ client: chỉ [A-Za-z0-9._-], tối đa 64 ký tự.

    Trace id bị đưa vào log + header gọi BE, nên không được nhận free-text
    (chống log injection / header injection). Sai định dạng → sinh mới.
    """
    import re as _re
    import uuid as _uuid

    if raw:
        cleaned = _re.sub(r"[^A-Za-z0-9._-]", "", raw)[:64]
        if len(cleaned) >= 8:
            return cleaned
    return _uuid.uuid4().hex[:16]


# --- state khởi động -----------------------------------------------------------

_state: dict[str, Any] = {}
_transcripts = TranscriptStore(SESSIONS_DIR)
_rate = RateLimiter()

# Proactive stores (watch khách + alert feed + handoff tickets) — module-level
# để test import được không qua lifespan.
_watch_store = WatchStore(WATCHES_FILE)
_alert_feed = AlertFeed(ALERTS_FILE)
_ticket_store = TicketStore(TICKETS_FILE)
# Task store (việc khách giao rồi đi — G2-5).
_task_store = TaskStore(TASKS_FILE)
# AI Activity Log: tool-call nào, của ai/session nào, ok/fail, bao lâu.
# Ghi bởi adapter (pool + AurelMerchant) khi host wire vào ở lifespan.
_activity_log = ActivityLog(ACTIVITY_FILE)
def _jev_alert_gate():
    """#3: gate Jev chấm alert merchant-scan (low_stock/pending) có đáng
    lên feed ops không. Mọi lỗi → True (không bao giờ MẤT alert vì Jev)."""

    async def gate(kind: str, title: str, detail: str) -> bool:
        from aurel_agents import jev

        settings = get_settings()
        verdict = await asyncio.to_thread(
            jev.classify_alert,
            kind,
            title,
            detail,
            api_key=settings.jev_api_key,
            base_url=settings.jev_url,
            model=settings.jev_model,
            timeout_s=settings.jev_timeout_s,
        )
        if verdict is None:
            return True  # Jev tắt/chết → publish như cũ
        return verdict.is_noteworthy

    return gate


_monitor = ProactiveMonitor(
    watch_store=_watch_store,
    alert_feed=_alert_feed,
    ticket_store=_ticket_store,
    settings=None,  # set trong lifespan (settings cần env)
    sessions_dir=SESSIONS_DIR,  # retention sweep dọn transcript cũ
    task_store=_task_store,
    alert_gate=_jev_alert_gate(),
)

# Budget guard: đếm turn mỗi (session, ngày UTC) + tổng toàn host/ngày.
# 1 turn = tối đa max_tool_iterations vòng model call (mỗi vòng tốn thinking
# + output tokens) — chatbot billing không kiểm soát sẽ cháy tiền khi bị
# script dập. Reset theo ngày UTC (đơn giản, không cron).
# Cap theo session bypass được bằng phiên mới → trần toàn host
# (AGENT_GLOBAL_TURNS_PER_DAY) mới là trần tiền thật (P2-7).
_turn_counts: dict[tuple[str, str], int] = {}
_global_counts: dict[str, int] = {}
# Ngày đã publish alert hết ngân sách (tránh spam feed mỗi request bị chặn).
_budget_alerted_dates: set[str] = set()


def _today_str() -> str:
    from datetime import UTC, datetime

    return datetime.now(UTC).strftime("%Y-%m-%d")


def _budget_key(session_id: str, today: str) -> tuple[str, str]:
    return (sanitize_session_id(session_id), today)


def _budget_block_reason(
    session_id: str,
    per_day: int,
    global_per_day: int,
    turn_counts: dict[tuple[str, str], int],
    global_counts: dict[str, int],
    today: str,
) -> str | None:
    """Thuần, test được: 'global' | 'session' | None (được phép)."""
    if global_per_day > 0 and global_counts.get(today, 0) >= global_per_day:
        return "global"
    if per_day > 0 and turn_counts.get(_budget_key(session_id, today), 0) >= per_day:
        return "session"
    return None


def _check_budget(session_id: str, per_day: int, global_per_day: int = 0) -> None:
    """Turn count vượt cap (session hoặc toàn host) → 429."""
    today = _today_str()
    # Prune ngày cũ — dict không phình qua thời gian.
    for k in [k for k in _turn_counts if k[1] != today]:
        del _turn_counts[k]
    for d in [d for d in _global_counts if d != today]:
        del _global_counts[d]
    for d in [d for d in _budget_alerted_dates if d != today]:
        _budget_alerted_dates.discard(d)
    reason = _budget_block_reason(
        session_id, per_day, global_per_day, _turn_counts, _global_counts, today
    )
    if reason == "global":
        logger.error(
            "Ngân sách chat toàn host đã hết (%d turn/ngày) — từ chối turn mới. "
            "Nâng AGENT_GLOBAL_TURNS_PER_DAY nếu đây là traffic thật.",
            global_per_day,
        )
        if today not in _budget_alerted_dates:
            _budget_alerted_dates.add(today)
            _alert_feed.publish(
                "budget",
                "Hết ngân sách chat hôm nay",
                f"Host đã dùng hết {global_per_day} turn/ngày — chat mới trả 429 "
                "đến nửa đêm UTC. Kiểm tra có bị script dập không.",
                {"cap": global_per_day, "date": today},
            )
        raise HTTPException(
            status_code=429,
            detail="Hệ thống đã dùng hết ngân sách chat hôm nay — quay lại ngày mai.",
        )
    if reason == "session":
        # KHÔNG gợi ý "mở phiên mới" ở đây — đó là đường bypass cap tiền
        # (audit HIGH-05): attacker script mở session mới là có thêm quota.
        raise HTTPException(
            status_code=429,
            detail=(
                f"Phiên chat đã dùng hết {per_day} lượt/ngày — quay lại ngày mai."
            ),
        )
    _turn_counts[_budget_key(session_id, today)] = (
        _turn_counts.get(_budget_key(session_id, today), 0) + 1
    )
    _global_counts[today] = _global_counts.get(today, 0) + 1


def _new_session_id() -> str:
    return uuid.uuid4().hex


def client_ip_from_headers(
    forwarded: str | None, fallback: str, hops: int = 1,
) -> str:
    """IP client từ X-Forwarded-For — lấy entry do proxy tin cậy append.

    Chuỗi XFF có dạng [client, proxy1, ..., proxyN] với proxyN gần host
    nhất (Caddy append IP nó thấy vào CUỐI). Lấy entry ĐẦU như trước đây
    cho phép attacker tự đặt IP bằng 1 header gửi kèm → bypass rate-limit
    theo IP + đầu độc bucket của người khác (audit HIGH-05). Lấy entry ở
    vị trí [-hops] (mặc định 1 = entry cuối = IP Caddy nhìn thấy).
    """
    if forwarded:
        parts = [p.strip() for p in forwarded.split(",") if p.strip()]
        if parts:
            idx = max(0, len(parts) - max(1, hops))
            return parts[idx]
    return fallback or "unknown"


def _client_ip(request: Request) -> str:
    fallback = request.client.host if request.client else "unknown"
    try:
        hops = get_settings().trust_proxy_hops
    except Exception:
        hops = 1
    return client_ip_from_headers(
        request.headers.get("x-forwarded-for"), fallback, hops
    )


def ensure_merchant_token(settings) -> None:
    """Fail-fast khi prod yêu cầu token merchant mà env còn trống.

    Không có hàm này, deploy prod quên AGENT_MERCHANT_TOKEN → mọi endpoint
    /merchant/* + /alerts mở công khai mà không ai hay (audit SEC-CRIT-01).
    """
    if getattr(settings, "merchant_token_required", False) and not getattr(
        settings, "merchant_token", None
    ):
        raise RuntimeError(
            "AGENT_REQUIRE_MERCHANT_TOKEN=1 nhưng AGENT_MERCHANT_TOKEN trống — "
            "từ chối khởi động để không mở endpoint merchant ra Internet."
        )


def _check_rate(request: Request, per_min: int) -> None:
    if per_min <= 0:
        return
    if not _rate.allow(_client_ip(request), per_min):
        raise HTTPException(status_code=429, detail="Quá nhiều request — thử lại sau 1 phút")


def _check_merchant_auth(request: Request) -> None:
    token = get_settings().merchant_token
    if not token:
        return
    if request.headers.get("x-agent-token") != token:
        raise HTTPException(status_code=401, detail="Thiếu/sai x-agent-token cho merchant API")


def _jev_watch_gate():
    """#1: Jev gate cho set_watch — phân loại lại ý định watch bằng
    decision model (noul + choice) khi diễn đạt tự nhiên làm model chính
    chọn sai kind. Trả ``(kind, pct)``; mọi lỗi (thiếu key, Jev chết)
    → giữ nguyên tham số model chọn (fail-safe)."""

    async def gate(message: str, kind: str, pct: float | None):
        from aurel_agents import jev

        settings = get_settings()
        verdict = await asyncio.to_thread(
            jev.classify_watch_intent,
            message,
            api_key=settings.jev_api_key,
            base_url=settings.jev_url,
            model=settings.jev_model,
            timeout_s=settings.jev_timeout_s,
        )
        if verdict is None or not verdict.is_watch_intent:
            return kind, pct
        new_kind = verdict.watch_type or kind
        new_pct: float | None = pct
        if new_kind == "price_drop":
            if verdict.price_drop_pct is not None:
                new_pct = float(verdict.price_drop_pct)
            elif pct is None:
                # Jev bảo là price_drop nhưng không suy ra được % — đặt
                # 5% (bucket "rẻ hơn chút") để watch có điều kiện rõ.
                new_pct = 5.0
        return new_kind, new_pct

    return gate


async def _make_shopping_agent(pool: PooledStorefront):
    from shopping_agent_runtime import ShoppingAgent

    from aurel_agents.memory_store import LockedJsonFileMemoryStore
    from aurel_agents.shopping.task_tool import build_task_extensions
    from aurel_agents.shopping.watch_tool import build_watch_extension

    settings = get_settings()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    agent = ShoppingAgent(
        backend=pool,  # type: ignore[arg-type] — delegate đủ interface StorefrontBackend
        skills_dir=SHOPPING_SKILLS,
        config=build_shopping_config(settings),
        client=build_anthropic_client(settings),
        memory_store=LockedJsonFileMemoryStore(MEMORY_STORE_FILE),
        extra_presentation_tools=(
            build_watch_extension(_watch_store, jev_gate=_jev_watch_gate()),
            *build_task_extensions(_task_store),
        ),
    )
    return agent


async def _make_merchant_agent():
    from merchant_agent_runtime import MerchantAgent

    from aurel_agents.clock_client import ClockClient
    from aurel_agents.memory_store import LockedJsonFileMemoryStore
    from aurel_agents.merchant.backend import AurelMerchant

    settings = get_settings()
    client = ClockClient(
        settings.backend_url,
        settings.admin_email,
        settings.admin_password,
        register_if_new=False,
        actor="agent/merchant",
    )
    await client.ensure_session()
    backend = AurelMerchant(client)
    restored = load_ledger(backend._ledger, LEDGER_FILE)
    if restored:
        logger.info("Khôi phục %d staged changes từ ledger", restored)
    agent = MerchantAgent(
        backend=backend,
        skills_dir=MERCHANT_SKILLS,
        config=build_merchant_config(settings),
        client=build_anthropic_client(settings),
        memory_store=LockedJsonFileMemoryStore(MEMORY_STORE_FILE.with_name("memory-merchant.json")),
    )
    return agent, client, backend


def _persist_merchant_ledger() -> None:
    backend = _state.get("merchant_backend")
    if backend is not None:
        save_ledger(backend._ledger, LEDGER_FILE)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # Prod yêu cầu token merchant mà env trống → chết ngay khi khởi động,
    # không phục vụ 1 giây nào ở trạng thái mở toang.
    ensure_merchant_token(settings)
    logger.info("Agent host: backend=%s model=%s", settings.backend_url, settings.model)
    _monitor._settings = settings  # noqa: SLF001 — wire settings khi startup
    _monitor._task_store = _task_store  # noqa: SLF001 — wire task store
    # Single-instance guard: store JSON là single-writer — instance thứ 2
    # phải fail ngay thay vì đè dữ liệu instance 1.
    lock = acquire_single_instance_lock(DATA_DIR / "host.lock")
    pool = PooledStorefront(settings)
    pool._activity = _activity_log  # noqa: SLF001 — wire activity log
    _monitor._activity_log = _activity_log  # noqa: SLF001 — retention sweep
    _state["shop_pool"] = pool
    try:
        _state["shopping"] = await _make_shopping_agent(pool)
        logger.info("Shopping agent sẵn sàng (per-session shopper pool)")
    except Exception as error:
        logger.warning("Shopping agent không khởi động được: %s", error)
        _state["shopping"] = None
    try:
        merchant, admin_client, backend = await _make_merchant_agent()
        backend._activity = _activity_log  # noqa: SLF001 — wire activity log
        _state["merchant"] = merchant
        _state["admin_client"] = admin_client
        _state["merchant_backend"] = backend
        logger.info("Merchant agent sẵn sàng (admin=%s)", settings.admin_email)
    except Exception as error:
        logger.warning("Merchant agent không khởi động được: %s", error)
        _state["merchant"] = None
    _monitor.start()
    try:
        yield
    finally:
        await _monitor.stop()
    _persist_merchant_ledger()
    lock.close()  # nhả single-instance lock
    pool = _state.pop("shop_pool", None)
    if pool:
        await pool.aclose()
    admin_client = _state.pop("admin_client", None)
    if admin_client:
        await admin_client.aclose()
    _state.clear()


app = FastAPI(title="Aurel & Co. AI Agents", lifespan=lifespan)

settings_cors = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3100",
        "http://127.0.0.1:3100",
        settings_cors.frontend_url,
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["content-type", "x-agent-token"],
)


# --- helpers ---------------------------------------------------------------------


def _sse(payload: dict[str, Any] | str) -> str:
    body = payload if isinstance(payload, str) else json.dumps(payload, default=str)
    return f"data: {body}\n\n"


def _jev_classify_intent_sync(message: str) -> tuple[str | None, float]:
    """#4+#5: Jev pre-router — (hint text, injection score).

    Không bao giờ raise: Jev lỗi → (None, 0.0) → turn bỏ qua hint, agent
    như cũ. Injection score để turn chặn ở ngưỡng jev_injection_threshold.
    """
    from aurel_agents import jev

    settings = get_settings()
    try:
        verdict = jev.classify_intent(
            message,
            api_key=settings.jev_api_key,
            base_url=settings.jev_url,
            model=settings.jev_model,
            timeout_s=settings.jev_timeout_s,
        )
    except Exception:
        logger.warning("Jev intent hint lỗi (bỏ qua)", exc_info=True)
        return None, 0.0
    if verdict is None:
        return None, 0.0
    hint = {
        "browse": "Đang xem sản phẩm cho bạn…",
        "order_status": "Đang tra đơn hàng của bạn…",
        "complaint": "Đang ghi nhận sự cố của bạn…",
        "policy_question": "Đang tra chính sách cửa hàng…",
        "smalltalk": None,  # chào hỏi → đừng giả vờ "đang xử lý"
    }.get(verdict.bucket)
    return hint, verdict.injection
    if verdict is None:
        return None
    return {
        "browse": "Đang xem sản phẩm cho bạn…",
        "order_status": "Đang tra đơn hàng của bạn…",
        "complaint": "Đang ghi nhận sự cố của bạn…",
        "policy_question": "Đang tra chính sách cửa hàng…",
        "smalltalk": None,  # chào hỏi → đừng giả vờ "đang xử lý"
    }.get(verdict.bucket)


async def _run_shopping_turn(
    agent: Any,
    message: str,
    session_id: str,
    page_type: str = "other",
    product_id: str | None = None,
):
    """1 turn shopping agent: transcript persist theo session.

    ``page_type``/``product_id``: context trang FE đang xem (agentic web) —
    agent biết user đứng ở đâu, câu trả lời bám đúng sản phẩm đang mở.
    """
    from shopping_agent import PageContext, ShoppingSessionContext, ShoppingSessionState

    sid = sanitize_session_id(session_id)
    transcript = _transcripts.load(sid)
    transcript.append({"role": "user", "content": message})
    valid_pages = {"home", "search", "product", "cart", "orders", "other"}
    page = PageContext(
        page_type=page_type if page_type in valid_pages else "other",
        product_id=product_id,
        query=message[:80],
    )
    context = ShoppingSessionContext(
        session_id=sid,
        user_id=f"shopper:{sid[:8]}",
        page=page,
    )
    state = ShoppingSessionState()

    yield _sse({"type": "session", "session_id": sid})
    # #4+#5 pre-router: Jev bucket intent (~300ms) về TRƯỚC token đầu của
    # model reasoning (1-3s) → FE hiện status line ngay. Đồng thời score
    # injection: trượt ngưỡng → chặn turn, không cho message vào agent.
    try:
        hint, injection = await asyncio.to_thread(
            _jev_classify_intent_sync,
            message,
        )
    except Exception:
        hint, injection = None, 0.0
    settings_jev = get_settings()
    if injection >= settings_jev.jev_injection_threshold:
        logger.warning(
            "Chặn turn injection (score=%.2f, session=%s)", injection, sid
        )
        _alert_feed.publish(
            "security",
            "Chặn prompt injection",
            f"Tin nhắn bị chặn (score {injection:.2f}) — không vào agent.",
            {"session_id": sid, "injection_score": round(injection, 2)},
        )
        yield _sse(
            {
                "type": "error",
                "message": (
                    "Tin nhắn chứa nội dung không hợp lệ đối với trợ lý bán hàng."
                ),
            }
        )
        yield _sse({"type": "done"})
        return
    if hint is not None:
        yield _sse({"type": "progress", "message": hint})
    try:
        async for event in agent.stream_turn(transcript, context, state):
            yield _sse(event)
    except Exception as error:
        # Token delegation hết hạn giữa chừng → event riêng để FE xin lại
        # (người dùng cấp lại quyền cho agent) rồi xin user retry.
        from aurel_agents.clock_client import ClockDelegationError

        if isinstance(error, ClockDelegationError):
            yield _sse(
                {
                    "type": "delegation_expired",
                    "message": "Quyền hành động hộ đã hết hạn — bấm 'Dùng tài khoản của tôi' để cấp lại.",
                }
            )
        else:
            logger.exception("Lỗi shopping turn")
            yield _sse({"type": "error", "message": str(error)})
        return
    finally:
        _transcripts.save(sid)
    # Handoff shopping → merchant: khiếu nại → ticket cho vòng scan.
    ticket = await _maybe_handoff_ticket_async(message, sid)
    if ticket is not None:
        yield _sse(
            {
                "type": "handoff",
                "ticket_id": ticket.ticket_id,
                "message": "Đã ghi nhận — đội vận hành thấy yêu cầu của bạn qua ticket.",
            }
        )
    try:
        facts = await agent.update_memory(transcript, context)
        if facts:
            yield _sse({"type": "memory", "facts": [f.model_dump() for f in facts]})
    except Exception:
        logger.exception("update_memory lỗi (bỏ qua, không ảnh hưởng turn)")
    _transcripts.save(sid)
    yield _sse({"type": "done"})


async def _run_merchant_turn(agent: Any, message: str, session_id: str):
    """1 turn merchant agent: MerchantSessionContext + ledger persist."""
    from merchant_agent import MerchantSessionContext, MerchantSessionState

    sid = sanitize_session_id(session_id)
    transcript = _transcripts.load(sid)
    transcript.append({"role": "user", "content": message})
    context = MerchantSessionContext(
        session_id=sid,
        merchant_id="aurel",
        operator=f"operator:{sid[:8]}",
    )
    state = MerchantSessionState()

    # Trace id: gắn lên client admin dùng chung cho turn này (đổi mỗi turn).
    merchant_backend = _state.get("merchant_backend")
    if merchant_backend is not None:
        setter = getattr(merchant_backend._client, "set_trace", None)
        if callable(setter):
            setter(_state.get("merchant_trace"))

    yield _sse({"type": "session", "session_id": sid})
    try:
        async for event in agent.stream_turn(transcript, context, state):
            yield _sse(event)
    except Exception as error:
        logger.exception("Lỗi merchant turn")
        yield _sse({"type": "error", "message": str(error)})
        return
    finally:
        _transcripts.save(sid)
        _persist_merchant_ledger()
    try:
        facts = await agent.update_memory(transcript, context)
        if facts:
            yield _sse({"type": "memory", "facts": [f.model_dump() for f in facts]})
    except Exception:
        logger.exception("update_memory lỗi (bỏ qua, không ảnh hưởng turn)")
    _transcripts.save(sid)
    _persist_merchant_ledger()
    yield _sse({"type": "done"})


def _require_agent(role: str) -> Any:
    agent = _state.get(role)
    if agent is None:
        settings = get_settings()
        raise HTTPException(
            status_code=503,
            detail=(
                f"{role} agent chưa chạy được — kiểm tra backend clock "
                f"({settings.backend_url}) và AGENT_API_KEY/AGENT_BASE_URL."
            ),
        )
    return agent


def _require_merchant_backend() -> Any:
    backend = _state.get("merchant_backend")
    if backend is None:
        raise HTTPException(status_code=503, detail="Merchant backend chưa sẵn sàng")
    return backend


def _api_context(operator: str = "operator:api"):
    from merchant_agent import MerchantSessionContext

    return MerchantSessionContext(session_id="api", merchant_id="aurel", operator=operator)


# --- handoff shopping → merchant ---------------------------------------------------

# Từ khoá khiếu nại — heuristic chủ ý tốn 0 LLM call. Turn concierge vẫn
# trả lời chính sách như thường; ticket chỉ là kênh BÊN THÊM để merchant
# agent thấy vụ việc trong scan vòng của nó.
#
# Jev (TypeSafe decision model, aurel_agents/jev.py) là lớp XÁC NHẬN + ROUTE
# bên cạnh heuristic — KHÔNG thay LLM concierge (Jev không sinh text,
# không tool_use). Heuristic trúng rõ → mở ticket luôn 0 call; heuristic
# trượt (khiếu nại diễn đạt không chứa từ khoá) → hỏi Jev 1 call qua
# _maybe_handoff_ticket_async. Jev chết/thiếu key → fallback heuristic cũ
# (handoff không bao giờ fail vì Jev — như Meili fallback Prisma ở BE).
_COMPLAINT_TERMS = (
    "khiếu nại",
    "phàn nàn",
    "bị lỗi",
    "bị trầy",
    "không nhận được",
    "chưa nhận được",
    "chưa thấy đơn",
    "hoàn tiền",
    "hoàn đơn",
    "bị hủy nhầm",
    "sai sản phẩm",
    "giao sai",
    "mất kiện",
    "bị móp",
)

# Mẫu câu HỎI chính sách ("chính sách hoàn tiền thế nào?", "làm sao để khiếu
# nại?") — khách đang hỏi thông tin, không phải báo sự cố. Mở ticket cho câu
# này sẽ spam vận hành bằng ticket rác.
_POLICY_QUESTION_PATTERNS = (
    re.compile(r"chính sách"),
    re.compile(r"làm (sao|thế nào) (để|khi|nếu)"),
    re.compile(r"(có|được) (hoàn|đổi|trả) (không|ko)\??"),
    re.compile(r"thế nào|bao lâu|bao nhiêu ngày|quy trình"),
    re.compile(r"giới thiệu|hướng dẫn|cần những gì"),
)


def _is_policy_question(message: str) -> bool:
    text = message.lower().strip()
    return any(p.search(text) for p in _POLICY_QUESTION_PATTERNS)


def _open_ticket(
    message: str,
    session_id: str,
    *,
    department: str | None = None,
    severity: str | None = None,
    sentiment: str | None = None,
) -> Ticket:
    """Mở/GHI THÊM ticket + publish alert feed. Dùng chung heuristic và Jev.

    Tin thứ 2 trở đi của cùng user+order được nối vào lịch sử ticket (xem
    ``TicketStore.open``); nếu nặng hơn lần trước → publish alert riêng
    ``ticket_escalated`` để feed không nuốt mất diễn biến.
    """
    # Mã đơn AC-YYYY-NNNNNN nếu khách nhắc
    match = re.search(r"AC-\d{4}-\d{6}", message)
    ticket, escalated = _ticket_store.open(
        user_id=f"shopper:{sanitize_session_id(session_id)[:8]}",
        summary=message[:400],
        order_id=match.group(0) if match else None,
        severity=severity,
        sentiment=sentiment,
        department=department,
        source="jev" if severity or sentiment or department else "heuristic",
    )
    # Triage data vào alert: merchant scan sort theo severity, sentiment
    # angry nổi lên feed ops để xử lý trước (khách sắp bỏ đi).
    triage = {
        k: v
        for k, v in {
            "department": department,
            "severity": severity,
            "sentiment": sentiment,
        }.items()
        if v
    }
    turns = len(ticket.messages)
    _alert_feed.publish(
        "ticket_escalated" if escalated else "ticket",
        (
            f"Ticket {ticket.ticket_id}: khiếu nại LEO THANG (lần {turns})"
            if escalated
            else f"Ticket {ticket.ticket_id}: khách khiếu nại"
        ),
        # Detail kèm LỊCH SỬ các lượt (không chỉ tin mới nhất) — merchant
        # scan đọc alert là thấy toàn bộ diễn biến, không phải mở store.
        f"Nội dung: {message[:200]}"
        + (
            f"\nCác lượt trước:\n{ticket.history_text()}" if turns > 1 else ""
        ),
        {
            "ticket_id": ticket.ticket_id,
            "order_id": ticket.order_id,
            "turns": turns,
            "severity": ticket.severity,
            "escalated": escalated,
            **triage,
        },
    )
    return ticket


def _maybe_handoff_ticket(message: str, session_id: str) -> Ticket | None:
    """User message có dấu hiệu khiếu nại → mở ticket cho merchant agent.

    Câu hỏi chính sách (chứa từ khoá khiếu nại nhưng là hỏi "thế nào/ bao
    lâu") KHÔNG mở ticket — concierge vẫn trả lời qua search_policies như
    thường; chỉ sự cố thật (kể chuyện, kèm/ không kèm mã đơn) mới chuyển.
    """
    text = message.lower()
    if not any(term in text for term in _COMPLAINT_TERMS):
        return None
    if _is_policy_question(message):
        return None
    return _open_ticket(message, session_id)


async def _maybe_handoff_ticket_async(message: str, session_id: str) -> Ticket | None:
    """Handoff có Jev xác nhận: heuristic trúng → ticket luôn 0 call.

    Heuristic trượt (khiếu nại diễn đạt không chứa từ khoá, không phải câu
    hỏi chính sách) → hỏi Jev 1 call (to_thread, không block loop). Jev
    chết/thiếu key/không phải khiếu nại → None (giữ đúng hành vi cũ).

    Khách đã có ticket open cùng order → gửi kèm lịch sử cho Jev để nó
    đánh giá severity **của lần này** trong ngữ cảnh (câu "vẫn chưa thấy ai
    liên hệ" ngắn gọn nhưng là leo thang).
    """
    fast = _maybe_handoff_ticket(message, session_id)
    if fast is not None or _is_policy_question(message):
        return fast
    from aurel_agents import jev as _jev

    s = get_settings()
    history = _ticket_history_for(message, session_id)
    verdict = await asyncio.to_thread(
        _jev.classify,
        message,
        api_key=s.jev_api_key,
        base_url=s.jev_url,
        model=s.jev_model,
        threshold=s.jev_threshold,
        timeout_s=s.jev_timeout_s,
        prior=history,
    )
    if verdict is None or not verdict.is_complaint:
        return None
    return _open_ticket(
        message,
        session_id,
        department=verdict.department,
        severity=verdict.severity,
        sentiment=verdict.sentiment,
    )


def _ticket_history_for(message: str, session_id: str) -> str | None:
    """Lịch sử ticket open cùng user+order (nếu có) để đưa vào ngữ cảnh Jev.

    Chỉ trả về khi cùng mã đơn — tránh trộn 2 vụ việc khác nhau của cùng
    khách thành một mớ ngữ cảnh đánh lừa model.
    """
    match = re.search(r"AC-\d{4}-\d{6}", message)
    if not match:
        return None
    user_id = f"shopper:{sanitize_session_id(session_id)[:8]}"
    for t in _ticket_store.all():
        if (
            getattr(t, "status", None) == "open"
            and getattr(t, "user_id", None) == user_id
            and getattr(t, "order_id", None) == match.group(0)
            and getattr(t, "messages", None)
        ):
            return t.history_text()
    return None


# --- routes ------------------------------------------------------------------------


@app.get("/")
async def index() -> dict:
    return {
        "service": "aurel-agents",
        "endpoints": {
            "shop_chat": "POST /shop/chat {message, session_id?}",
            "merchant_chat": "POST /merchant/chat {message, session_id?}",
            "merchant_changes": "GET /merchant/changes",
            "merchant_approve": "POST /merchant/changes/{id}/approve",
            "merchant_discard": "POST /merchant/changes/{id}/discard",
            "alerts": "GET /alerts?limit=50 — feed ops (token); scope=shop&session_id=... cho feed watch của khách",
            "activity": "GET /activity?limit=50&role=&session_id=&ok= — AI Activity Log (token)",
            "shop_watches": "GET /shop/watches?session_id=... — watch active của session",
            "shop_watch_cancel": "POST /shop/watches/{id}/cancel",
            "shop_forget": "POST /shop/forget {session_id} — xóa transcript/memory/watch/task của session",
            "monitor_run": "POST /shop/monitor/run — chạy 1 vòng monitor ngay",
            "health": "GET /health",
        },
        "runtimes": {
            "messages_api": "host này (uvicorn aurel_agents.host:app)",
            "agent_sdk": "python -m aurel_agents.sdk_console shop|merchant --once ...",
            "managed_mcp": "python -m aurel_agents.mcp shop|merchant",
        },
        "upstream": "anthropics/commerce-agents (vendored, Apache-2.0)",
    }


@app.get("/health")
async def health() -> dict:
    backend = _state.get("merchant_backend")
    pending = len(backend._ledger.pending()) if backend is not None else 0
    return {
        "ok": True,
        "shopping_agent": _state.get("shopping") is not None,
        "merchant_agent": _state.get("merchant") is not None,
        "merchant_pending_changes": pending,
        "monitor_last_run": _monitor.last_run,
        "active_watches": len(_watch_store.active()),
        "open_tickets": len(_ticket_store.open_tickets()),
    }


@app.post("/shop/chat")
async def shop_chat(req: ChatRequest, request: Request):
    settings = get_settings()
    _check_rate(request, settings.chat_rate_limit_per_min)
    session_id = sanitize_session_id(req.session_id or _new_session_id())
    _check_budget(session_id, settings.chat_turns_per_day, settings.global_turns_per_day)
    agent = _require_agent("shopping")
    pool = _state.get("shop_pool")
    # Trace: FE gửi kèm → host truyền xuống BE trên mọi request của turn này.
    trace_id = _sanitize_trace_id(req.trace_id)
    if pool is not None:
        pool.bind_trace(session_id, trace_id)
    if req.delegation_token:
        if pool is None:
            raise HTTPException(status_code=503, detail="Pool shopper chưa sẵn sàng")
        pool.bind_delegation(session_id, req.delegation_token)
    return StreamingResponse(
        _run_shopping_turn(
            agent,
            req.message,
            session_id,
            page_type=req.page_type or "other",
            product_id=req.product_id,
        ),
        media_type="text/event-stream",
    )


@app.post("/merchant/chat")
async def merchant_chat(req: ChatRequest, request: Request):
    settings = get_settings()
    _check_rate(request, settings.chat_rate_limit_per_min)
    _check_merchant_auth(request)
    agent = _require_agent("merchant")
    session_id = sanitize_session_id(req.session_id or _new_session_id())
    _check_budget(session_id, settings.chat_turns_per_day, settings.global_turns_per_day)
    _state["merchant_trace"] = _sanitize_trace_id(req.trace_id)
    return StreamingResponse(
        _run_merchant_turn(agent, req.message, session_id),
        media_type="text/event-stream",
    )


@app.get("/merchant/changes")
async def merchant_changes(request: Request) -> dict:
    _check_merchant_auth(request)
    backend = _require_merchant_backend()
    return {
        "pending": [c.model_dump(mode="json") for c in backend._ledger.pending()],
        "resolved": [c.model_dump(mode="json") for c in backend._ledger.resolved()][-20:],
    }


@app.post("/merchant/changes/{change_id}/approve")
async def merchant_approve(change_id: str, request: Request) -> dict:
    _check_merchant_auth(request)
    backend = _require_merchant_backend()
    try:
        change = await backend.apply_change(_api_context(), change_id)
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    _persist_merchant_ledger()
    return {"ok": True, "change": change.model_dump(mode="json")}


@app.post("/merchant/changes/{change_id}/discard")
async def merchant_discard(change_id: str, request: Request) -> dict:
    _check_merchant_auth(request)
    backend = _require_merchant_backend()
    try:
        change = await backend.discard_change(_api_context(), change_id)
    except Exception as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    _persist_merchant_ledger()
    return {"ok": True, "change": change.model_dump(mode="json")}


# --- proactive endpoints (feed + watch + monitor) -------------------------------------


# Loại alert thuộc về shopper (thông báo watch của chính họ) — được xem
# không cần token. Mọi loại còn lại (low_stock/pending_orders/ticket/
# be_status) là dữ liệu vận hành → chỉ feed ops (token).
SHOP_ALERT_KINDS = frozenset({"restock", "price_drop"})


def shop_alerts_for(alerts: list, user_id: str) -> list:
    """Lọc alert watch thuộc đúng 1 shopper (thuần, test được)."""
    out = []
    for a in alerts:
        kind = getattr(a, "kind", None)
        data = getattr(a, "data", None) or {}
        if kind in SHOP_ALERT_KINDS and data.get("user_id") == user_id:
            out.append(a)
    return out


@app.get("/alerts")
async def alerts(  # noqa: B008 — FastAPI inject
    limit: int = 50,
    scope: str = "ops",
    session_id: str = "",
    request: Request = None,
) -> dict:
    """Alert feed: agent tự phát hiện (watch khách, tồn kho, PENDING, ticket).

    - ``scope=shop&session_id=...``: chỉ alert restock/price_drop CỦA CHÍNH
      session (khách xem thông báo watch của mình) — không cần token.
    - Mặc định (ops): toàn feed, chứa số liệu vận hành + nội dung khiếu nại
      → bảo vệ bằng x-agent-token khi AGENT_MERCHANT_TOKEN đặt.
    """
    safe_limit = max(1, min(limit, 200))
    if scope == "shop":
        sid = sanitize_session_id(session_id)
        user_id = f"shopper:{sid[:8]}"
        items = shop_alerts_for(_alert_feed.recent(200), user_id)[-safe_limit:][::-1]
        return {
            "alerts": [a.model_dump(mode="json") for a in items],
            "monitor_last_run": _monitor.last_run,
        }
    _check_merchant_auth(request)
    return {
        "alerts": [a.model_dump(mode="json") for a in _alert_feed.recent(safe_limit)],
        "monitor_last_run": _monitor.last_run,
    }


@app.get("/activity")
async def activity(  # noqa: B008 — FastAPI inject
    limit: int = 50,
    role: str = "",
    session_id: str = "",
    ok: str = "",
    request: Request = None,
) -> dict:
    """AI Activity Log query (ops): tool nào, của actor/session nào,
    ok/fail, mất bao lâu — tra khi khách khiếu nại hành vi agent.

    Chứa actor + session → token-gated như feed ops. Không ghi args thô
    (tránh PII) — chỉ detail nghiệp vụ (product_id, change_id...).
    """
    _check_merchant_auth(request)
    safe_limit = max(1, min(limit, 200))
    ok_flag = {"1": True, "0": False}.get(ok)
    return {
        "activity": _activity_log.recent(
            safe_limit,
            role=role or None,
            session_id=session_id or None,
            ok=ok_flag,
        )
    }


@app.get("/shop/watches")
async def shop_watches(session_id: str = "") -> dict:
    """Watch active của 1 chat session (mỗi session 1 shopper riêng).

    Chỉ trả watch của chính session gọi (user_id suy từ session prefix) —
    không lộ watch của người khác, nên không cần token.
    """
    sid = sanitize_session_id(session_id)
    user_id = f"shopper:{sid[:8]}"
    return {"watches": [w.model_dump(mode="json") for w in _watch_store.for_user(user_id)]}


@app.post("/shop/watches/{watch_id}/cancel")
async def shop_watch_cancel(watch_id: str, session_id: str = "") -> dict:
    """Hủy watch — chỉ chủ sở hữu (session tạo watch) được hủy.

    Không check thì ai cũng hủy được watch người khác vì watch_id
    đoán được (timestamp + counter). So khớp user_id suy từ session.
    """
    sid = sanitize_session_id(session_id)
    user_id = f"shopper:{sid[:8]}"
    watch = _watch_store.get(watch_id)
    if watch is None or not watch.active:
        raise HTTPException(status_code=404, detail="Không tìm thấy watch (hoặc đã tắt)")
    if watch.user_id != user_id:
        raise HTTPException(status_code=403, detail="Không có quyền hủy watch này")
    _watch_store.deactivate(watch_id)
    return {"ok": True, "watch": watch.model_dump(mode="json")}


class ForgetRequest(BaseModel):
    session_id: str = ""


@app.post("/shop/forget")
async def shop_forget(req: ForgetRequest) -> dict:
    """Xóa dữ liệu cá nhân của 1 chat session (quyền xóa — privacy).

    Xóa: transcript chat, memory facts của shopper session đó, watch
    (active + inactive), task (open + done). Không cần token vì chỉ xóa
    đúng dữ liệu của session gọi (user_id suy từ session prefix) — không
    chạm được dữ liệu session khác. Memory merchant (subject "aurel"
    chung) và transcript merchant KHÔNG xóa ở đây.
    """
    from aurel_agents.memory_store import LockedJsonFileMemoryStore

    sid = sanitize_session_id(req.session_id)
    user_id = f"shopper:{sid[:8]}"
    removed_transcript = _transcripts.delete(sid)
    # Memory: subject = session.user_id (shopping) — xem executor.memory_subject.
    store = LockedJsonFileMemoryStore(MEMORY_STORE_FILE)
    try:
        await store.clear(user_id)
        removed_memory = True
    except Exception:
        removed_memory = False
    removed_watches = 0
    for w in list(_watch_store.all()):
        if getattr(w, "user_id", None) == user_id:
            if _watch_store.remove(getattr(w, "watch_id", ""), "watch_id"):
                removed_watches += 1
    removed_tasks = 0
    for t in list(_task_store.all()):
        if getattr(t, "user_id", None) == user_id:
            if _task_store.remove(getattr(t, "task_id", ""), "task_id"):
                removed_tasks += 1
    # Delegation binding + delegated client của session cũng drop.
    pool = _state.get("shop_pool")
    if pool is not None:
        try:
            pool.bind_delegation(sid, "")
        except Exception:
            pass
    return {
        "ok": True,
        "removed_transcript": removed_transcript,
        "removed_memory": removed_memory,
        "removed_watches": removed_watches,
        "removed_tasks": removed_tasks,
    }


@app.post("/shop/monitor/run")
async def monitor_run(request: Request) -> dict:
    """Chạy 1 vòng monitor ngay — demo tính năng agent tự hành động.

    Trigger được vòng quét = tốn BE call + tạo alert → bảo vệ bằng token
    như /alerts (chống abuse từ internet).
    """
    _check_merchant_auth(request)
    if _monitor._settings is None:  # noqa: SLF001 — chưa qua lifespan
        raise HTTPException(status_code=503, detail="Host chưa khởi động xong")
    counts = await _monitor.run_once()
    return {"ok": True, "new_alerts": counts, "last_run": _monitor.last_run}


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "aurel_agents.host:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )
