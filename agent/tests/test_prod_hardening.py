# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Test prod-hardening agent: transcript, rate-limit, ledger, multi-user email."""

from __future__ import annotations

import pytest


def test_sanitize_session_id():
    from aurel_agents.session_pool import sanitize_session_id

    assert sanitize_session_id("abc-123_XYZ") == "abc-123_XYZ"
    assert sanitize_session_id("../../etc/passwd") == "etcpasswd"
    assert sanitize_session_id("") == "default"


def test_transcript_store_roundtrip(tmp_path):
    from aurel_agents.session_pool import TranscriptStore

    store = TranscriptStore(tmp_path / "sessions")
    assert store.load("s1") == []
    store.load("s1").append({"role": "user", "content": "hello"})
    store.save("s1")
    store2 = TranscriptStore(tmp_path / "sessions")
    assert store2.load("s1") == [{"role": "user", "content": "hello"}]


def test_transcript_store_caps_at_200(tmp_path):
    from aurel_agents.session_pool import MAX_TRANSCRIPT_MESSAGES, TranscriptStore

    store = TranscriptStore(tmp_path / "s")
    t = store.load("big")
    for i in range(250):
        t.append({"role": "user", "content": str(i)})
    store.save("big")
    assert len(TranscriptStore(tmp_path / "s").load("big")) == MAX_TRANSCRIPT_MESSAGES


def test_rate_limiter():
    from aurel_agents.session_pool import RateLimiter

    limiter = RateLimiter()
    assert limiter.allow("ip", 0) is True  # 0 = tắt
    assert limiter.allow("ip", 2) is True
    assert limiter.allow("ip", 2) is True
    assert limiter.allow("ip", 2) is False
    assert limiter.allow("other", 2) is True


def test_ledger_save_load_roundtrip(tmp_path):
    from merchant_agent import ActorKind, ChangeItem, ChangeKind
    from merchant_agent.changes import ChangeLedger
    from merchant_agent.config import MerchantAgentConfig

    from aurel_agents.session_pool import load_ledger, save_ledger

    ledger = ChangeLedger(MerchantAgentConfig(brand_name="Aurel & Co."))
    change = ledger.stage(
        kind=ChangeKind.PRICE_UPDATE,
        summary="test",
        items=[ChangeItem(target="x", field="price", before=100.0, after=105.0)],
        actor="op",
        actor_kind=ActorKind.AGENT,
        currency="USD",
    )
    path = tmp_path / "ledger.json"
    save_ledger(ledger, path)
    assert path.exists()
    ledger2 = ChangeLedger(MerchantAgentConfig(brand_name="Aurel & Co."))
    assert load_ledger(ledger2, path) == 1
    assert ledger2.get(change.change_id) is not None
    # Stage tiếp không trùng id
    change2 = ledger2.stage(
        kind=ChangeKind.PRICE_UPDATE,
        summary="test2",
        items=[ChangeItem(target="y", field="price", before=50.0, after=52.0)],
        actor="op",
        actor_kind=ActorKind.AGENT,
        currency="USD",
    )
    assert change2.change_id != change.change_id


def test_pooled_shopper_email_derivation():
    from types import SimpleNamespace

    from aurel_agents.session_pool import PooledStorefront

    pool = PooledStorefront(
        SimpleNamespace(
            shopper_email="agent-shopper@aurel.local",
            shopper_password="x",
            backend_url="http://localhost:4000",
        )
    )
    assert pool._email_for("abcdef123456") == "agent-shopper+abcdef12@aurel.local"
    assert pool._email_for("abcdef123456") != pool._email_for("zzzzzzzz9999")


def test_pooled_storefront_covers_backend_interface():
    """PooledStorefront phải có đủ mọi method runtime dùng (từng thiếu
    get_account_context/get_disclosure → chat 500 giữa chừng)."""
    import inspect

    from shopping_agent import StorefrontBackend

    from aurel_agents.session_pool import PooledStorefront

    required = {
        name
        for name, member in inspect.getmembers(StorefrontBackend, inspect.isfunction)
        if not name.startswith("_")
    }
    missing = {name for name in required if not hasattr(PooledStorefront, name)}
    assert not missing, f"PooledStorefront thiếu: {missing}"


@pytest.mark.asyncio
async def test_pooled_storefront_delegates_optional_hooks():
    """get_account_context/get_disclosure delegate về backend theo session."""
    from types import SimpleNamespace

    from aurel_agents.session_pool import PooledStorefront

    class StubBackend:
        async def get_account_context(self, session):
            return {"plan": "vip"}

        async def get_disclosure(self, session, product_id):
            return None

    pool = PooledStorefront(
        SimpleNamespace(
            shopper_email="agent-shopper@aurel.local",
            shopper_password="x",
            backend_url="http://localhost:4000",
        )
    )
    pool._backends["sess1234"] = StubBackend()
    session = SimpleNamespace(session_id="sess1234")
    assert await pool.get_account_context(session) == {"plan": "vip"}
    assert await pool.get_disclosure(session, "slug-x") is None


def test_config_max_tokens_wiring(monkeypatch):
    from aurel_agents.config import (
        build_merchant_config,
        build_shopping_config,
        get_settings,
    )

    get_settings.cache_clear()
    monkeypatch.setenv("AGENT_MAX_TOKENS", "8192")
    monkeypatch.setenv("AGENT_REQUEST_TIMEOUT_S", "300")
    get_settings.cache_clear()
    try:
        assert get_settings().max_tokens == 8192
        assert build_shopping_config(get_settings()).max_tokens == 8192
        assert build_merchant_config(get_settings()).max_tokens == 8192
        assert build_shopping_config(get_settings()).request_timeout_s == 300.0
    finally:
        monkeypatch.delenv("AGENT_MAX_TOKENS", raising=False)
        monkeypatch.delenv("AGENT_REQUEST_TIMEOUT_S", raising=False)
        get_settings.cache_clear()


def test_host_health_and_merchant_auth():
    from fastapi.testclient import TestClient

    import aurel_agents.host as host

    client = TestClient(host.app)
    data = client.get("/health").json()
    assert data["ok"] is True
    assert "shopping_agent" in data
    # Không backend merchant trong test → 503 hoặc 401/503 đều chấp nhận,
    # nhưng route phải tồn tại (không 404).
    resp = client.get("/merchant/changes")
    assert resp.status_code in (401, 503)


def test_host_merchant_token_guard(monkeypatch):
    from fastapi.testclient import TestClient

    import aurel_agents.host as host
    from aurel_agents.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("AGENT_MERCHANT_TOKEN", "secret-token")
    get_settings.cache_clear()
    try:
        client = TestClient(host.app)
        assert client.get("/merchant/changes").status_code == 401
        ok = client.get("/merchant/changes", headers={"x-agent-token": "secret-token"})
        assert ok.status_code in (503,)  # qua auth, dừng ở backend chưa sẵn sàng
    finally:
        monkeypatch.delenv("AGENT_MERCHANT_TOKEN", raising=False)
        get_settings.cache_clear()
