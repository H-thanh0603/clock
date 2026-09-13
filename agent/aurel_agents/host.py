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

import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from aurel_agents.config import (
    MERCHANT_SKILLS,
    SHOPPING_SKILLS,
    build_anthropic_client,
    build_merchant_config,
    build_shopping_config,
    get_settings,
)
from aurel_agents.paths import (
    ALERTS_FILE,
    DATA_DIR,
    LEDGER_FILE,
    MEMORY_STORE_FILE,
    SESSIONS_DIR,
    TICKETS_FILE,
    WATCHES_FILE,
)
from aurel_agents.proactive import (
    AlertFeed,
    ProactiveMonitor,
    Ticket,
    TicketStore,
    WatchStore,
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


# --- state khởi động -----------------------------------------------------------

_state: dict[str, Any] = {}
_transcripts = TranscriptStore(SESSIONS_DIR)
_rate = RateLimiter()

# Proactive stores (watch khách + alert feed + handoff tickets) — module-level
# để test import được không qua lifespan.
_watch_store = WatchStore(WATCHES_FILE)
_alert_feed = AlertFeed(ALERTS_FILE)
_ticket_store = TicketStore(TICKETS_FILE)
_monitor = ProactiveMonitor(
    watch_store=_watch_store,
    alert_feed=_alert_feed,
    ticket_store=_ticket_store,
    settings=None,  # set trong lifespan (settings cần env)
)


def _new_session_id() -> str:
    return uuid.uuid4().hex


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


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


async def _make_shopping_agent(pool: PooledStorefront):
    from commerce_common.memory import JsonFileMemoryStore
    from shopping_agent_runtime import ShoppingAgent

    from aurel_agents.shopping.watch_tool import build_watch_extension

    settings = get_settings()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    agent = ShoppingAgent(
        backend=pool,  # type: ignore[arg-type] — delegate đủ interface StorefrontBackend
        skills_dir=SHOPPING_SKILLS,
        config=build_shopping_config(settings),
        client=build_anthropic_client(settings),
        memory_store=JsonFileMemoryStore(MEMORY_STORE_FILE),
        extra_presentation_tools=(build_watch_extension(_watch_store),),
    )
    return agent


async def _make_merchant_agent():
    from commerce_common.memory import JsonFileMemoryStore
    from merchant_agent_runtime import MerchantAgent

    from aurel_agents.clock_client import ClockClient
    from aurel_agents.merchant.backend import AurelMerchant

    settings = get_settings()
    client = ClockClient(
        settings.backend_url,
        settings.admin_email,
        settings.admin_password,
        register_if_new=False,
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
        memory_store=JsonFileMemoryStore(MEMORY_STORE_FILE.with_name("memory-merchant.json")),
    )
    return agent, client, backend


def _persist_merchant_ledger() -> None:
    backend = _state.get("merchant_backend")
    if backend is not None:
        save_ledger(backend._ledger, LEDGER_FILE)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("Agent host: backend=%s model=%s", settings.backend_url, settings.model)
    _monitor._settings = settings  # noqa: SLF001 — wire settings khi startup
    pool = PooledStorefront(settings)
    _state["shop_pool"] = pool
    try:
        _state["shopping"] = await _make_shopping_agent(pool)
        logger.info("Shopping agent sẵn sàng (per-session shopper pool)")
    except Exception as error:
        logger.warning("Shopping agent không khởi động được: %s", error)
        _state["shopping"] = None
    try:
        merchant, admin_client, backend = await _make_merchant_agent()
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


async def _run_shopping_turn(agent: Any, message: str, session_id: str):
    """1 turn shopping agent: transcript persist theo session."""
    from shopping_agent import PageContext, ShoppingSessionContext, ShoppingSessionState

    sid = sanitize_session_id(session_id)
    transcript = _transcripts.load(sid)
    transcript.append({"role": "user", "content": message})
    context = ShoppingSessionContext(
        session_id=sid,
        user_id=f"shopper:{sid[:8]}",
        page=PageContext(page_type="other", query=message[:80]),
    )
    state = ShoppingSessionState()

    yield _sse({"type": "session", "session_id": sid})
    try:
        async for event in agent.stream_turn(transcript, context, state):
            yield _sse(event)
    except Exception as error:
        logger.exception("Lỗi shopping turn")
        yield _sse({"type": "error", "message": str(error)})
        return
    finally:
        _transcripts.save(sid)
    # Handoff shopping → merchant: khiếu nại → ticket cho vòng scan.
    ticket = _maybe_handoff_ticket(message, sid)
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


def _maybe_handoff_ticket(message: str, session_id: str) -> Ticket | None:
    """User message có dấu hiệu khiếu nại → mở ticket cho merchant agent."""
    if not any(term in message.lower() for term in _COMPLAINT_TERMS):
        return None
    import re

    # Mã đơn AC-YYYY-NNNNNN nếu khách nhắc
    match = re.search(r"AC-\d{4}-\d{6}", message)
    ticket = _ticket_store.open(
        user_id=f"shopper:{sanitize_session_id(session_id)[:8]}",
        summary=message[:400],
        order_id=match.group(0) if match else None,
    )
    _alert_feed.publish(
        "ticket",
        f"Ticket {ticket.ticket_id}: khách khiếu nại",
        f"Nội dung: {message[:200]}",
        {"ticket_id": ticket.ticket_id, "order_id": ticket.order_id},
    )
    return ticket


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
            "alerts": "GET /alerts?limit=50 — feed proactive agent",
            "shop_watches": "GET /shop/watches?session_id=... — watch active của session",
            "shop_watch_cancel": "POST /shop/watches/{id}/cancel",
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
    _check_rate(request, get_settings().chat_rate_limit_per_min)
    agent = _require_agent("shopping")
    session_id = sanitize_session_id(req.session_id or _new_session_id())
    return StreamingResponse(
        _run_shopping_turn(agent, req.message, session_id),
        media_type="text/event-stream",
    )


@app.post("/merchant/chat")
async def merchant_chat(req: ChatRequest, request: Request):
    _check_rate(request, get_settings().chat_rate_limit_per_min)
    _check_merchant_auth(request)
    agent = _require_agent("merchant")
    session_id = sanitize_session_id(req.session_id or _new_session_id())
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


@app.get("/alerts")
async def alerts(limit: int = 50) -> dict:
    """Alert feed: agent tự phát hiện (watch khách, tồn kho, PENDING, ticket)."""
    safe_limit = max(1, min(limit, 200))
    return {
        "alerts": [a.model_dump(mode="json") for a in _alert_feed.recent(safe_limit)],
        "monitor_last_run": _monitor.last_run,
    }


@app.get("/shop/watches")
async def shop_watches(session_id: str = "") -> dict:
    """Watch active của 1 chat session (mỗi session 1 shopper riêng)."""
    sid = sanitize_session_id(session_id)
    user_id = f"shopper:{sid[:8]}"
    return {"watches": [w.model_dump(mode="json") for w in _watch_store.for_user(user_id)]}


@app.post("/shop/watches/{watch_id}/cancel")
async def shop_watch_cancel(watch_id: str) -> dict:
    watch = _watch_store.deactivate(watch_id)
    if watch is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy watch (hoặc đã tắt)")
    return {"ok": True, "watch": watch.model_dump(mode="json")}


@app.post("/shop/monitor/run")
async def monitor_run() -> dict:
    """Chạy 1 vòng monitor ngay — demo tính năng agent tự hành động."""
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
