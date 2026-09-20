# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Token gate cho MCP merchant: sai/thiếu token → chặn trước khi tool chạy."""

from __future__ import annotations

import pytest

from aurel_agents import mcp_auth


class _Headers(dict):
    pass


class _FakeCtx:
    def __init__(self, headers: dict[str, str]):
        # Mô phỏng MCP 1.x: ctx.request_context.request = Starlette Request.
        self.request_context = type(
            "RC", (), {"request": type("R", (), {"headers": _Headers(headers)})()}
        )()


def test_ok_token_passes():
    mcp_auth.check_token(_FakeCtx({"x-agent-token": "s3cret"}), "s3cret")


def test_wrong_token_blocked():
    with pytest.raises(PermissionError):
        mcp_auth.check_token(_FakeCtx({"x-agent-token": "sai"}), "s3cret")


def test_missing_token_header_blocked():
    """HTTP request thật (có Host) nhưng thiếu x-agent-token → chặn."""
    with pytest.raises(PermissionError):
        mcp_auth.check_token(_FakeCtx({"host": "x"}), "s3cret")


def test_header_case_insensitive():
    mcp_auth.check_token(_FakeCtx({"X-Agent-Token": "s3cret"}), "s3cret")


def test_no_http_headers_means_internal_call():
    # ctx không có HTTP request (gọi nội bộ/vendor test) → miễn gate.
    mcp_auth.check_token(_FakeCtx({}), "s3cret")
    mcp_auth.check_token(object(), "s3cret")
    mcp_auth.check_token(None, "s3cret")


def test_empty_expected_never_passes():
    # Kể cả attacker gửi rỗng thì expected rỗng cũng không cho qua.
    with pytest.raises(PermissionError):
        mcp_auth.check_token(_FakeCtx({"host": "x", "x-agent-token": ""}), "")


def test_merchant_server_refuses_without_token(monkeypatch):
    from aurel_agents import mcp as mcp_module

    monkeypatch.delenv("AGENT_MERCHANT_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="AGENT_MERCHANT_TOKEN"):
        mcp_module.build_merchant_server()


def _mcp_client_headers(session_id: str | None = None) -> dict[str, str]:
    h = {
        "content-type": "application/json",
        "accept": "application/json, text/event-stream",
    }
    if session_id:
        h["mcp-session-id"] = session_id
    return h


@pytest.fixture
def _host_stores_isolated(tmp_path, monkeypatch):
    """Test mount host không đụng store JSON thật (data/*.json)."""
    from aurel_agents import host as _host
    from aurel_agents.proactive import AlertFeed, TaskStore, TicketStore, WatchStore
    from aurel_agents.session_pool import TranscriptStore

    # host.py bind tên module-level lúc import → patch đúng namespace host.
    monkeypatch.setattr(_host, "DATA_DIR", tmp_path / "data")
    monkeypatch.setattr(_host, "_transcripts", TranscriptStore(tmp_path / "sessions"))
    monkeypatch.setattr(_host, "_watch_store", WatchStore(tmp_path / "w.json"))
    monkeypatch.setattr(_host, "_alert_feed", AlertFeed(tmp_path / "a.json"))
    monkeypatch.setattr(_host, "_ticket_store", TicketStore(tmp_path / "t.json"))
    monkeypatch.setattr(_host, "_task_store", TaskStore(tmp_path / "tasks.json"))
    yield tmp_path / "data"


def _sse_json(text: str) -> dict:
    """Parse body SSE streamable-HTTP (event: message + data: {...})."""
    import json as _json

    for line in text.splitlines():
        line = line.strip()
        if line.startswith("data:"):
            try:
                return _json.loads(line[5:].strip())
            except Exception:
                continue
    raise AssertionError(f"không parse được SSE: {text[:200]}")


def _init_session(client, path: str) -> str:
    r = client.post(
        path,
        json={
            "jsonrpc": "2.0",
            "id": 0,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "t", "version": "1"},
            },
        },
        headers=_mcp_client_headers(),
    )
    assert r.status_code == 200, r.text[:200]
    sid = r.headers.get("mcp-session-id")
    assert sid, "thiếu mcp-session-id"
    client.post(
        path,
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        headers=_mcp_client_headers(sid),
    )
    return sid


def test_mounted_shop_lists_tools(respx_mock, monkeypatch, _host_stores_isolated):
    """Host mount /mcp/shop qua ASGI: initialize → tools/list thấy tool thật."""
    from fastapi.testclient import TestClient

    # Token gate merchant là singleton process-wide (bọc vendor 1 lần duy nhất
    # cho cả suite). Test này KHÔNG đụng AGENT_MERCHANT_TOKEN để không làm
    # rò rỉ token của test khác qua closure gate.
    monkeypatch.setenv("AUREL_BACKEND_URL", "http://localhost:4000")
    respx_mock.post("http://localhost:4000/auth/login").respond(
        json={"user": {"id": "a", "email": "a@t", "role": "ADMIN"}}
    )
    respx_mock.get("http://localhost:4000/auth/csrf").respond(
        json={"csrfToken": "t" * 32}
    )
    respx_mock.get(url__regex=r"http://localhost:4000.*").respond(
        json={"items": [], "total": 0}
    )
    respx_mock.post(url__regex=r"http://localhost:4000.*").respond(json={})

    with respx_mock:
        from aurel_agents import host as h

        with TestClient(h.app, raise_server_exceptions=False) as client:
            assert h._state.get("mcp_mounted", {}).get("/mcp/shop") == "shop"
            sid = _init_session(client, "/mcp/shop/mcp")
            r = client.post(
                "/mcp/shop/mcp",
                json={"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}},
                headers=_mcp_client_headers(sid),
            )
            assert r.status_code == 200, r.text[:200]
            names = [t["name"] for t in _sse_json(r.text)["result"]["tools"]]
            assert "search_products" in names
            assert "add_to_cart" in names


def test_mounted_merchant_tool_requires_token(respx_mock, monkeypatch, _host_stores_isolated):
    """Merchant qua mount: tool call thiếu token → PermissionError (gate).

    Dùng đúng token "t" như test shop phía trên (gate là singleton bọc 1 lần
    cho cả process — token nào bọc trước thì test sau phải dùng token đó).
    """
    from fastapi.testclient import TestClient

    monkeypatch.setenv("AUREL_BACKEND_URL", "http://localhost:4000")
    monkeypatch.setenv("AGENT_MERCHANT_TOKEN", "t")
    respx_mock.post("http://localhost:4000/auth/login").respond(
        json={"user": {"id": "a", "email": "a@t", "role": "ADMIN"}}
    )
    respx_mock.get("http://localhost:4000/auth/csrf").respond(
        json={"csrfToken": "t" * 32}
    )
    respx_mock.get(url__regex=r"http://localhost:4000.*").respond(
        json={"items": [], "total": 0}
    )
    respx_mock.post(url__regex=r"http://localhost:4000.*").respond(json={})

    with respx_mock:
        from aurel_agents import host as h

        with TestClient(h.app, raise_server_exceptions=False) as client:
            assert h._state.get("mcp_mounted", {}).get("/mcp/merchant") == "merchant"
            sid = _init_session(client, "/mcp/merchant/mcp")
            # get_pending_changes không token → tool raise PermissionError.
            r = client.post(
                "/mcp/merchant/mcp",
                json={
                    "jsonrpc": "2.0",
                    "id": 2,
                    "method": "tools/call",
                    "params": {"name": "get_pending_changes", "arguments": {}},
                },
                headers=_mcp_client_headers(sid),
            )
            assert r.status_code == 200, r.text[:200]
            body = _sse_json(r.text)
            err = body.get("result", {}).get("isError") or "error" in body
            text = str(body)
            assert err and "x-agent-token" in text
