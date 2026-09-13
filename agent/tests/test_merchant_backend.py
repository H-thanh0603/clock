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

    return MerchantSessionContext(
        session_id="m1", merchant_id="aurel", operator="op-test"
    )


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
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(
        json=PRODUCT_DTO
    )
    patch = respx_mock.patch(
        f"{BASE}/admin/products/chronos-tourbillon-no-07"
    ).respond(json={"slug": "chronos-tourbillon-no-07"})
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
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(
        json=PRODUCT_DTO
    )
    patch = respx_mock.patch(
        f"{BASE}/admin/products/chronos-tourbillon-no-07"
    ).respond(json={"slug": "x"})
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
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(
        json=PRODUCT_DTO
    )
    patch = respx_mock.patch(
        f"{BASE}/admin/products/chronos-tourbillon-no-07"
    ).respond(json={"slug": "x"})
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
async def test_campaign_not_applicable(respx_mock):
    """clock không có hệ campaign → ChangeNotApplicable."""
    m = make_merchant(respx_mock)
    from merchant_agent import CampaignDraft, ChangeNotApplicable

    with pytest.raises(ChangeNotApplicable):
        await m.stage_campaign(
            merchant_ctx(),
            CampaignDraft(name="Summer", budget=1000),
        )


@pytest.mark.asyncio
async def test_discard_does_not_write(respx_mock):
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(
        json=PRODUCT_DTO
    )
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
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(
        json=PRODUCT_DTO
    )
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
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(
        json=PRODUCT_DTO
    )
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
