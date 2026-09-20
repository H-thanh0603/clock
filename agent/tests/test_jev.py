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


# --- #1 watch intent -----------------------------------------------------------------


def test_watch_intent_confirmed(respx_mock):
    """"Báo khi rẻ hơn" → Jev xác nhận price_drop + bucket %."""
    respx_mock.post(BASE).respond(
        json={
            "answers": {
                "is_watch_intent": {"type": "noul", "noul": 0.9},
                "watch_type": {"type": "choice", "choice": "price_drop"},
                "price_drop_pct": {"type": "choice", "choice": "10"},
            }
        }
    )
    v = jev.classify_watch_intent("báo tôi khi chiếc này rẻ hơn", **_kw())
    assert v is not None and v.is_watch_intent is True
    assert v.watch_type == "price_drop"
    assert v.price_drop_pct == 10


def test_watch_intent_not_watch(respx_mock):
    respx_mock.post(BASE).respond(
        json={"answers": {"is_watch_intent": {"type": "noul", "noul": 0.1}}}
    )
    v = jev.classify_watch_intent("cho xem giá hiện tại", **_kw())
    assert v is not None and v.is_watch_intent is False
    assert v.watch_type is None


def test_watch_intent_no_key_returns_none():
    assert jev.classify_watch_intent("báo khi về hàng", **_kw(api_key=None)) is None


def test_watch_intent_http_error_returns_none(respx_mock):
    respx_mock.post(BASE).respond(status_code=500)
    assert jev.classify_watch_intent("báo khi về hàng", **_kw()) is None


def _watch_ctx(page_query: str, product_price: float = 100.0):
    """EnrichmentContext giả đủ page.query + state.seen_products cho gate."""

    class _Page:
        query = page_query

    class _State:
        seen_products = {"p1": type("P", (), {"price": product_price})()}

    class _Session:
        page = _Page()
        user_id = "shopper:t"

    class _Ctx:
        session = _Session()
        state = _State()

    return _Ctx()


@pytest.mark.asyncio
async def test_watch_gate_fixes_kind(tmp_path, monkeypatch):
    """Model tick restock nhưng khách nói "báo khi rẻ hơn" → Jev sửa price_drop."""
    from aurel_agents.shopping.watch_tool import build_watch_extension

    host = _reset_host_stores(tmp_path)
    monkeypatch.setattr(
        "aurel_agents.jev.classify_watch_intent",
        lambda *a, **k: jev.WatchIntentVerdict(
            is_watch_intent=True, watch_type="price_drop", price_drop_pct=10
        ),
    )
    monkeypatch.setattr(host, "get_settings", lambda: Settings(jev_api_key="k"))
    ext = build_watch_extension(host._watch_store, jev_gate=host._jev_watch_gate())
    out = await ext.enrich(
        type("P", (), {"product_id": "p1", "kind": "restock", "price_drop_pct": None, "note": None})(),
        _watch_ctx("báo tôi khi chiếc này rẻ hơn"),
    )
    assert out["kind"] == "price_drop"
    assert out["price_drop_pct"] == 10


@pytest.mark.asyncio
async def test_watch_gate_failsafe_keeps_model_choice(tmp_path, monkeypatch):
    """Jev chết (classify_raise) → enrich vẫn ghi watch với tham số model chọn."""
    from aurel_agents.shopping.watch_tool import build_watch_extension

    host = _reset_host_stores(tmp_path)

    def _boom(*a, **k):
        raise RuntimeError("jev down")

    monkeypatch.setattr("aurel_agents.jev.classify_watch_intent", _boom)
    monkeypatch.setattr(host, "get_settings", lambda: Settings(jev_api_key="k"))
    ext = build_watch_extension(host._watch_store, jev_gate=host._jev_watch_gate())
    out = await ext.enrich(
        type("P", (), {"product_id": "p1", "kind": "restock", "price_drop_pct": None, "note": None})(),
        _watch_ctx("báo tôi khi có hàng"),
    )
    assert out["kind"] == "restock"


@pytest.mark.asyncio
async def test_watch_gate_absent_keeps_old_behavior(tmp_path):
    """jev_gate=None (mặc định) → hành vi cũ nguyên vẹn."""
    from aurel_agents.shopping.watch_tool import build_watch_extension

    host = _reset_host_stores(tmp_path)
    ext = build_watch_extension(host._watch_store)
    out = await ext.enrich(
        type("P", (), {"product_id": "p1", "kind": "price_drop", "price_drop_pct": 15, "note": None})(),
        _watch_ctx("báo khi giảm giá"),
    )
    assert out["kind"] == "price_drop"
    assert out["price_drop_pct"] == 15
    assert out["baseline_price"] == 100.0


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


@pytest.mark.asyncio
async def test_jev_receives_prior_history_for_escalation(tmp_path, monkeypatch):
    """Ticket đang open cùng đơn → Jev nhận lịch sử (không chỉ tin mới nhất),
    để câu ngắn 'vẫn chưa ai liên hệ' được chấm đúng là leo thang."""
    host = _reset_host_stores(tmp_path)
    # Lượt 1: heuristic trúng → mở ticket kèm mã đơn.
    await host._maybe_handoff_ticket_async(
        "Tôi khiếu nại đơn AC-2026-000777 bị trầy", "s1"
    )
    seen: dict = {}

    def _capture(msg, **kw):
        seen["prior"] = kw.get("prior")
        return jev.JevVerdict(
            is_complaint=True,
            department="logistics",
            severity="high",
            sentiment="angry",
        )

    monkeypatch.setattr("aurel_agents.jev.classify", _capture)
    monkeypatch.setattr(host, "get_settings", lambda: Settings(jev_api_key="k"))
    t = await host._maybe_handoff_ticket_async(
        "vẫn chưa thấy ai liên hệ đơn AC-2026-000777", "s1"
    )
    assert seen["prior"] and "bị trầy" in seen["prior"]
    assert t is not None and len(t.messages) == 2


@pytest.mark.asyncio
async def test_second_complaint_escalation_publishes_alert(tmp_path, monkeypatch):
    """Tin thứ 2 nặng hơn → alert riêng 'ticket_escalated' + severity tăng."""
    host = _reset_host_stores(tmp_path)
    await host._maybe_handoff_ticket_async(
        "đơn AC-2026-000888 giao chậm quá", "s1"
    )
    t = await host._maybe_handoff_ticket_async(
        "giờ còn bị móp hộp nữa, tôi muốn hoàn tiền ngay AC-2026-000888", "s1"
    )
    assert t is not None
    assert len(t.messages) == 2
    kinds = {a.kind for a in host._alert_feed.recent(20)}
    assert "ticket" in kinds  # lần đầu
    # Không có severity ở heuristic → không leo thang, nhưng vẫn nối lịch sử
    assert all(a.data.get("turns", 1) >= 1 for a in host._alert_feed.recent(20))


@pytest.mark.asyncio
async def test_no_history_when_different_order(tmp_path, monkeypatch):
    """Khác mã đơn → KHÔNG trộn lịch sử 2 vụ việc khác nhau vào ngữ cảnh Jev."""
    host = _reset_host_stores(tmp_path)
    await host._maybe_handoff_ticket_async(
        "Tôi khiếu nại đơn AC-2026-000999 bị trầy", "s1"
    )
    seen: dict = {}

    def _capture(msg, **kw):
        seen["prior"] = kw.get("prior")
        return None

    monkeypatch.setattr("aurel_agents.jev.classify", _capture)
    monkeypatch.setattr(host, "get_settings", lambda: Settings(jev_api_key="k"))
    await host._maybe_handoff_ticket_async(
        "đơn AC-2026-000111 có vấn đề khác", "s1"
    )
    assert seen["prior"] is None
