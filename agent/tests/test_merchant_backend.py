# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Test MerchantBackend adapter: staged changes qua ChangeLedger, apply qua
admin API thật (mock), guardrail, ChangeNotApplicable với campaign.
"""

from __future__ import annotations

import json

import pytest

from aurel_agents.clock_client import ClockClient
from aurel_agents.merchant.backend import AurelMerchant

BASE = "http://backend.test"

PRODUCT_DTO = {
    "slug": "chronos-tourbillon-no-07",
    "name": "Chronos Tourbillon No. 07",
    "priceUsd": 18500,
    "stock": 2,
    "inBoutique": True,
    "collection": "Chronos",
    "shortDescription": "Tourbillon",
    "reference": "AC-CT07",
}

STATS = {
    "ordersByStatus": [
        {"status": "PENDING", "count": 3},
        {"status": "PAID", "count": 5},
    ],
    "totalOrders": 8,
    "revenueUsd": 92500,
    "revenueVnd": 2325000000,
    "totalUsers": 10,
    "totalProducts": 6,
    "recentOrders": [],
}


def make_merchant(respx_mock) -> AurelMerchant:
    respx_mock.post(f"{BASE}/auth/login").respond(
        json={"user": {"id": "admin1", "email": "admin@aurel.local", "role": "ADMIN"}}
    )
    respx_mock.get(f"{BASE}/auth/csrf").respond(json={"csrfToken": "t" * 32})
    client = ClockClient(BASE, "admin@aurel.local", "pass", register_if_new=False)
    return AurelMerchant(client)


def merchant_ctx():
    from merchant_agent import MerchantSessionContext

    return MerchantSessionContext(session_id="m1", merchant_id="aurel", operator="op-test")


@pytest.mark.asyncio
async def test_business_snapshot(respx_mock):
    respx_mock.get(f"{BASE}/admin/stats").respond(json=STATS)
    m = make_merchant(respx_mock)
    snap = await m.get_business_snapshot(merchant_ctx())
    assert snap.sales == 92500.0
    assert snap.orders == 8
    assert snap.traffic is None  # không có nguồn → None, không phải 0
    assert snap.average_order_value == 92500 / 8
    assert snap.alerts.order_issues >= 1  # 3 đơn PENDING


@pytest.mark.asyncio
async def test_stage_price_update_and_apply(respx_mock):
    """Stage giá → apply → PATCH /admin/products với priceUsd mới."""
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(json=PRODUCT_DTO)
    patch = respx_mock.patch(f"{BASE}/admin/products/chronos-tourbillon-no-07").respond(
        json={"slug": "chronos-tourbillon-no-07"}
    )
    m = make_merchant(respx_mock)

    from merchant_agent import PriceUpdateItem

    change = await m.stage_price_update(
        merchant_ctx(),
        [PriceUpdateItem(listing_id="chronos-tourbillon-no-07", new_price=19000)],
        note="Tăng giá tourbillon",
    )
    assert change.status.value == "staged"
    assert change.items[0].before == 18500.0
    assert change.items[0].after == 19000.0
    assert not patch.called  # chưa write gì

    # approve → apply: đây là write thật
    applied = await m.apply_change(merchant_ctx(), change.change_id)
    assert applied.status.value == "applied"
    assert patch.called
    body = json.loads(patch.calls.last.request.content)
    assert body == {"priceUsd": 19000}


@pytest.mark.asyncio
async def test_stage_inventory_restock_and_apply(respx_mock):
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(json=PRODUCT_DTO)
    patch = respx_mock.patch(f"{BASE}/admin/products/chronos-tourbillon-no-07").respond(
        json={"slug": "x"}
    )
    m = make_merchant(respx_mock)

    from merchant_agent import InventoryActionItem

    change = await m.stage_inventory_action(
        merchant_ctx(),
        [InventoryActionItem(listing_id="chronos-tourbillon-no-07", action="restock", quantity=3)],
    )
    assert change.items[0].field == "stock"
    assert change.items[0].after == 5  # 2 + 3

    applied = await m.apply_change(merchant_ctx(), change.change_id)
    assert applied.status.value == "applied"
    body = json.loads(patch.calls.last.request.content)
    assert body == {"stock": 5}


@pytest.mark.asyncio
async def test_stage_pause_and_apply(respx_mock):
    """pause → PATCH inBoutique=false (ẩn khỏi boutique)."""
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(json=PRODUCT_DTO)
    patch = respx_mock.patch(f"{BASE}/admin/products/chronos-tourbillon-no-07").respond(
        json={"slug": "x"}
    )
    m = make_merchant(respx_mock)

    from merchant_agent import InventoryActionItem

    change = await m.stage_inventory_action(
        merchant_ctx(),
        [InventoryActionItem(listing_id="chronos-tourbillon-no-07", action="pause")],
    )
    await m.apply_change(merchant_ctx(), change.change_id)
    body = json.loads(patch.calls.last.request.content)
    assert body == {"inBoutique": False}


@pytest.mark.asyncio
async def test_stage_promotion_and_apply(respx_mock):
    """Stage KM 10% → apply → POST /admin/promotions + PATCH giá KM."""
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(json=PRODUCT_DTO)
    promo = respx_mock.post(f"{BASE}/admin/promotions").respond(json={"id": "promo-1"})
    patch = respx_mock.patch(f"{BASE}/admin/products/chronos-tourbillon-no-07").respond(
        json={"slug": "chronos-tourbillon-no-07"}
    )
    m = make_merchant(respx_mock)
    from merchant_agent import PromotionDraft

    change = await m.stage_promotion(
        merchant_ctx(),
        PromotionDraft(
            name="Mid-season 10%",
            listing_ids=["chronos-tourbillon-no-07"],
            discount_pct=10,
            starts="2026-09-01",
            ends="2026-09-30",
        ),
    )
    assert change.status.value == "staged"
    assert change.items[0].before == 18500.0
    assert change.items[0].after == 16650.0  # 18500 * 0.9
    assert not promo.called and not patch.called

    applied = await m.apply_change(merchant_ctx(), change.change_id)
    assert applied.status.value == "applied"
    assert promo.called
    body = json.loads(promo.calls.last.request.content)
    assert body["name"] == "Mid-season 10%"
    assert body["listingSlugs"] == ["chronos-tourbillon-no-07"]
    price_body = json.loads(patch.calls.last.request.content)
    assert price_body == {"priceUsd": 16650}


@pytest.mark.asyncio
async def test_stage_campaign_create_and_apply(respx_mock):
    """Stage campaign mới → apply → POST /admin/campaigns."""
    created = respx_mock.post(f"{BASE}/admin/campaigns").respond(
        json={"id": "c-1", "name": "Launch"}
    )
    m = make_merchant(respx_mock)
    from merchant_agent import CampaignDraft

    change = await m.stage_campaign(
        merchant_ctx(),
        CampaignDraft(name="Launch", budget=500, objective="ra mắt"),
    )
    assert change.status.value == "staged"
    applied = await m.apply_change(merchant_ctx(), change.change_id)
    assert applied.status.value == "applied"
    assert created.called
    body = json.loads(created.calls.last.request.content)
    assert body["name"] == "Launch"
    assert body["budgetUsd"] == 500


@pytest.mark.asyncio
async def test_promotion_survives_restart(respx_mock, tmp_path):
    """Stage → save ledger → backend mới (mất sidecar) → apply vẫn đủ draft."""
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(json=PRODUCT_DTO)
    respx_mock.post(f"{BASE}/admin/promotions").respond(json={"id": "promo-1"})
    respx_mock.patch(f"{BASE}/admin/products/chronos-tourbillon-no-07").respond(
        json={"slug": "chronos-tourbillon-no-07"}
    )
    m = make_merchant(respx_mock)
    from merchant_agent import PromotionDraft

    change = await m.stage_promotion(
        merchant_ctx(),
        PromotionDraft(
            name="Restart 10%",
            listing_ids=["chronos-tourbillon-no-07"],
            discount_pct=10,
            starts="2026-09-01",
            ends="2026-09-30",
        ),
    )
    from aurel_agents.session_pool import load_ledger, save_ledger

    path = tmp_path / "ledger.json"
    save_ledger(m._ledger, path)

    m2 = make_merchant(respx_mock)
    assert load_ledger(m2._ledger, path) == 1
    assert m2._promo_drafts == {}  # sidecar memory mất sau restart
    applied = await m2.apply_change(merchant_ctx(), change.change_id)
    assert applied.status.value == "applied"


@pytest.mark.asyncio
async def test_campaign_performance_from_backend(respx_mock):
    respx_mock.get(f"{BASE}/admin/campaigns").respond(
        json=[
            {
                "id": "c-1",
                "name": "Launch",
                "status": "active",
                "budgetUsd": 500,
                "spendUsd": None,
                "revenueUsd": None,
            }
        ]
    )
    m = make_merchant(respx_mock)
    campaigns = await m.get_campaign_performance(merchant_ctx())
    assert len(campaigns) == 1
    assert campaigns[0].campaign_id == "c-1"
    assert campaigns[0].spend is None  # chưa báo → None, không phải 0


@pytest.mark.asyncio
async def test_query_metrics_sales_timeseries(respx_mock):
    respx_mock.get(f"{BASE}/admin/metrics").respond(
        json={
            "metric": "sales",
            "granularity": "day",
            "points": [{"date": "2026-09-10", "value": 1500}],
        }
    )
    m = make_merchant(respx_mock)
    series = await m.query_metrics(merchant_ctx(), "sales")
    assert len(series.points) == 1
    assert series.points[0].date == "2026-09-10"

    series_unknown = await m.query_metrics(merchant_ctx(), "traffic")
    assert series_unknown.points == []


@pytest.mark.asyncio
async def test_discard_does_not_write(respx_mock):
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(json=PRODUCT_DTO)
    patch = respx_mock.patch(f"{BASE}/admin/products/x").respond(json={})
    m = make_merchant(respx_mock)

    from merchant_agent import PriceUpdateItem

    change = await m.stage_price_update(
        merchant_ctx(),
        [PriceUpdateItem(listing_id="chronos-tourbillon-no-07", new_price=18900)],
    )
    discarded = await m.discard_change(merchant_ctx(), change.change_id)
    assert discarded.status.value == "discarded"
    assert not patch.called  # discard không đụng BE


@pytest.mark.asyncio
async def test_listing_update_maps_fields(respx_mock):
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(json=PRODUCT_DTO)
    m = make_merchant(respx_mock)

    change = await m.stage_listing_update(
        merchant_ctx(),
        "chronos-tourbillon-no-07",
        {"title": "Chronos Tourbillon No. 07 Édition"},
        note="sửa tên",
    )
    assert change.items[0].field == "title"
    assert change.items[0].after == "Chronos Tourbillon No. 07 Édition"


@pytest.mark.asyncio
async def test_listing_update_rejects_price_field(respx_mock):
    """price không được đi qua listing_update — phải qua price update."""
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(json=PRODUCT_DTO)
    m = make_merchant(respx_mock)
    from merchant_agent import ChangeNotApplicable

    with pytest.raises(ChangeNotApplicable):
        await m.stage_listing_update(
            merchant_ctx(),
            "chronos-tourbillon-no-07",
            {"price": 100},
        )


@pytest.mark.asyncio
async def test_inventory_alerts_low_stock(respx_mock):
    respx_mock.get(f"{BASE}/admin/products").respond(
        json={
            "items": [
                {**PRODUCT_DTO, "slug": "a", "stock": 1, "name": "A"},
                {**PRODUCT_DTO, "slug": "b", "stock": 5, "name": "B"},
            ],
            "total": 2,
        }
    )
    m = make_merchant(respx_mock)
    alerts = await m.get_inventory_alerts(merchant_ctx())
    assert len(alerts) == 1
    assert alerts[0].listing_id == "a"
    assert alerts[0].kind == "low_stock"
    assert alerts[0].stock == 1
