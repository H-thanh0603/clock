# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""A2A endpoint: JSON-RPC chuẩn, guard chung, không lộ merchant."""

from __future__ import annotations

import pytest

from aurel_agents import a2a


class _Host:
    def __init__(self, settings):
        self._settings = settings
        self.turns: list[tuple[str, str]] = []

    def get_settings(self):
        return self._settings

    def _require_agent(self, role: str):
        return object()

    async def _run_shopping_turn(self, agent, message, session_id, trace_id=None):
        self.turns.append((session_id, message))
        yield {"type": "text_delta", "text": "Chào bạn"}
        yield {"type": "ui", "component": "present_products",
               "data": {"title": "Gợi ý"}}
        yield {"type": "done"}


def _settings():
    from aurel_agents.config import Settings

    return Settings(
        backend_url="http://be.test",
        chat_rate_limit_per_min=0,  # tắt rate cho test logic (test riêng ở dưới)
        chat_turns_per_day=0,
        global_turns_per_day=0,
    )


def _msg(text: str = "tìm tourbillon") -> dict:
    return {"message": {"role": "user", "parts": [{"kind": "text", "text": text}]}}


@pytest.mark.asyncio
async def test_send_creates_task_and_runs_turn():
    host = _Host(_settings())
    out = await a2a.dispatch(host, a2a.RpcRequest(id=1, method="message/send", params=_msg()))
    assert out["id"] == 1 and "error" not in out
    task = out["result"]
    assert task["id"].startswith("a2a-")
    assert task["status"]["state"] == "completed"
    assert task["history"][-1]["role"] == "agent"
    assert task["history"][-1]["parts"][0]["text"] == "Chào bạn"
    assert any(a["name"] == "present_products" for a in task["artifacts"])
    assert host.turns and host.turns[0][0] == f"a2a:{task['id']}"


@pytest.mark.asyncio
async def test_send_continues_existing_task():
    host = _Host(_settings())
    first = await a2a.dispatch(host, a2a.RpcRequest(id=1, method="message/send", params=_msg("câu 1")))
    tid = first["result"]["id"]
    params = _msg("câu 2")
    params["taskId"] = tid
    second = await a2a.dispatch(host, a2a.RpcRequest(id=2, method="message/send", params=params))
    assert second["result"]["id"] == tid
    assert len(second["result"]["history"]) == 4  # user,agent,user,agent
    assert len(host.turns) == 2


@pytest.mark.asyncio
async def test_unknown_task_and_method_are_rpc_errors():
    host = _Host(_settings())
    out = await a2a.dispatch(
        host, a2a.RpcRequest(id=1, method="message/send",
                             params={**_msg(), "taskId": "a2a-khong-co"}))
    assert out["error"]["code"] == -32004
    out2 = await a2a.dispatch(host, a2a.RpcRequest(id=2, method="tasks/delete", params={}))
    assert out2["error"]["code"] == -32601
    out3 = await a2a.dispatch(host, a2a.RpcRequest(id=3, method="message/send", params={}))
    assert out3["error"]["code"] == -32602  # thiếu message


@pytest.mark.asyncio
async def test_tasks_get_and_cancel():
    host = _Host(_settings())
    created = await a2a.dispatch(host, a2a.RpcRequest(id=1, method="message/send", params=_msg()))
    tid = created["result"]["id"]
    got = await a2a.dispatch(host, a2a.RpcRequest(id=2, method="tasks/get", params={"id": tid}))
    assert got["result"]["id"] == tid
    assert got["result"]["status"]["state"] == "completed"
    # cancel task đã terminal → idempotent, vẫn completed
    cancelled = await a2a.dispatch(
        host, a2a.RpcRequest(id=3, method="tasks/cancel", params={"id": tid}))
    assert cancelled["result"]["status"]["state"] == "completed"
    assert (await a2a.dispatch(
        host, a2a.RpcRequest(id=4, method="tasks/get", params={"id": "a2a-x"}))
    )["error"]["code"] == -32004


@pytest.mark.asyncio
async def test_stream_returns_sse_marker_and_flows():
    host = _Host(_settings())
    out = await a2a.dispatch(host, a2a.RpcRequest(id=1, method="message/stream", params=_msg()))
    gen = out.get("__sse__")
    assert gen is not None
    chunks = [c async for c in gen]
    assert len(chunks) == 2  # working + completed
    import json as _json

    first = _json.loads(chunks[0].removeprefix("data: ").strip())
    assert first["result"]["status"]["state"] == "working"
    last = _json.loads(chunks[1].removeprefix("data: ").strip())
    assert last["result"]["status"]["state"] == "completed"


@pytest.mark.asyncio
async def test_budget_guard_shared_with_shop_chat():
    """A2A dùng chung budget với /shop/chat: hết hạn mức session → -32001."""
    from aurel_agents.config import Settings

    host = _Host(Settings(
        backend_url="http://be.test", chat_rate_limit_per_min=0,
        chat_turns_per_day=1, global_turns_per_day=0,
    ))
    # Pre-fill: session của task này đã hết hạn mức (giả lập đã chat 1 turn).
    first = await a2a.dispatch(host, a2a.RpcRequest(id=1, method="message/send", params=_msg()))
    tid = first["result"]["id"]
    params = _msg("câu 2")
    params["taskId"] = tid
    # Task của session a2a:<tid> đã dùng 1/1 turn → turn tiếp theo bị chặn.
    out = await a2a.dispatch(host, a2a.RpcRequest(id=2, method="message/send", params=params))
    assert out["error"]["code"] == -32001
    assert len(host.turns) == 1  # turn 2 không chạy


def test_agent_card_only_shop():
    card = a2a.build_agent_card("https://shop.example.com/")
    assert card["url"] == "https://shop.example.com/a2a"
    assert card["protocolVersion"] == "0.3"
    assert {s["id"] for s in card["skills"]} == {"concierge", "watch", "order-lookup"}
    raw = str(card).lower()
    assert "merchant" not in raw or "không expose" in raw or "merchant) không" in raw


def test_empty_message_rejected():
    import asyncio

    async def _run():
        host = _Host(_settings())
        return await a2a.dispatch(
            host, a2a.RpcRequest(
                id=1, method="message/send",
                params={"message": {"role": "user", "parts": []}}))
    out = asyncio.new_event_loop().run_until_complete(_run())
    assert out["error"]["code"] == -32602
