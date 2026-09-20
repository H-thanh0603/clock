# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Test Jev (TypeSafe decision model) cho handoff ticket: parse client,
fallback khi thiếu key/chết, wiring async trong host (classify mock —
không tốn call thật).
"""

from __future__ import annotations

import pytest

from aurel_agents import jev
from aurel_agents.config import Settings

BASE = "https://jev.test/v1/systemone"


def _kw(**over):
    kw = {
        "api_key": "jev-test-key",
        "base_url": BASE,
        "model": "jev-latest",
        "threshold": 0.7,
        "timeout_s": 5.0,
    }
    kw.update(over)
    return kw


def test_classify_no_key_returns_none():
    """Thiếu key = Jev tắt, không gọi HTTP — caller fallback heuristic."""
    assert jev.classify("đồng hồ hỏng rồi", **_kw(api_key=None)) is None


def test_classify_complaint_with_department(respx_mock):
    respx_mock.post(BASE).respond(
        json={
            "answers": {
                "is_complaint": {"type": "noul", "noul": 0.93},
                "department": {"type": "choice", "choice": "technical", "confidence": 0.8},
                "severity": {"type": "choice", "choice": "urgent"},
                "sentiment": {"type": "choice", "choice": "angry"},
            }
        }
    )
    v = jev.classify("mặt kính xước hết", **_kw())
    assert v is not None and v.is_complaint is True
    assert v.department == "technical"
    assert v.severity == "urgent"
    assert v.sentiment == "angry"
    assert v.confidence == pytest.approx(0.93)


def test_classify_below_threshold_is_not_complaint(respx_mock):
    respx_mock.post(BASE).respond(
        json={"answers": {"is_complaint": {"type": "noul", "noul": 0.2}}}
    )
    v = jev.classify("cho tôi xem tourbillon", **_kw())
    assert v is not None and v.is_complaint is False


def test_classify_http_error_returns_none(respx_mock):
    """Jev chết → None, handoff fallback heuristic (như Meili fallback Prisma)."""
    respx_mock.post(BASE).respond(status_code=500, json={})
    assert jev.classify("đồng hồ hỏng rồi", **_kw()) is None


def test_classify_bad_payload_returns_none(respx_mock):
    respx_mock.post(BASE).respond(json={"answers": {}})
    assert jev.classify("đồng hồ hỏng rồi", **_kw()) is None


def _reset_host_stores(tmp_path):
    import aurel_agents.host as host
    from aurel_agents.proactive import AlertFeed, TicketStore, WatchStore

    host._watch_store = WatchStore(tmp_path / "w.json")
    host._alert_feed = AlertFeed(tmp_path / "a.json")
    host._ticket_store = TicketStore(tmp_path / "t.json")
    return host


@pytest.mark.asyncio
async def test_async_heuristic_hit_skips_jev(tmp_path, monkeypatch):
    """Từ khoá rõ → ticket luôn, tốn 0 Jev call."""
    host = _reset_host_stores(tmp_path)
    calls: list = []
    monkeypatch.setattr(
        "aurel_agents.jev.classify", lambda *a, **k: calls.append(1) or None
    )
    t = await host._maybe_handoff_ticket_async("Tôi khiếu nại đơn AC-2026-000123", "s1")
    assert t is not None and t.order_id == "AC-2026-000123"
    assert calls == []


@pytest.mark.asyncio
async def test_async_jev_confirms_implicit_complaint(tmp_path, monkeypatch):
    """Khiếu nại không chứa từ khoá → Jev xác nhận + route đội xử lý + triage."""
    host = _reset_host_stores(tmp_path)

    def _fake_classify(*a, **k):
        return jev.JevVerdict(
            is_complaint=True,
            department="logistics",
            severity="normal",
            sentiment="upset",
        )

    monkeypatch.setattr("aurel_agents.jev.classify", _fake_classify)
    monkeypatch.setattr(host, "get_settings", lambda: Settings(jev_api_key="k"))
    t = await host._maybe_handoff_ticket_async(
        "đồng hồ tới tay mặt kính xước hết, thất vọng", "s"
    )
    assert t is not None
    alerts = [a for a in host._alert_feed.recent(10) if a.kind == "ticket"]
    assert alerts and alerts[0].data.get("department") == "logistics"
    assert alerts[0].data.get("severity") == "normal"
    assert alerts[0].data.get("sentiment") == "upset"


@pytest.mark.asyncio
async def test_async_jev_down_fallback_no_ticket(tmp_path, monkeypatch):
    """Jev chết → None, không ticket rác (giữ đúng hành vi heuristic cũ)."""
    host = _reset_host_stores(tmp_path)
    monkeypatch.setattr("aurel_agents.jev.classify", lambda *a, **k: None)
    monkeypatch.setattr(host, "get_settings", lambda: Settings(jev_api_key="k"))
    assert (
        await host._maybe_handoff_ticket_async("đồng hồ tới tay mặt kính xước", "s")
        is None
    )
    assert host._ticket_store.open_tickets() == []


@pytest.mark.asyncio
async def test_async_policy_question_never_asks_jev(tmp_path, monkeypatch):
    host = _reset_host_stores(tmp_path)
    calls: list = []
    monkeypatch.setattr(
        "aurel_agents.jev.classify", lambda *a, **k: calls.append(1) or None
    )
    assert (
        await host._maybe_handoff_ticket_async("chính sách hoàn tiền thế nào?", "s")
        is None
    )
    assert calls == []
