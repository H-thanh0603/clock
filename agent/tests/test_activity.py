# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Test AI Activity Log: store JSONL + decorator + pool hook + endpoint."""

from __future__ import annotations

import json

import pytest


def test_record_and_recent_filters(tmp_path):
    from aurel_agents.activity import ActivityLog

    log = ActivityLog(tmp_path / "a.jsonl")
    log.record(role="shop", session_id="s1", actor="u1", tool="search_products", ok=True, ms=12)
    log.record(
        role="shop", session_id="s1", actor="u1", tool="add_to_cart",
        ok=False, ms=30, detail="slug-x", error="ClockApiError: 400",
    )
    log.record(role="merchant", session_id="m1", actor="op", tool="apply_change", ok=True, ms=200)
    assert len(log.recent(50)) == 3
    assert len(log.recent(50, role="shop")) == 2
    assert len(log.recent(50, session_id="m1")) == 1
    assert len(log.recent(50, ok=False)) == 1
    assert log.recent(50, ok=False)[0]["detail"] == "slug-x"
    # Mới nhất trước.
    assert log.recent(50)[0]["tool"] == "apply_change"
    # Không bao giờ ghi args thô.
    raw = (tmp_path / "a.jsonl").read_text(encoding="utf-8")
    assert "contact" not in raw and "090" not in raw


def test_cap_and_retention(tmp_path):
    from aurel_agents.activity import ActivityLog

    log = ActivityLog(tmp_path / "a.jsonl", cap=10)
    for i in range(25):
        log.record(role="s", session_id="x", actor="u", tool=f"t{i}", ok=True, ms=1)
    # Enforce mỗi 50 write — ép bằng gọi trực tiếp.
    log._enforce_cap()
    assert len(log.recent(100)) <= 10
    # trim_before xóa dòng cũ.
    old = log.recent(100)[-1]
    assert log.trim_before(float(old["ts"]) + 0.001) >= 1


def test_log_activity_decorator_ok_and_error():
    import asyncio
    import tempfile
    from pathlib import Path
    from types import SimpleNamespace

    from aurel_agents.activity import ActivityLog, log_activity

    tmp = Path(tempfile.mkdtemp())
    log = ActivityLog(tmp / "a.jsonl")

    class Backend:
        def __init__(self):
            self._activity = log

        @log_activity("merchant", lambda s, a, k: str(a[0]))
        async def apply_change(self, session, change_id):
            return f"applied-{change_id}"

        @log_activity("merchant")
        async def boom(self, session):
            raise RuntimeError("be chết")

        async def plain(self, session):
            return "no-log"

    b = Backend()
    session = SimpleNamespace(session_id="sess1", operator="op:1")
    assert asyncio.run(b.apply_change(session, "chg-7")) == "applied-chg-7"
    with pytest.raises(RuntimeError):
        asyncio.run(b.boom(session))
    # Method không decorate → không log.
    assert asyncio.run(b.plain(session)) == "no-log"

    items = log.recent(10)
    assert len(items) == 2
    applied = next(x for x in items if x["tool"] == "apply_change")
    assert applied["ok"] is True and applied["detail"] == "chg-7"
    assert applied["actor"] == "op:1"
    failed = next(x for x in items if x["tool"] == "boom")
    assert failed["ok"] is False and "RuntimeError" in (failed["error"] or "")


def test_log_activity_without_wired_log():
    """Backend chưa wire log (None) → chạy thẳng, không crash."""
    import asyncio
    from types import SimpleNamespace

    from aurel_agents.activity import log_activity

    class Backend:
        _activity = None

        @log_activity("shop")
        async def get_cart(self, session):
            return []

    assert asyncio.run(Backend().get_cart(SimpleNamespace(session_id="s"))) == []


def test_pool_logged_records_tool_and_failure():
    """PooledStorefront._logged: ghi ok/fail + detail, backend lỗi thì raise."""
    import asyncio
    from types import SimpleNamespace

    from aurel_agents.session_pool import PooledStorefront

    pool = PooledStorefront(
        SimpleNamespace(
            shopper_email="agent-shopper@aurel.local",
            shopper_password="x",
            backend_url="http://localhost:4000",
        )
    )
    records = []

    class StubLog:
        def record(self, **kw):
            records.append(kw)

    pool._activity = StubLog()

    class StubBackend:
        async def search_products(self, session, query, filters=None, limit=8):
            return ["p1"]

        async def add_to_cart(self, session, product_id, quantity):
            raise RuntimeError("hết hàng")

    async def _fake_backend_for(sid):
        return StubBackend()

    pool._backend_for = _fake_backend_for  # type: ignore[method-assign]
    session = SimpleNamespace(session_id="sess9", user_id="shopper:abc")

    assert asyncio.run(pool.search_products(session, "tourbillon")) == ["p1"]
    with pytest.raises(RuntimeError):
        asyncio.run(pool.add_to_cart(session, "slug-x", 1))

    assert len(records) == 2
    ok_rec = next(r for r in records if r["tool"] == "search_products")
    assert ok_rec["ok"] is True and ok_rec["actor"] == "shopper:abc"
    fail_rec = next(r for r in records if r["tool"] == "add_to_cart")
    assert fail_rec["ok"] is False and fail_rec["detail"] == "slug-x"
    assert "RuntimeError" in fail_rec["error"]


def test_activity_endpoint_gated_and_filtered(tmp_path, monkeypatch):
    from types import SimpleNamespace

    from fastapi.testclient import TestClient

    import aurel_agents.host as host
    from aurel_agents.activity import ActivityLog

    log = ActivityLog(tmp_path / "act.jsonl")
    log.record(role="shop", session_id="s1", actor="u", tool="search_products", ok=True, ms=5)
    log.record(role="merchant", session_id="m1", actor="op", tool="apply_change", ok=True, ms=9)
    monkeypatch.setattr(host, "_activity_log", log)
    # Bật token merchant cho test này.
    monkeypatch.setattr(
        host, "get_settings",
        lambda: SimpleNamespace(merchant_token="tok", trust_proxy_hops=1),
    )
    client = TestClient(host.app)
    assert client.get("/activity").status_code == 401
    ok = client.get("/activity", headers={"x-agent-token": "tok"})
    assert ok.status_code == 200
    assert len(ok.json()["activity"]) == 2
    filt = client.get(
        "/activity?role=merchant", headers={"x-agent-token": "tok"}
    )
    assert [a["tool"] for a in filt.json()["activity"]] == ["apply_change"]


def test_activity_jsonl_survives_restart_shape(tmp_path):
    """File JSONL đọc được sau restart (dòng hỏng bỏ qua, không crash)."""
    from aurel_agents.activity import ActivityLog

    p = tmp_path / "a.jsonl"
    log = ActivityLog(p)
    log.record(role="s", session_id="x", actor="u", tool="t", ok=True, ms=1)
    with open(p, "a", encoding="utf-8") as f:
        f.write("dòng rác không phải json\n")
        f.write(json.dumps({"ts": 1, "role": "s"}) + "\n")
    assert len(ActivityLog(p).recent(10)) == 2
