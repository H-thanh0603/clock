# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Test tính năng agent-only: watch store, alert feed, handoff ticket,
proactive monitor (check logic thuần + endpoint, respx mock BE)."""

from __future__ import annotations

import time

import pytest


def _mk_stores(tmp_path):
    from aurel_agents.proactive import AlertFeed, TaskStore, TicketStore, WatchStore

    return (
        WatchStore(tmp_path / "watches.json"),
        AlertFeed(tmp_path / "alerts.json"),
        TicketStore(tmp_path / "tickets.json"),
        TaskStore(tmp_path / "tasks.json"),
    )


# --- WatchStore ----------------------------------------------------------------------


def test_watch_store_add_and_dedupe(tmp_path):
    watches, _, _, _ = _mk_stores(tmp_path)
    w = watches.add("u1", "chrono-x", "restock")
    assert w.active is True
    with pytest.raises(ValueError, match="đã nhờ"):
        watches.add("u1", "chrono-x", "restock")
    # khác kind → vẫn thêm được
    w2 = watches.add("u1", "chrono-x", "price_drop", price_drop_pct=10)
    assert w2.watch_id != w.watch_id
    assert len(watches.for_user("u1")) == 2
    # khác user → không ảnh hưởng
    watches.add("u2", "chrono-x", "restock")


def test_watch_store_cap_per_user(tmp_path):
    watches, _, _, _ = _mk_stores(tmp_path)
    for i in range(20):
        watches.add("u1", f"p{i}", "restock")
    with pytest.raises(ValueError, match="quá nhiều"):
        watches.add("u1", "p-new", "restock")


def test_watch_store_persist_roundtrip(tmp_path):
    watches, _, _, _ = _mk_stores(tmp_path)
    watches.add("u1", "chrono-x", "price_drop", price_drop_pct=15, baseline_price=99000)
    watches2, _, _, _ = _mk_stores(tmp_path)
    loaded = watches2.for_user("u1")
    assert len(loaded) == 1
    assert loaded[0].baseline_price == 99000
    assert loaded[0].price_drop_pct == 15


def test_watch_store_deactivate(tmp_path):
    watches, _, _, _ = _mk_stores(tmp_path)
    w = watches.add("u1", "chrono-x", "restock")
    assert watches.deactivate(w.watch_id) is not None
    assert watches.active() == []
    assert watches.deactivate(w.watch_id) is None  # idempotent


# --- AlertFeed + TicketStore -----------------------------------------------------------


def test_alert_feed_recent_order_desc(tmp_path):
    _, alerts, _, _ = _mk_stores(tmp_path)
    alerts.publish("low_stock", "T1", "D1")
    time.sleep(0.01)
    alerts.publish("restock", "T2", "D2")
    recent = alerts.recent(10)
    assert [a.kind for a in recent] == ["restock", "low_stock"]


def test_ticket_store_open_dedupe_and_resolve(tmp_path):
    _, _, tickets, _ = _mk_stores(tmp_path)
    t1 = tickets.open("u1", "đồng hồ bị trầy", order_id="AC-2026-000001")
    t2 = tickets.open("u1", "nhắc lại", order_id="AC-2026-000001")
    assert t1.ticket_id == t2.ticket_id  # dedupe cùng user + đơn
    assert len(tickets.open_tickets()) == 1
    assert tickets.resolve(t1.ticket_id) is not None
    assert tickets.open_tickets() == []
    # sau khi resolve, cùng user+đơn mở được ticket mới
    t3 = tickets.open("u1", "vấn đề mới", order_id="AC-2026-000001")
    assert t3.ticket_id != t1.ticket_id


# --- check_watches: logic đối chiếu thuần ----------------------------------------------


def _product(stock=0, price=99000, in_boutique=True, name="Chrono X"):
    return {"stock": stock, "priceUsd": price, "inBoutique": in_boutique, "name": name}


def test_check_watches_restock_fires_when_back_in_stock(tmp_path):

    watches, _, _, _ = _mk_stores(tmp_path)
    w = watches.add("u1", "chrono-x", "restock")
    fired = []
    from aurel_agents.proactive import check_watches

    # hết hàng: không alert
    assert check_watches([w], {"chrono-x": _product(stock=0)}) == []
    # về hàng: alert
    fired = check_watches([w], {"chrono-x": _product(stock=2)})
    assert len(fired) == 1
    assert fired[0].kind == "restock"
    assert "Chrono X" in fired[0].title
    # ẩn khỏi boutique: coi như chưa về
    assert check_watches([w], {"chrono-x": _product(stock=2, in_boutique=False)}) == []


def test_check_watches_price_drop_threshold(tmp_path):
    watches, _, _, _ = _mk_stores(tmp_path)
    w = watches.add("u1", "chrono-x", "price_drop", price_drop_pct=10, baseline_price=100000)
    from aurel_agents.proactive import check_watches

    # giảm 5%: dưới ngưỡng → không alert
    assert check_watches([w], {"chrono-x": _product(stock=1, price=95000)}) == []
    # giảm 12%: khớp
    fired = check_watches([w], {"chrono-x": _product(stock=1, price=88000)})
    assert len(fired) == 1
    assert fired[0].kind == "price_drop"
    assert "12" in fired[0].title
    # tăng giá: không bao giờ alert
    assert check_watches([w], {"chrono-x": _product(stock=1, price=120000)}) == []


def test_check_watches_unknown_product_ignored(tmp_path):
    watches, _, _, _ = _mk_stores(tmp_path)
    w = watches.add("u1", "khong-ton-tai", "restock")
    from aurel_agents.proactive import check_watches

    assert check_watches([w], {}) == []


# --- check_merchant_snapshot ------------------------------------------------------------


def test_check_merchant_snapshot_low_stock_and_pending():
    from aurel_agents.proactive import check_merchant_snapshot

    inv = [
        {"listing_id": "a", "title": "A", "stock": 1},
        {"listing_id": "b", "title": "B", "stock": 2},
        {"listing_id": "c", "title": "C", "stock": 9},  # ok, không alert
    ]
    alerts = check_merchant_snapshot({"pendingOrders": 7}, inv)
    kinds = {a.kind for a in alerts}
    assert kinds == {"low_stock", "pending_orders"}
    low = next(a for a in alerts if a.kind == "low_stock")
    assert low.data["count"] == 2

    # dưới ngưỡng PENDING → chỉ tồn kho
    alerts = check_merchant_snapshot({"pendingOrders": 2}, inv)
    assert [a.kind for a in alerts] == ["low_stock"]

    # sạch → không alert
    assert check_merchant_snapshot({"pendingOrders": 0}, []) == []


# --- watch tool (presentation extension) -------------------------------------------------


def test_watch_tool_enrich_gates_on_provenance(tmp_path):
    """product_id chưa từng thấy trong session → ValueError (fence)."""
    from aurel_agents.shopping.watch_tool import build_watch_extension

    watches, _, _, _ = _mk_stores(tmp_path)
    ext = build_watch_extension(watches)

    class _State:
        seen_products = {}  # chưa có gì

    class _Ctx:
        session = type("S", (), {"user_id": "shopper:abc"})()
        state = _State()

    import asyncio

    async def call():
        from aurel_agents.shopping.watch_tool import SetWatchPayload

        return await ext.enrich(
            SetWatchPayload(product_id="chrono-x", kind="restock"), _Ctx()
        )

    with pytest.raises(ValueError, match="chưa từng được tìm"):
        asyncio.run(call())


def test_watch_tool_enrich_creates_watch(tmp_path):
    from aurel_agents.shopping.watch_tool import build_watch_extension

    watches, _, _, _ = _mk_stores(tmp_path)
    ext = build_watch_extension(watches)

    from shopping_agent import Product

    product = Product(
        product_id="chrono-x", title="Chrono X", price=99000.0, currency="USD"
    )

    class _State:
        seen_products = {"chrono-x": product}

    class _Ctx:
        session = type("S", (), {"user_id": "shopper:abc"})()
        state = _State()

    import asyncio

    async def call():
        from aurel_agents.shopping.watch_tool import SetWatchPayload

        return await ext.enrich(
            SetWatchPayload(
                product_id="chrono-x", kind="price_drop", price_drop_pct=10
            ),
            _Ctx(),
        )

    enriched = asyncio.run(call())
    assert enriched["confirmed"] is not None
    assert enriched["baseline_price"] == 99000.0
    # watch thật sự được ghi
    active = watches.for_user("shopper:abc")
    assert len(active) == 1
    assert active[0].baseline_price == 99000.0


def test_watch_tool_definition_shape(tmp_path):
    """Extension đúng shape PresentationExtension: tên, schema, required."""
    from aurel_agents.shopping.watch_tool import build_watch_extension

    watches, _, _, _ = _mk_stores(tmp_path)
    ext = build_watch_extension(watches)
    assert ext.name == "set_watch"
    tool = ext.tool_definition()
    assert tool["input_schema"]["required"] == ["product_id", "kind"]
    assert set(tool["input_schema"]["properties"]) == {
        "product_id",
        "kind",
        "price_drop_pct",
        "note",
    }


# --- handoff heuristic -------------------------------------------------------------------


def test_handoff_ticket_opens_on_complaint(tmp_path, monkeypatch):
    import aurel_agents.host as host

    # reset stores dùng tmp_path cho test này
    from aurel_agents.proactive import AlertFeed, TicketStore, WatchStore

    host._watch_store = WatchStore(tmp_path / "w.json")
    host._alert_feed = AlertFeed(tmp_path / "a.json")
    host._ticket_store = TicketStore(tmp_path / "t.json")

    ticket = host._maybe_handoff_ticket(
        "Tôi khiếu nại đơn AC-2026-000123 — đồng hồ bị trầy khi nhận", "sess-1"
    )
    assert ticket is not None
    assert ticket.order_id == "AC-2026-000123"
    assert len(host._ticket_store.open_tickets()) == 1
    # alert cũng publish cho feed
    assert any(a.kind == "ticket" for a in host._alert_feed.recent(10))

    # dedupe: nhắc lại cùng đơn → ticket cũ
    again = host._maybe_handoff_ticket("nhắc lại khiếu nại đơn AC-2026-000123", "sess-1")
    assert again.ticket_id == ticket.ticket_id


def test_handoff_ticket_ignores_normal_message(tmp_path):
    import aurel_agents.host as host
    from aurel_agents.proactive import AlertFeed, TicketStore, WatchStore

    host._watch_store = WatchStore(tmp_path / "w.json")
    host._alert_feed = AlertFeed(tmp_path / "a.json")
    host._ticket_store = TicketStore(tmp_path / "t.json")

    assert host._maybe_handoff_ticket("cho tôi xem tourbillon dưới 150k", "s") is None
    assert host._ticket_store.open_tickets() == []


def test_handoff_ticket_ignores_policy_question(tmp_path):
    """Câu HỎI chính sách không mở ticket — bug 3 false-positive."""
    import aurel_agents.host as host
    from aurel_agents.proactive import AlertFeed, TicketStore, WatchStore

    host._watch_store = WatchStore(tmp_path / "w.json")
    host._alert_feed = AlertFeed(tmp_path / "a.json")
    host._ticket_store = TicketStore(tmp_path / "t.json")

    for question in (
        "Chính sách hoàn tiền thế nào?",
        "làm sao để khiếu nại?",
        "quy trình hoàn tiền bao lâu?",
        "đồng hồ bị lỗi thì có hoàn không?",
        "hướng dẫn khiếu nại giúp tôi",
    ):
        assert host._maybe_handoff_ticket(question, "s") is None, question
    assert host._ticket_store.open_tickets() == []


# --- bug 1: merchant scan không spam alert lặp -------------------------------------------


def test_merchant_scan_alert_dedupe(tmp_path):
    """Cùng 1 tình trạng (tồn kho thấp) chỉ publish 1 lần trong cooldown."""
    from aurel_agents.proactive import AlertFeed, ProactiveMonitor

    feed = AlertFeed(tmp_path / "a.json")
    monitor = ProactiveMonitor(
        watch_store=None,  # type: ignore[arg-type] — không dùng trong test
        alert_feed=feed,
        ticket_store=None,  # type: ignore[arg-type]
        settings=None,
    )
    data = {"listing_id": "a", "stock": 1}
    assert monitor._publish_once("low_stock", "A còn 1", "chi tiết", data) is True
    assert monitor._publish_once("low_stock", "A còn 1", "chi tiết", data) is False  # cooldown
    assert monitor._publish_once("low_stock", "A còn 1", "chi tiết", data) is False
    # tình trạng KHÁC (sp khác) vẫn publish
    assert monitor._publish_once("low_stock", "B còn 1", "chi tiết", {"listing_id": "b", "stock": 1}) is True
    # hết cooldown (fake thời gian) → publish lại được
    key = next(iter(monitor._alert_seen))
    monitor._alert_seen[key] = 0.0
    assert monitor._publish_once("low_stock", "A còn 1", "chi tiết", data) is True


def test_scan_merchant_counts_open_tickets_without_republish(tmp_path):
    """Bug 1: vòng scan KHÔNG publish lại ticket đã publish lúc mở."""
    import asyncio

    import respx
    from httpx import Response

    from aurel_agents.config import Settings
    from aurel_agents.proactive import AlertFeed, ProactiveMonitor, TicketStore, WatchStore

    feed = AlertFeed(tmp_path / "a.json")
    tickets = TicketStore(tmp_path / "t.json")
    watches = WatchStore(tmp_path / "w.json")
    tickets.open("u1", "đồng hồ bị trầy")  # đã publish khi mở qua _maybe_handoff

    settings = Settings(backend_url="http://be.test")
    monitor = ProactiveMonitor(
        watch_store=watches, alert_feed=feed, ticket_store=tickets, settings=settings
    )
    base = "http://be.test"

    @respx.mock
    async def scenario():
        respx.post(f"{base}/auth/login").mock(
            return_value=Response(
                200, json={"accessToken": "t", "user": {"id": "a1", "role": "ADMIN"}}
            )
        )
        respx.get(f"{base}/auth/csrf").mock(
            return_value=Response(200, json={"csrfToken": "0123456789abcdef"})
        )
        respx.get(f"{base}/admin/stats").mock(
            return_value=Response(200, json={"pendingOrders": 0})
        )
        respx.get(f"{base}/admin/products").mock(
            return_value=Response(200, json={"items": []})
        )
        return await monitor._scan_merchant()

    counts = asyncio.run(scenario())
    # ticket đếm trong open_tickets nhưng KHÔNG publish alert lặp
    assert counts["open_tickets"] == 1
    ticket_alerts = [a for a in feed.recent(20) if a.kind == "ticket"]
    assert ticket_alerts == []


# --- bug 2: /alerts + /shop/monitor/run yêu cầu token khi đặt ----------------------------


def test_alerts_and_monitor_endpoints_require_token(monkeypatch):
    from fastapi.testclient import TestClient

    import aurel_agents.host as host
    from aurel_agents.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("AGENT_MERCHANT_TOKEN", "tok-123")
    get_settings.cache_clear()
    try:
        client = TestClient(host.app)
        assert client.get("/alerts").status_code == 401
        assert client.get("/alerts", headers={"x-agent-token": "sai"}).status_code == 401
        assert client.get("/alerts", headers={"x-agent-token": "tok-123"}).status_code == 200
        # monitor/run qua auth → 503 vì host chưa lifespan (không phải 401)
        assert (
            client.post("/shop/monitor/run", headers={"x-agent-token": "tok-123"}).status_code
            == 503
        )
        assert client.post("/shop/monitor/run").status_code == 401
    finally:
        monkeypatch.delenv("AGENT_MERCHANT_TOKEN", raising=False)
        get_settings.cache_clear()


# --- ProactiveMonitor: vòng check watch với respx mock BE -------------------------------


def test_monitor_run_once_watch_fires_alert(tmp_path, monkeypatch):
    import respx
    from httpx import Response

    import aurel_agents.host as host
    from aurel_agents.config import Settings
    from aurel_agents.proactive import AlertFeed, TicketStore, WatchStore

    # stores tmp + monitor cầm settings giả
    watch_store = WatchStore(tmp_path / "w.json")
    alert_feed = AlertFeed(tmp_path / "a.json")
    ticket_store = TicketStore(tmp_path / "t.json")
    host._watch_store = watch_store
    host._alert_feed = alert_feed
    host._ticket_store = ticket_store

    settings = Settings(backend_url="http://be.test")
    watch_store.add("shopper:abc12345", "chrono-x", "restock")

    base = "http://be.test"

    @respx.mock
    async def scenario():
        # shopper login flow
        respx.post(f"{base}/auth/login").mock(
            return_value=Response(
                200, json={"accessToken": "t", "user": {"id": "u1", "role": "CUSTOMER"}}
            )
        )
        respx.get(f"{base}/auth/csrf").mock(
            return_value=Response(200, json={"csrfToken": "0123456789abcdef"})
        )
        # sp đã về hàng
        respx.get(f"{base}/products/chrono-x").mock(
            return_value=Response(
                200,
                json={"slug": "chrono-x", "name": "Chrono X", "stock": 3, "priceUsd": 99000, "inBoutique": True},
            )
        )
        # merchant flow — monitor cũng scan merchant
        respx.get(f"{base}/admin/stats").mock(
            return_value=Response(200, json={"pendingOrders": 0})
        )
        respx.get(f"{base}/admin/products").mock(
            return_value=Response(200, json={"items": []})
        )

        from aurel_agents.proactive import ProactiveMonitor

        monitor = ProactiveMonitor(
            watch_store=watch_store,
            alert_feed=alert_feed,
            ticket_store=ticket_store,
            settings=settings,
        )
        counts = await monitor.run_once()
        return counts

    import asyncio

    counts = asyncio.run(scenario())
    assert counts["watches"] == 1
    fired = [a for a in alert_feed.recent(10) if a.kind == "restock"]
    assert len(fired) == 1
    assert "Chrono X" in fired[0].title
    # watch bị tắt sau khi khớp — không lặp vòng sau
    assert watch_store.active() == []


# --- fix 6: monitor tái dùng ClockClient qua các vòng ------------------------------------


def test_monitor_reuses_clients_across_cycles(tmp_path):
    """2 vòng quét → chỉ login shopper 1 lần (login spam đã từng là bug)."""
    import asyncio

    import respx
    from httpx import Response

    from aurel_agents.config import Settings
    from aurel_agents.proactive import AlertFeed, ProactiveMonitor, TicketStore, WatchStore

    watch_store = WatchStore(tmp_path / "w.json")
    alert_feed = AlertFeed(tmp_path / "a.json")
    ticket_store = TicketStore(tmp_path / "t.json")
    watch_store.add("shopper:abc12345", "chrono-x", "restock")
    settings = Settings(backend_url="http://be.test")
    base = "http://be.test"
    login_calls = []

    @respx.mock
    async def scenario():
        def login_route(request):
            login_calls.append(request.headers.get("host", ""))
            return Response(
                200,
                json={
                    "accessToken": "t",
                    "user": {"id": "u1", "role": "CUSTOMER" if len(login_calls) == 1 else "ADMIN"},
                },
            )

        respx.post(f"{base}/auth/login").mock(side_effect=login_route)
        respx.get(f"{base}/auth/csrf").mock(
            return_value=Response(200, json={"csrfToken": "0123456789abcdef"})
        )
        # vòng 1: hết hàng; vòng 2: về hàng → alert
        state = {"stock": 0}
        respx.get(f"{base}/products/chrono-x").mock(
            side_effect=lambda: Response(
                200,
                json={"slug": "chrono-x", "name": "Chrono X", "stock": state["stock"], "priceUsd": 99000, "inBoutique": True},
            )
        )
        respx.get(f"{base}/admin/stats").mock(
            return_value=Response(200, json={"pendingOrders": 0})
        )
        respx.get(f"{base}/admin/products").mock(
            return_value=Response(200, json={"items": []})
        )

        monitor = ProactiveMonitor(
            watch_store=watch_store,
            alert_feed=alert_feed,
            ticket_store=ticket_store,
            settings=settings,
        )
        await monitor.run_once()  # vòng 1
        state["stock"] = 3
        await monitor.run_once()  # vòng 2 — watch khớp
        await monitor.stop()
        return None

    asyncio.run(scenario())
    # shopper 1 login (vòng 1) + admin 1 login (vòng 1) = 2; vòng 2 reuse 0
    assert len(login_calls) == 2, f"login spam: {len(login_calls)}"


# --- fix 5: apply_change chặn lost update -----------------------------------------------


def test_apply_change_rejects_drift(tmp_path):
    """Giá đổi giữa lúc stage và apply → từ chối, không ghi đè."""
    import asyncio

    import respx
    from httpx import Response
    from merchant_agent import ActorKind, ChangeItem, ChangeKind, MerchantSessionContext
    from merchant_agent.changes import ChangeLedger
    from merchant_agent.config import MerchantAgentConfig

    from aurel_agents.clock_client import ClockClient
    from aurel_agents.merchant.backend import AurelMerchant

    ledger = ChangeLedger(MerchantAgentConfig(brand_name="Aurel & Co."))
    change = ledger.stage(
        kind=ChangeKind.PRICE_UPDATE,
        summary="Tăng giá chrono-x",
        items=[ChangeItem(target="chrono-x", field="price", before=99000.0, after=105000.0)],
        actor="op",
        actor_kind=ActorKind.AGENT,
        currency="USD",
    )
    base = "http://be.test"

    @respx.mock
    async def scenario():
        respx.post(f"{base}/auth/login").mock(
            return_value=Response(
                200, json={"accessToken": "t", "user": {"id": "a1", "role": "ADMIN"}}
            )
        )
        respx.get(f"{base}/auth/csrf").mock(
            return_value=Response(200, json={"csrfToken": "0123456789abcdef"})
        )
        # BE trả giá ĐÃ ĐỔI (operator sửa trực tiếp ở giữa)
        respx.get(f"{base}/admin/products").mock(
            return_value=Response(
                200,
                json={"items": [{"slug": "chrono-x", "name": "Chrono X", "priceUsd": 99999, "stock": 2, "inBoutique": True}]},
            )
        )
        client = ClockClient(base, "admin@x", "pw", register_if_new=False)
        await client.ensure_session()
        merchant = AurelMerchant(client, ledger=ledger)
        session = MerchantSessionContext(
            session_id="t", merchant_id="aurel", operator="operator:t"
        )
        from merchant_agent import ChangeNotApplicable

        try:
            await merchant.apply_change(session, change.change_id)
            return "APPLIED (sai)"
        except ChangeNotApplicable as e:
            return str(e)
        finally:
            await client.aclose()

    msg = asyncio.run(scenario())
    assert "đã đổi từ lúc đề xuất" in msg
    assert "99999" in msg
    # change vẫn staged — operator xem lại rồi stage lại
    assert ledger.get(change.change_id) is not None


def test_apply_change_allows_when_no_drift(tmp_path):
    """Giá chưa đổi → apply chạy bình thường (không chặn nhầm)."""
    import asyncio

    import respx
    from httpx import Response
    from merchant_agent import ActorKind, ChangeItem, ChangeKind, MerchantSessionContext
    from merchant_agent.changes import ChangeLedger
    from merchant_agent.config import MerchantAgentConfig

    from aurel_agents.clock_client import ClockClient
    from aurel_agents.merchant.backend import AurelMerchant

    ledger = ChangeLedger(MerchantAgentConfig(brand_name="Aurel & Co."))
    change = ledger.stage(
        kind=ChangeKind.PRICE_UPDATE,
        summary="Tăng giá chrono-x",
        items=[ChangeItem(target="chrono-x", field="price", before=99000.0, after=105000.0)],
        actor="op",
        actor_kind=ActorKind.AGENT,
        currency="USD",
    )
    base = "http://be.test"
    patched = []

    @respx.mock
    async def scenario():
        respx.post(f"{base}/auth/login").mock(
            return_value=Response(
                200, json={"accessToken": "t", "user": {"id": "a1", "role": "ADMIN"}}
            )
        )
        respx.get(f"{base}/auth/csrf").mock(
            return_value=Response(200, json={"csrfToken": "0123456789abcdef"})
        )
        respx.get(f"{base}/admin/products").mock(
            return_value=Response(
                200,
                json={"items": [{"slug": "chrono-x", "name": "Chrono X", "priceUsd": 99000, "stock": 2, "inBoutique": True}]},
            )
        )
        respx.patch(f"{base}/admin/products/chrono-x").mock(
            side_effect=lambda request: (
                patched.append(1),
                Response(200, json={"slug": "chrono-x"}),
            )[-1]
        )
        client = ClockClient(base, "admin@x", "pw", register_if_new=False)
        await client.ensure_session()
        merchant = AurelMerchant(client, ledger=ledger)
        session = MerchantSessionContext(
            session_id="t", merchant_id="aurel", operator="operator:t"
        )
        applied = await merchant.apply_change(session, change.change_id)
        await client.aclose()
        return applied

    applied = asyncio.run(scenario())
    assert applied.status.value == "applied"
    assert len(patched) == 1


# --- nhóm 7-12: backoff, retention, budget, single-instance lock ------------------------


def test_backoff_delay_doubles_and_caps():
    """Interval nhân đôi mỗi lần fail liên tiếp, cap MAX_BACKOFF_S."""
    from aurel_agents.config import Settings
    from aurel_agents.proactive import MAX_BACKOFF_S, ProactiveMonitor

    settings = Settings(backend_url="http://be", monitor_interval_s=300)
    monitor = ProactiveMonitor(
        watch_store=None,  # type: ignore[arg-type]
        alert_feed=None,  # type: ignore[arg-type]
        ticket_store=None,  # type: ignore[arg-type]
        settings=settings,
    )
    assert monitor._current_delay(0) == 300  # khỏe: interval gốc
    assert monitor._current_delay(1) == 600
    assert monitor._current_delay(2) == 1200
    # cap 30 phút: 300×2^3=2400 > 1800 → cap từ failures=3
    assert monitor._current_delay(3) == MAX_BACKOFF_S
    assert monitor._current_delay(5) == MAX_BACKOFF_S
    assert monitor._current_delay(20) == MAX_BACKOFF_S


def test_run_once_raises_when_both_scans_fail():
    """Cả 2 scan chết (BE down) → run_once raise để vòng cha backoff."""
    import asyncio

    from aurel_agents.config import Settings
    from aurel_agents.proactive import ProactiveMonitor

    settings = Settings(backend_url="http://be")
    monitor = ProactiveMonitor(
        watch_store=None,  # type: ignore[arg-type]
        alert_feed=None,  # type: ignore[arg-type]
        ticket_store=None,  # type: ignore[arg-type]
        settings=settings,
    )

    async def both_fail(*_a, **_k):
        raise ConnectionError("BE chết")

    monitor._check_watches = both_fail  # type: ignore[method-assign]
    monitor._scan_merchant = both_fail  # type: ignore[method-assign]
    try:
        asyncio.run(monitor.run_once())
        raise AssertionError("phải raise")
    except RuntimeError as e:
        assert "cả 2 scan fail" in str(e)


def test_retention_cleanup_transcripts_and_stores(tmp_path):
    """TTL dọn: transcript cũ (không watch) xóa file; resolved ticket xóa."""
    import os
    import time as _time

    from aurel_agents.proactive import (
        AlertFeed,
        TicketStore,
        WatchStore,
        cleanup_expired,
    )

    sessions = tmp_path / "sessions"
    sessions.mkdir()
    old_ts = _time.time() - 40 * 86400  # 40 ngày trước

    # transcript cũ của session không có watch
    f1 = sessions / "abcd1111.json"
    f1.write_text("[]", encoding="utf-8")
    os.utime(f1, (old_ts, old_ts))
    # transcript cũ nhưng user CÒN watch active → giữ
    f2 = sessions / "keep2222.json"
    f2.write_text("[]", encoding="utf-8")
    os.utime(f2, (old_ts, old_ts))

    watches = WatchStore(tmp_path / "w.json")
    alerts = AlertFeed(tmp_path / "a.json")
    tickets = TicketStore(tmp_path / "t.json")
    watches.add("shopper:keep2222", "chrono-x", "restock")  # active → giữ transcript
    t = tickets.open("u1", "đã xử lý xong")
    tickets.resolve(t.ticket_id)  # resolved cũ

    # fake created_at cũ cho ticket resolved
    for item in tickets._items:
        if item.ticket_id == t.ticket_id:
            item.created_at = old_ts
    tickets.save()

    removed = cleanup_expired(
        sessions_dir=sessions,
        watch_store=watches,
        ticket_store=tickets,
        alert_feed=alerts,
        retention_days=30,
    )
    assert removed["transcripts"] == 1  # chỉ f1
    assert not f1.exists()
    assert f2.exists()  # còn watch active
    assert removed["tickets"] == 1
    assert tickets.open_tickets() == []


def test_budget_guard_caps_turns_per_session(monkeypatch):
    """Vượt AGENT_CHAT_TURNS_PER_DAY → 429; session khác không bị ảnh hưởng."""

    import aurel_agents.host as host
    from aurel_agents.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("AGENT_CHAT_TURNS_PER_DAY", "3")
    get_settings.cache_clear()
    host._turn_counts.clear()
    try:
        assert host._check_budget("s1", 3) is None  # turn 1
        host._check_budget("s1", 3)  # 2
        host._check_budget("s1", 3)  # 3
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            host._check_budget("s1", 3)  # 4 → 429
        assert exc.value.status_code == 429
        # session khác có cap riêng
        assert host._check_budget("s2", 3) is None
        # per_day=0 = tắt
        assert host._check_budget("s1", 0) is None
    finally:
        monkeypatch.delenv("AGENT_CHAT_TURNS_PER_DAY", raising=False)
        host._turn_counts.clear()
        get_settings.cache_clear()


def test_single_instance_lock(tmp_path):
    """Instance 2 giữ lock fail → RuntimeError."""
    from aurel_agents.proactive import acquire_single_instance_lock

    lock_path = tmp_path / "host.lock"
    handle = acquire_single_instance_lock(lock_path)
    try:
        with pytest.raises(RuntimeError, match="instance agent host khác"):
            acquire_single_instance_lock(lock_path)
    finally:
        handle.close()
    # nhả lock rồi thì lấy lại được
    handle2 = acquire_single_instance_lock(lock_path)
    handle2.close()


# --- delegation: agent hành động thay user (agentic web) -------------------------------


def test_delegated_client_no_login_flow(tmp_path):
    """Delegated ClockClient: không login, cookie delegation, 401 → error riêng."""
    import asyncio

    import respx
    from httpx import Response

    from aurel_agents.clock_client import ClockClient, ClockDelegationError

    base = "http://be.test"

    @respx.mock
    async def scenario():
        respx.get(f"{base}/auth/me").mock(
            return_value=Response(200, json={"user": {"id": "real-u1", "role": "CUSTOMER"}})
        )
        respx.get(f"{base}/auth/csrf").mock(
            return_value=Response(200, json={"csrfToken": "0123456789abcdef"})
        )
        client = ClockClient(
            base, "delegated", "", register_if_new=False,
            delegation_token="tok-xyz",
        )
        # cookie đúng loại (aurel_delegation, không đụng session)
        assert client.delegated is True
        assert client.delegation_token == "tok-xyz"
        user = await client.ensure_session()  # KHÔNG gọi /auth/login
        assert user["id"] == "real-u1"
        assert respx.calls.call_count == 2  # me + csrf, không login
        await client.aclose()

    asyncio.run(scenario())

    @respx.mock
    async def expired():
        respx.get(f"{base}/auth/me").mock(return_value=Response(401, json={}))
        client = ClockClient(
            base, "delegated", "", register_if_new=False,
            delegation_token="het-han",
        )
        try:
            await client.ensure_session()
            raise AssertionError("phải raise ClockDelegationError")
        except ClockDelegationError:
            pass
        finally:
            await client.aclose()

    asyncio.run(expired())


def test_pooled_storefront_delegation_binding(tmp_path):
    """bind_delegation → _backend_for trả delegated backend (user thật)."""
    import asyncio

    import respx
    from httpx import Response

    from aurel_agents.config import Settings
    from aurel_agents.session_pool import PooledStorefront

    base = "http://be.test"
    settings = Settings(backend_url=base)
    pool = PooledStorefront(settings)

    @respx.mock
    async def scenario():
        respx.get(f"{base}/auth/me").mock(
            return_value=Response(200, json={"user": {"id": "real-u1", "role": "CUSTOMER"}})
        )
        respx.get(f"{base}/auth/csrf").mock(
            return_value=Response(200, json={"csrfToken": "0123456789abcdef"})
        )
        pool.bind_delegation("sess-1", "tok-a")
        backend = await pool._backend_for("sess-1")
        # delegated backend (không phải shopper pool)
        assert backend is not None
        assert "sess-1" in pool._delegated
        # client user là user thật
        client = pool._delegated["sess-1"][0]
        assert client.user["id"] == "real-u1"
        # đổi token → client mới (FE gia hạn sau 30 phút)
        pool.bind_delegation("sess-1", "tok-b")
        backend2 = await pool._backend_for("sess-1")
        assert pool._delegated["sess-1"][0].delegation_token == "tok-b"
        assert backend2 is not None
        # unbind → session quay lại shopper rác (nhưng không test — cần
        # BE mock login; chỉ assert state sạch)
        pool.bind_delegation("sess-1", "")
        assert "sess-1" not in pool._delegation_tokens
        await pool.aclose()

    asyncio.run(scenario())


def test_watch_cancel_requires_owner_session(tmp_path):
    """Hủy watch của session khác → 403, không deactivate."""
    from fastapi.testclient import TestClient

    import aurel_agents.host as host
    from aurel_agents.proactive import AlertFeed, TicketStore, WatchStore

    host._watch_store = WatchStore(tmp_path / "w.json")
    host._alert_feed = AlertFeed(tmp_path / "a.json")
    host._ticket_store = TicketStore(tmp_path / "t.json")

    w = host._watch_store.add("shopper:owner123", "chrono-x", "restock")
    client = TestClient(host.app)

    # session lạ → 403, watch vẫn active
    r = client.post(f"/shop/watches/{w.watch_id}/cancel?session_id=intruder99")
    assert r.status_code == 403
    assert host._watch_store.get(w.watch_id).active is True

    # chủ sở hữu (đúng prefix 8 ký tự) → ok
    r = client.post(f"/shop/watches/{w.watch_id}/cancel?session_id=owner123xxxxxxxxxxxxxxxx")
    assert r.status_code == 200
    assert host._watch_store.get(w.watch_id).active is False

    # watch không tồn tại → 404
    r = client.post("/shop/watches/w-nope-0000/cancel?session_id=owner123xx")
    assert r.status_code == 404


def test_task_tool_save_and_complete(tmp_path):
    """save_task tạo task, complete_task đánh done, check quyền sở hữu."""
    from aurel_agents.shopping.task_tool import build_task_extensions

    _, _, _, tasks = _mk_stores(tmp_path)
    save_ext, complete_ext = build_task_extensions(tasks)

    class _State:
        seen_products = {}

    class _Ctx:
        session = type("S", (), {"user_id": "shopper:abc", "session_id": "sess123"})()
        state = type("St", (), {"seen_products": {}})()

    import asyncio

    # save_task
    async def run_save():
        from aurel_agents.shopping.task_tool import SaveTaskPayload

        return await save_ext.enrich(
            SaveTaskPayload(title="So sánh 3 chiếc", goal="Dưới $20k, mặt 40mm"),
            _Ctx(),
        )

    created = asyncio.run(run_save())
    assert created["task_id"] is not None
    assert created["title"] == "So sánh 3 chiếc"

    # complete_task
    async def run_complete():
        from aurel_agents.shopping.task_tool import CompleteTaskPayload

        return await complete_ext.enrich(
            CompleteTaskPayload(task_id=created["task_id"]), _Ctx()
        )

    completed = asyncio.run(run_complete())
    assert completed["status"] == "done"

    # user khác không thể complete task của user khác
    class _OtherCtx:
        session = type("S", (), {"user_id": "shopper:other", "session_id": "sess999"})()
        state = type("St", (), {"seen_products": {}})()

    async def run_complete_other():
        from aurel_agents.shopping.task_tool import CompleteTaskPayload

        return await complete_ext.enrich(
            CompleteTaskPayload(task_id=created["task_id"]), _OtherCtx()
        )

    with pytest.raises(ValueError, match="Không tìm thấy việc"):
        asyncio.run(run_complete_other())
