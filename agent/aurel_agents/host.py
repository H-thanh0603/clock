# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Agent host: FastAPI app chạy shopping + merchant agent của Aurel & Co.

Endpoints:
- POST /shop/chat        — chat với concierge (shopping agent), stream SSE
- POST /merchant/chat    — chat với trợ lý vận hành (merchant agent), stream SSE
- GET  /health           — trạng thái
- GET  /                 — mô tả API

Chạy: ``uvicorn aurel_agents.host:app --port 8100`` từ thư mục agent/
(hoặc ``python -m aurel_agents.host``).

Provider: client Anthropic trỏ ``base_url`` tới gateway tương thích — xem
``aurel_agents/config.py``. Không có key thì app vẫn khởi động được (health OK),
chỉ không chat được (503 với hướng dẫn).
"""

from __future__ import annotations

import json
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from aurel_agents.clock_client import ClockClient
from aurel_agents.config import (
    MERCHANT_SKILLS,
    SHOPPING_SKILLS,
    build_anthropic_client,
    build_merchant_config,
    build_shopping_config,
    get_settings,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s"
)
logger = logging.getLogger("aurel-agents")


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


# --- state khởi động -----------------------------------------------------------

_state: dict[str, Any] = {}
# session transcripts: session_id → list messages (giống examples/demo_common,
# store in-memory; host thật sẽ subclass SessionStore đưa xuống DB riêng)
_sessions: dict[str, list[dict[str, Any]]] = {}


async def _make_shopping_agent():
    from shopping_agent_runtime import ShoppingAgent

    from aurel_agents.shopping.backend import AurelStorefront

    settings = get_settings()
    client = ClockClient(
        settings.backend_url,
        settings.shopper_email,
        settings.shopper_password,
        register_if_new=True,
    )
    await client.ensure_session()
    agent = ShoppingAgent(
        backend=AurelStorefront(client),
        skills_dir=SHOPPING_SKILLS,
        config=build_shopping_config(settings),
        client=build_anthropic_client(settings),
    )
    return agent, client


async def _make_merchant_agent():
    from merchant_agent_runtime import MerchantAgent

    from aurel_agents.merchant.backend import AurelMerchant

    settings = get_settings()
    client = ClockClient(
        settings.backend_url,
        settings.admin_email,
        settings.admin_password,
        register_if_new=False,  # admin đã có từ seed; không tự tạo admin mới
    )
    await client.ensure_session()
    agent = MerchantAgent(
        backend=AurelMerchant(client),
        skills_dir=MERCHANT_SKILLS,
        config=build_merchant_config(settings),
        client=build_anthropic_client(settings),
    )
    return agent, client


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("Agent host: backend=%s model=%s", settings.backend_url, settings.model)
    try:
        shopping, shopper_client = await _make_shopping_agent()
        _state["shopping"] = shopping
        _state["shopper_client"] = shopper_client
        logger.info("Shopping agent sẵn sàng (shopper=%s)", settings.shopper_email)
    except Exception as error:
        logger.warning("Shopping agent không khởi động được: %s", error)
        _state["shopping"] = None
    try:
        merchant, admin_client = await _make_merchant_agent()
        _state["merchant"] = merchant
        _state["admin_client"] = admin_client
        logger.info("Merchant agent sẵn sàng (admin=%s)", settings.admin_email)
    except Exception as error:
        logger.warning("Merchant agent không khởi động được: %s", error)
        _state["merchant"] = None
    yield
    for key in ("shopper_client", "admin_client"):
        client = _state.pop(key, None)
        if client:
            await client.aclose()
    _state.clear()


app = FastAPI(title="Aurel & Co. AI Agents", lifespan=lifespan)


# --- helpers ---------------------------------------------------------------------


def _new_session_id() -> str:
    return uuid.uuid4().hex


def _sse(payload: dict[str, Any] | str) -> str:
    body = payload if isinstance(payload, str) else json.dumps(payload, default=str)
    return f"data: {body}\n\n"


async def _run_shopping_turn(agent: Any, message: str, session_id: str):
    """1 turn shopping agent: giữ transcript theo session qua _sessions."""
    from shopping_agent import PageContext, ShoppingSessionContext, ShoppingSessionState

    transcript = _sessions.setdefault(session_id, [])
    transcript.append({"role": "user", "content": message})
    context = ShoppingSessionContext(
        session_id=session_id,
        user_id=f"shopper:{session_id[:8]}",
        page=PageContext(page_type="other", query=message[:80]),
    )
    state = ShoppingSessionState()

    yield _sse({"type": "session", "session_id": session_id})
    try:
        async for event in agent.stream_turn(transcript, context, state):
            yield _sse(event)
    except Exception as error:
        logger.exception("Lỗi shopping turn")
        yield _sse({"type": "error", "message": str(error)})
        return
    yield _sse({"type": "done"})


async def _run_merchant_turn(agent: Any, message: str, session_id: str):
    """1 turn merchant agent: MerchantSessionContext + MerchantSessionState."""
    from merchant_agent import MerchantSessionContext, MerchantSessionState

    transcript = _sessions.setdefault(session_id, [])
    transcript.append({"role": "user", "content": message})
    context = MerchantSessionContext(
        session_id=session_id,
        merchant_id="aurel",
        operator=f"operator:{session_id[:8]}",
    )
    state = MerchantSessionState()

    yield _sse({"type": "session", "session_id": session_id})
    try:
        async for event in agent.stream_turn(transcript, context, state):
            yield _sse(event)
    except Exception as error:
        logger.exception("Lỗi merchant turn")
        yield _sse({"type": "error", "message": str(error)})
        return
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


# --- routes ------------------------------------------------------------------------


@app.get("/")
async def index() -> dict:
    return {
        "service": "aurel-agents",
        "endpoints": {
            "shop_chat": "POST /shop/chat {message, session_id?}",
            "merchant_chat": "POST /merchant/chat {message, session_id?}",
            "health": "GET /health",
        },
        "upstream": "anthropics/commerce-agents (vendored, Apache-2.0)",
    }


@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "shopping_agent": _state.get("shopping") is not None,
        "merchant_agent": _state.get("merchant") is not None,
    }


@app.post("/shop/chat")
async def shop_chat(req: ChatRequest):
    agent = _require_agent("shopping")
    session_id = req.session_id or _new_session_id()
    return StreamingResponse(
        _run_shopping_turn(agent, req.message, session_id),
        media_type="text/event-stream",
    )


@app.post("/merchant/chat")
async def merchant_chat(req: ChatRequest):
    agent = _require_agent("merchant")
    session_id = req.session_id or _new_session_id()
    return StreamingResponse(
        _run_merchant_turn(agent, req.message, session_id),
        media_type="text/event-stream",
    )


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "aurel_agents.host:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )
