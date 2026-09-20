# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Test cho ClockClient: CSRF double-submit, login/register, retry 401.

Dùng respx mock httpx — không cần backend clock thật.
"""

from __future__ import annotations

import httpx
import pytest

from aurel_agents.clock_client import ClockClient

BASE = "http://backend.test"


def _client() -> ClockClient:
    return ClockClient(
        BASE,
        "shopper@test",
        "pass",
        register_if_new=True,
    )


@pytest.mark.asyncio
async def test_ensure_session_login_success(respx_mock):
    """Login OK → user trả về, csrf token được lưu."""
    login = respx_mock.post(f"{BASE}/auth/login").respond(
        json={"user": {"id": "u1", "email": "shopper@test", "role": "CUSTOMER"}}
    )
    csrf = respx_mock.get(f"{BASE}/auth/csrf").respond(
        json={"csrfToken": "x" * 32}
    )
    async with _client() as c:
        user = await c.ensure_session()
        assert user["id"] == "u1"
        assert login.called and csrf.called


@pytest.mark.asyncio
async def test_ensure_session_register_fallback(respx_mock):
    """Login 401 → register → dùng user mới."""
    respx_mock.post(f"{BASE}/auth/login").respond(status_code=401, json={"message": "sai"})
    register = respx_mock.post(f"{BASE}/auth/register").respond(
        json={"user": {"id": "u2", "email": "shopper@test"}}
    )
    respx_mock.get(f"{BASE}/auth/csrf").respond(json={"csrfToken": "x" * 32})
    async with _client() as c:
        user = await c.ensure_session()
        assert user["id"] == "u2"
        assert register.called


@pytest.mark.asyncio
async def test_write_sends_csrf_header(respx_mock):
    """POST /cart phải kèm header x-csrf-token đúng double-submit."""
    respx_mock.post(f"{BASE}/auth/login").respond(
        json={"user": {"id": "u1", "email": "shopper@test"}}
    )
    respx_mock.get(f"{BASE}/auth/csrf").respond(json={"csrfToken": "tok" * 8})
    cart = respx_mock.post(f"{BASE}/cart").respond(json=[])
    async with _client() as c:
        await c.ensure_session()
        await c.cart_add("chronos-tourbillon-no-07", "Test", 100.0, "/img.png")
        request = cart.calls.last.request
        assert request.headers["x-csrf-token"] == "tok" * 8
        body = json.loads(request.content) if (json := __import__("json")) else None
        assert body["productSlug"] == "chronos-tourbillon-no-07"


@pytest.mark.asyncio
async def test_get_does_not_need_csrf(respx_mock):
    """GET không cần CSRF — request sạch header."""
    respx_mock.post(f"{BASE}/auth/login").respond(
        json={"user": {"id": "u1", "email": "shopper@test"}}
    )
    respx_mock.get(f"{BASE}/auth/csrf").respond(json={"csrfToken": "tok" * 8})
    products = respx_mock.get(f"{BASE}/products").respond(
        json={"items": [], "total": 0, "page": 1, "limit": 20}
    )
    async with _client() as c:
        await c.ensure_session()
        await c.products()
        assert products.called
        assert "x-csrf-token" not in products.calls.last.request.headers


@pytest.mark.asyncio
async def test_401_triggers_relogin_retry(respx_mock):
    """Lần GET /cart đầu trả 401 → login lại → retry thành công."""
    respx_mock.post(f"{BASE}/auth/login").respond(
        json={"user": {"id": "u1", "email": "shopper@test"}}
    )
    respx_mock.get(f"{BASE}/auth/csrf").respond(json={"csrfToken": "tok" * 8})
    cart_route = respx_mock.get(f"{BASE}/cart")
    cart_route.side_effect = [
        httpx.Response(401, json={"message": "hết hạn"}),
        httpx.Response(200, json=[{"slug": "a", "qty": 1}]),
    ]
    async with _client() as c:
        await c.ensure_session()
        items = await c.cart_get()
        assert items == [{"slug": "a", "qty": 1}]
        assert cart_route.call_count == 2


@pytest.mark.asyncio
async def test_api_error_raised(respx_mock):
    """4xx không phải 401 → ClockApiError với message của BE."""
    respx_mock.post(f"{BASE}/auth/login").respond(
        json={"user": {"id": "u1", "email": "shopper@test"}}
    )
    respx_mock.get(f"{BASE}/auth/csrf").respond(json={"csrfToken": "tok" * 8})
    respx_mock.get(f"{BASE}/products/x").respond(
        status_code=404, json={"message": "Không thấy sản phẩm", "statusCode": 404}
    )
    async with _client() as c:
        await c.ensure_session()
        from aurel_agents.clock_client import ClockApiError

        with pytest.raises(ClockApiError) as err:
            await c.product("x")
        assert "Không thấy sản phẩm" in str(err.value)


@pytest.mark.asyncio
async def test_actor_header_only_on_writes(respx_mock):
    """Client có `actor` → request ghi kèm x-aurel-actor, request đọc thì không."""
    respx_mock.post(f"{BASE}/auth/login").respond(
        json={"user": {"id": "u1", "email": "a@test", "role": "ADMIN"}}
    )
    respx_mock.get(f"{BASE}/auth/csrf").respond(json={"csrfToken": "t" * 16})
    seen: list[tuple[str, str | None]] = []

    def record(request: httpx.Request) -> httpx.Response:
        seen.append((request.method, request.headers.get("x-aurel-actor")))
        return httpx.Response(200, json={})

    respx_mock.patch(f"{BASE}/admin/products/p1").mock(side_effect=record)
    respx_mock.get(f"{BASE}/admin/products").mock(side_effect=record)

    async with ClockClient(
        BASE, "a@test", "pass", register_if_new=False, actor="agent/merchant"
    ) as c:
        await c.ensure_session()
        await c.admin_product_update("p1", {"narrative": "x"})
        await c.admin_products(q="p1")

    assert ("PATCH", "agent/merchant") in seen
    assert ("GET", None) in seen


@pytest.mark.asyncio
async def test_no_actor_header_when_unset(respx_mock):
    """Không khai actor (client shopping thường) → tuyệt đối không gửi header."""
    respx_mock.post(f"{BASE}/auth/login").respond(
        json={"user": {"id": "u1", "email": "a@test"}}
    )
    respx_mock.get(f"{BASE}/auth/csrf").respond(json={"csrfToken": "t" * 16})
    cart = respx_mock.post(f"{BASE}/cart").respond(json=[])

    async with _client() as c:
        await c.ensure_session()
        await c.cart_add("p1", 1, 100, "img.jpg")

    assert cart.calls.last.request.headers.get("x-aurel-actor") is None
