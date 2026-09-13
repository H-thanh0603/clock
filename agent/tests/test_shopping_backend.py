# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Test StorefrontBackend adapter: map ProductDto clock → Product shopping-agent,
cart roundtrip, orders, policies — tất cả qua respx mock, không cần BE.
"""

from __future__ import annotations

import json

import pytest

from aurel_agents.clock_client import ClockClient
from aurel_agents.shopping.backend import POLICIES, AurelStorefront

BASE = "http://backend.test"

PRODUCT_DTO = {
    "slug": "chronos-tourbillon-no-07",
    "name": "Chronos Tourbillon No. 07",
    "reference": "AC-CT07",
    "collection": "Chronos",
    "priceUsd": 18500,
    "priceVnd": 466200000,
    "shortDescription": "Tourbillon một phút, guilloché tay",
    "badges": ["Tourbillon", "Độc bản"],
    "strapLabel": "Da cá đuối, khâu tay",
    "cardImage": "/images/chronos-07.webp",
    "images": [],
    "calibre": "AC-88",
    "diameterMm": 41.0,
    "caseMaterial": "Rose Gold",
    "complications": ["Tourbillon"],
    "inBoutique": True,
    "stock": 2,
    "specs": [{"label": "Dự trữ năng lượng", "value": "90 giờ"}],
    "narrative": "Chiếc tourbillon mang thương hiệu Aurel.",
}


def make_storefront(respx_mock) -> AurelStorefront:
    """Mock login + csrf cho ClockClient, trả về adapter sẵn sàng."""
    respx_mock.post(f"{BASE}/auth/login").respond(
        json={"user": {"id": "u1", "email": "shopper@test", "name": "Agent Shopper"}}
    )
    respx_mock.get(f"{BASE}/auth/csrf").respond(json={"csrfToken": "t" * 32})
    client = ClockClient(BASE, "shopper@test", "pass")
    return AurelStorefront(client)


@pytest.mark.asyncio
async def test_search_products_maps_dto(respx_mock):
    respx_mock.get(f"{BASE}/products").respond(
        json={
            "items": [PRODUCT_DTO],
            "total": 1,
            "page": 1,
            "limit": 20,
        }
    )
    st = make_storefront(respx_mock)
    from shopping_agent import SearchFilters, ShoppingSessionContext

    ctx = ShoppingSessionContext(session_id="s1", user_id="u1")
    results = await st.search_products(ctx, "tourbillon")
    assert len(results) == 1
    p = results[0]
    assert p.product_id == "chronos-tourbillon-no-07"
    assert p.title == "Chronos Tourbillon No. 07"
    assert p.price == 18500.0
    assert p.currency == "USD"
    assert p.in_stock is True
    assert p.attributes["material"] == "Rose Gold"
    assert p.attributes["price_vnd"].endswith("₫")

    # filter collection → param collection
    await st.search_products(
        ctx, "", SearchFilters(category="Chronos")
    )


@pytest.mark.asyncio
async def test_get_product_details(respx_mock):
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(
        json=PRODUCT_DTO
    )
    st = make_storefront(respx_mock)
    from shopping_agent import ShoppingSessionContext

    ctx = ShoppingSessionContext(session_id="s1", user_id="u1")
    details = await st.get_product_details(ctx, "chronos-tourbillon-no-07")
    assert details is not None
    assert details.long_description == PRODUCT_DTO["narrative"]
    assert details.attributes["Dự trữ năng lượng"] == "90 giờ"

    # slug lạ → None (hợp đồng interface)
    respx_mock.get(f"{BASE}/products/none").respond(status_code=404, json={})
    assert await st.get_product_details(ctx, "none") is None


@pytest.mark.asyncio
async def test_cart_roundtrip(respx_mock):
    """get/add/update/remove cart map đúng các endpoint của clock."""
    st = make_storefront(respx_mock)
    from shopping_agent import ShoppingSessionContext

    ctx = ShoppingSessionContext(session_id="s1", user_id="u1")

    # add: cần details trước (tra giá + strap)
    respx_mock.get(f"{BASE}/products/chronos-tourbillon-no-07").respond(
        json=PRODUCT_DTO
    )
    add = respx_mock.post(f"{BASE}/cart").respond(
        json=[{"slug": "chronos-tourbillon-no-07", "name": "Chronos", "priceUsd": 18500, "qty": 1, "strap": "Da cá đuối, khâu tay", "image": "/img"}]
    )
    cart = await st.add_to_cart(ctx, "chronos-tourbillon-no-07", 1)
    assert cart.item_count == 1
    assert cart.subtotal == 18500.0
    body = json.loads(add.calls.last.request.content)
    assert body["productSlug"] == "chronos-tourbillon-no-07"
    assert body["strap"] == "Da cá đuối, khâu tay"

    # update qty
    respx_mock.patch(f"{BASE}/cart").respond(
        json=[{"slug": "chronos-tourbillon-no-07", "name": "Chronos", "priceUsd": 18500, "qty": 2, "strap": "Da", "image": "/i"}]
    )
    cart = await st.update_cart_item(ctx, "chronos-tourbillon-no-07", 2)
    assert cart.item_count == 2

    # remove
    respx_mock.delete(f"{BASE}/cart").respond(json=[])
    cart = await st.remove_from_cart(ctx, "chronos-tourbillon-no-07")
    assert cart.item_count == 0


@pytest.mark.asyncio
async def test_orders_mapping(respx_mock):
    st = make_storefront(respx_mock)
    from shopping_agent import ShoppingSessionContext

    ctx = ShoppingSessionContext(session_id="s1", user_id="u1")

    respx_mock.get(f"{BASE}/orders/mine").respond(
        json={
            "items": [
                {
                    "id": "ord-1",
                    "code": "AC-2026-123456",
                    "status": "SHIPPED",
                    "createdAt": "2026-09-10T10:00:00Z",
                    "totalUsd": 18500,
                    "slot": "10:00 - 12:00 (Sáng) • Khung giờ kín đáo",
                    "items": [
                        {"slug": "chronos-tourbillon-no-07", "name": "Chronos", "qty": 1, "priceUsd": 18500}
                    ],
                }
            ],
            "total": 1,
            "page": 1,
            "limit": 10,
        }
    )
    orders = await st.get_orders(ctx)
    assert len(orders) == 1
    o = orders[0]
    assert o.order_id == "AC-2026-123456"
    assert o.status.value == "shipped"
    assert o.total == 18500.0
    assert o.estimated_delivery and "10:00" in o.estimated_delivery

    # get_order ưu tiên mã AC-
    respx_mock.get(f"{BASE}/orders/by-code/AC-2026-123456").respond(
        json={
            "id": "ord-1",
            "code": "AC-2026-123456",
            "status": "SHIPPED",
            "createdAt": "2026-09-10T10:00:00Z",
            "totalUsd": 18500,
            "items": [],
        }
    )
    found = await st.get_order(ctx, "AC-2026-123456")
    assert found is not None and found.order_id == "AC-2026-123456"


@pytest.mark.asyncio
async def test_search_policies(respx_mock):
    st = make_storefront(respx_mock)
    from shopping_agent import ShoppingSessionContext

    ctx = ShoppingSessionContext(session_id="s1", user_id="u1")
    # query cụ thể → chỉ policy khớp
    results = await st.search_policies(ctx, "hoàn tiền")
    assert any("hoàn tiền" in p.content.lower() for p in results)
    # query không khớp → fallback trả tất cả
    all_results = await st.search_policies(ctx, "zzz-xyz")
    assert all_results == POLICIES


@pytest.mark.asyncio
async def test_fulfillment_and_preferences(respx_mock):
    st = make_storefront(respx_mock)
    from shopping_agent import ShoppingSessionContext

    ctx = ShoppingSessionContext(session_id="s1", user_id="u1")
    options = await st.get_fulfillment_options(ctx, ["a", "b"])
    assert {o.method for o in options} == {"delivery", "pickup"}

    st._client._user = {"id": "u1", "name": "Agent Shopper"}
    prefs = await st.get_preferences(ctx)
    assert prefs.display_name == "Agent Shopper"
    assert prefs.preferences["brand"] == "Aurel & Co."
