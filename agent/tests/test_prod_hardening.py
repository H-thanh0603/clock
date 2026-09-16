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


def test_client_ip_takes_last_hop():
    """XFF 'spoofed, real' sau 1 proxy tin cậy → IP là entry cuối.

    Lấy entry đầu như trước đây cho phép attacker đặt IP tùy ý bằng
    1 header → bypass rate-limit + đầu độc bucket người khác.
    """
    from aurel_agents.host import client_ip_from_headers

    assert (
        client_ip_from_headers("1.2.3.4, 203.0.113.77", "9.9.9.9", hops=1)
        == "203.0.113.77"
    )
    # 2 proxy tin cậy (CDN → Caddy): bỏ 2 entry cuối.
    assert (
        client_ip_from_headers("1.2.3.4, 203.0.113.77, 10.0.0.1", "x", hops=2)
        == "203.0.113.77"
    )
    # Không có header → fallback socket peer.
    assert client_ip_from_headers(None, "10.0.0.9") == "10.0.0.9"
    assert client_ip_from_headers("", "10.0.0.9") == "10.0.0.9"
    assert client_ip_from_headers(None, "") == "unknown"


def test_ensure_merchant_token_fail_closed():
    """REQUIRE=1 mà token trống → từ chối khởi động (không phục vụ mở toang)."""
    from types import SimpleNamespace

    import pytest

    from aurel_agents.host import ensure_merchant_token

    with pytest.raises(RuntimeError):
        ensure_merchant_token(
            SimpleNamespace(merchant_token_required=True, merchant_token=None)
        )
    with pytest.raises(RuntimeError):
        ensure_merchant_token(
            SimpleNamespace(merchant_token_required=True, merchant_token="")
        )
    # Dev (không require) và prod đủ token → qua.
    ensure_merchant_token(
        SimpleNamespace(merchant_token_required=False, merchant_token=None)
    )
    ensure_merchant_token(
        SimpleNamespace(merchant_token_required=True, merchant_token="s3cret")
    )


def test_shop_alerts_for_filters_by_user_and_kind():
    """Feed shop chỉ chứa restock/price_drop CỦA CHÍNH session."""
    from types import SimpleNamespace

    from aurel_agents.host import SHOP_ALERT_KINDS, shop_alerts_for

    assert SHOP_ALERT_KINDS == frozenset({"restock", "price_drop"})

    def mk(kind, user):
        return SimpleNamespace(kind=kind, data={"user_id": user})
    alerts = [
        mk("restock", "shopper:aaaa"),
        mk("price_drop", "shopper:aaaa"),
        mk("restock", "shopperbbbb"),
        mk("low_stock", "shopper:aaaa"),
        mk("ticket", "shopper:aaaa"),
        mk("pending_orders", "shopper:aaaa"),
    ]
    mine = shop_alerts_for(alerts, "shopper:aaaa")
    assert len(mine) == 2
    assert {a.kind for a in mine} == {"restock", "price_drop"}


def test_alerts_shop_scope_public_but_filtered():
    """GET /alerts?scope=shop không cần token nhưng chỉ trả alert của mình."""
    from fastapi.testclient import TestClient

    import aurel_agents.host as host

    client = TestClient(host.app)
    # Publish trực tiếp vào feed module-level rồi dọn (tránh rò rỉ state).
    feed = host._alert_feed
    before = len(feed.all())
    mine = feed.publish("restock", "Về hàng", "chi tiết", {"user_id": "shopper:deadbeef"})
    other = feed.publish("restock", "Về hàng", "chi tiết", {"user_id": "shopper:otherusr"})
    ops = feed.publish("low_stock", "Tồn kho thấp", "chi tiết", {})
    try:
        r = client.get("/alerts", params={"scope": "shop", "session_id": "deadbeef99"})
        assert r.status_code == 200
        ids = {a["alert_id"] for a in r.json()["alerts"]}
        assert mine.alert_id in ids
        assert other.alert_id not in ids
        assert ops.alert_id not in ids
    finally:
        feed.remove(mine.alert_id, "alert_id")
        feed.remove(other.alert_id, "alert_id")
        feed.remove(ops.alert_id, "alert_id")
        assert len(feed.all()) == before
