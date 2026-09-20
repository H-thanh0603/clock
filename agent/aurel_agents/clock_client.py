# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""HTTP client cho REST API của backend clock (NestJS).

Một client giữ đúng 1 phiên người dùng (JWT trong cookie ``aurel_session``),
tự cấp và gửi kèm CSRF double-submit token cho mọi POST/PATCH/PUT/DELETE,
đúng luật ``backend/src/common/csrf.middleware.ts``:

- GET /auth/csrf → set cookie ``aurel_csrf`` (readable) + body ``csrfToken``
- Mọi method ghi: header ``x-csrf-token`` phải trùng cookie

Vòng đời phiên: ``ensure_session()`` register (nếu email mới) hoặc login;
token hết hạn 7 ngày — gặp 401 thì tự login lại đúng tokenVersion semantics.
"""

from __future__ import annotations

import logging
from types import TracebackType
from typing import Any

import httpx

logger = logging.getLogger(__name__)

SESSION_COOKIE = "aurel_session"
DELEGATION_COOKIE = "aurel_delegation"
CSRF_COOKIE = "aurel_csrf"
CSRF_HEADER = "x-csrf-token"
ACTOR_HEADER = "x-aurel-actor"

WRITE_METHODS = {"POST", "PATCH", "PUT", "DELETE"}
# Các route được CSRF middleware bỏ qua (chưa/không cần session)
CSRF_EXEMPT_PATHS = {"/auth/login", "/auth/register", "/auth/csrf"}


class ClockApiError(RuntimeError):
    """BE trả lỗi không khôi phục được (4xx/5xx không phải 401)."""

    def __init__(self, status: int, message: str, payload: Any = None):
        super().__init__(f"[{status}] {message}")
        self.status = status
        self.payload = payload


class ClockAuthError(RuntimeError):
    """Login/register đều thất bại — không thể thiết lập phiên."""


class ClockDelegationError(RuntimeError):
    """Delegation token không hợp lệ/hết hạn — user cần xin lại."""


class ClockClient:
    """Async client cho 1 user của backend clock.

    Args:
        base_url: gốc BE, ví dụ ``http://localhost:4000``.
        email, password: tài khoản (khách cho shopping, admin cho merchant).
        register_if_new: nếu True, email chưa có thì register (dùng cho
            agent shopper — tạo tài khoản demo lần đầu chạy). Admin nên
            để False: tài khoản admin đã có từ seed.
        delegation_token: nếu set, client hành động THAY user (agentic
            delegation): cookie = JWT ngắn hạn aud-agent do BE cấp, không
            login/register, không password. Hết hạn → 401 → raise
            ClockDelegationError (FE xin token mới rồi retry 1 lần).
    """

    def __init__(
        self,
        base_url: str,
        email: str,
        password: str,
        *,
        register_if_new: bool = True,
        delegation_token: str | None = None,
        timeout: float = 15.0,
        actor: str | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._email = email
        self._password = password
        self._register_if_new = register_if_new
        self._delegation_token = delegation_token
        self._user: dict[str, Any] | None = None
        self._csrf_token: str | None = None
        # Nhãn audit cho merchant path: BE chỉ tin khi phiên là delegation
        # (xem `resolveActor`); gửi kèm mỗi request ghi dưới dạng
        # ``x-aurel-actor: agent/merchant``.
        self._actor = actor
        self._http = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=timeout,
            cookies={},
        )
        if delegation_token:
            # On-behalf-of: cookie riêng aurel_delegation — BE guard đọc cả
            # session lẫn delegation (verify phân biệt qua aud/scope).
            self._http.cookies.set(DELEGATION_COOKIE, delegation_token)

    @property
    def delegated(self) -> bool:
        return self._delegation_token is not None

    @property
    def delegation_token(self) -> str | None:
        return self._delegation_token

    # -- Phiên ------------------------------------------------------------------

    async def __aenter__(self) -> ClockClient:
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()

    @property
    def user(self) -> dict[str, Any] | None:
        return self._user

    @property
    def user_id(self) -> str:
        if self._user is None:
            return "anonymous"
        return str(self._user.get("id", ""))

    async def _fetch_csrf(self) -> str:
        resp = await self._http.get("/auth/csrf")
        resp.raise_for_status()
        token = resp.json().get("csrfToken")
        if not isinstance(token, str) or len(token) < 16:
            raise ClockApiError(resp.status_code, "csrf token malformed", resp.json())
        self._csrf_token = token
        return token

    async def ensure_session(self) -> dict[str, Any]:
        """Đảm bảo có session hợp lệ; trả về ``{user}`` của /auth/me."""
        if self.delegated:
            # On-behalf-of: KHÔNG login (không có password). Xác nhận token
            # sống qua /auth/me; hết hạn → ClockDelegationError để FE xin
            # token mới (agent không tự gia hạn — user là người cấp).
            resp = await self._http.get("/auth/me")
            if resp.status_code == 401:
                raise ClockDelegationError(
                    "Delegation token hết hạn hoặc không hợp lệ — xin lại từ BE"
                )
            resp.raise_for_status()
            user = resp.json()
            self._user = user.get("user") or user
            await self._fetch_csrf()
            return self._user
        # Đăng nhập mới ngay — đơn giản, đúng chủ đích service account
        # (không cố kế thừa cookie cũ có thể đã hết hạn).
        body = {"email": self._email, "password": self._password}
        resp = await self._http.post("/auth/login", json=body)

        if resp.status_code == 401 or (resp.status_code == 200 and not resp.json().get("user")):
            if not self._register_if_new:
                raise ClockAuthError(f"Đăng nhập {self._email} thất bại và register bị tắt")
            reg = await self._http.post("/auth/register", json=body)
            if reg.status_code != 200 or not reg.json().get("user"):
                raise ClockAuthError(
                    f"Register {self._email} thất bại: {reg.status_code} {reg.text[:200]}"
                )
            # Register thành công cũng set cookie session
            resp = reg
        resp.raise_for_status()
        user = resp.json().get("user")
        if not user:
            raise ClockAuthError("Login trả 200 nhưng thiếu user")
        self._user = user
        await self._fetch_csrf()
        return user

    # -- Request nền -------------------------------------------------------------

    async def request(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        params: dict[str, Any] | None = None,
        retries_left: int = 2,
    ) -> Any:
        """Gọi BE; tự kèm CSRF; 401 → login lại 1 lần rồi retry."""
        headers: dict[str, str] = {}
        effective = path.split("?")[0]
        needs_csrf = method.upper() in WRITE_METHODS and effective not in CSRF_EXEMPT_PATHS
        if needs_csrf:
            if not self._csrf_token:
                await self._fetch_csrf()
            headers[CSRF_HEADER] = self._csrf_token or ""
        # Chỉ khai danh tính agent trên request ghi — BE bỏ qua header này
        # với phiên browser, chỉ nhận khi phiên là delegation (chống giả danh).
        if self._actor and method.upper() in WRITE_METHODS:
            headers[ACTOR_HEADER] = self._actor

        resp = await self._http.request(method, path, json=json, params=params, headers=headers)

        # Token hết hạn / tokenVersion đổi → thiết lập lại phiên 1 lần.
        # Delegated: KHÔNG tự login lại (agent không giữ password user) —
        # raise để host báo FE xin token mới.
        if resp.status_code == 401 and retries_left > 0:
            if self.delegated:
                raise ClockDelegationError(
                    f"Delegation token bị từ chối ở {path} — cần xin token mới"
                )
            logger.info("401 ở %s — đăng nhập lại rồi retry", path)
            self._user = None
            self._csrf_token = None
            await self.ensure_session()
            return await self.request(
                method,
                path,
                json=json,
                params=params,
                retries_left=retries_left - 1,
            )

        if resp.status_code >= 400:
            try:
                payload = resp.json()
                message = payload.get("message", resp.text[:300])
            except Exception:
                payload = None
                message = resp.text[:300]
            raise ClockApiError(resp.status_code, str(message), payload)

        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    # -- API tiện dụng (map 1-1 controller của clock) ------------------------------

    async def products(
        self,
        *,
        q: str | None = None,
        collection: str | None = None,
        sort: str | None = None,
        page: int = 1,
        limit: int = 20,
        movements: list[str] | None = None,
        material: str | None = None,
        size: str | None = None,
        complications: list[str] | None = None,
    ) -> dict[str, Any]:
        """GET /products — catalog public (FE filter server-side, audit FE-001)."""
        params: dict[str, Any] = {"page": page, "limit": limit}
        if q:
            params["q"] = q
        if collection:
            params["collection"] = collection
        if sort:
            params["sort"] = sort
        if movements:
            params["movements"] = ",".join(movements)
        if material:
            params["material"] = material
        if size:
            params["size"] = size
        if complications:
            params["complications"] = ",".join(complications)
        return await self.request("GET", "/products", params=params)

    async def product(self, slug: str) -> dict[str, Any]:
        """GET /products/{slug}"""
        return await self.request("GET", f"/products/{slug}")

    async def cart_get(self) -> list[dict[str, Any]]:
        """GET /cart — các item (ClientCartItem)."""
        return await self.request("GET", "/cart")

    async def cart_add(
        self,
        slug: str,
        name: str,
        price_usd: float,
        image: str,
        *,
        strap: str = "",
        engraving: str | None = None,
        qty: int = 1,
    ) -> list[dict[str, Any]]:
        """POST /cart — BE tự tra giá gốc trong DB (cart KHÔNG tin giá client)."""
        return await self.request(
            "POST",
            "/cart",
            json={
                "productSlug": slug,
                "name": name,
                "priceUsd": price_usd,
                "image": image,
                "strap": strap,
                "engraving": engraving,
                "qty": qty,
            },
        )

    async def cart_update(
        self, slug: str, *, strap: str = "", qty: int = 1
    ) -> list[dict[str, Any]]:
        """PATCH /cart — đổi số lượng."""
        return await self.request("PATCH", "/cart", json={"slug": slug, "strap": strap, "qty": qty})

    async def cart_remove(self, slug: str, *, strap: str = "") -> Any:
        """DELETE /cart?slug=... — bỏ 1 dòng khỏi giỏ."""
        return await self.request("DELETE", "/cart", params={"slug": slug, "strap": strap})

    async def orders_mine(self, *, page: int = 1, limit: int = 10) -> dict[str, Any]:
        """GET /orders/mine — đơn của user đăng nhập."""
        return await self.request("GET", "/orders/mine", params={"page": page, "limit": limit})

    async def order_by_code(self, code: str) -> dict[str, Any]:
        """GET /orders/by-code/{code} — tra cứu công khai theo mã AC-YYYY-NNNNNN."""
        return await self.request("GET", f"/orders/by-code/{code}")

    async def admin_stats(self) -> dict[str, Any]:
        """GET /admin/stats — dashboard (chỉ ADMIN)."""
        return await self.request("GET", "/admin/stats")

    async def admin_orders(
        self, *, status: str | None = None, page: int = 1, limit: int = 20
    ) -> dict[str, Any]:
        """GET /admin/orders"""
        params: dict[str, Any] = {"page": page, "limit": limit}
        if status:
            params["status"] = status
        return await self.request("GET", "/admin/orders", params=params)

    async def admin_order_update(self, order_id: str, patch: dict[str, Any]) -> Any:
        """PATCH /admin/orders/{id} — ví dụ status SHIPPED."""
        return await self.request("PATCH", f"/admin/orders/{order_id}", json=patch)

    async def admin_products(
        self, *, page: int = 1, limit: int = 20, q: str | None = None
    ) -> dict[str, Any]:
        """GET /admin/products — backoffice thấy cả SP ẩn."""
        params: dict[str, Any] = {"page": page, "limit": limit}
        if q:
            params["q"] = q
        return await self.request("GET", "/admin/products", params=params)

    async def admin_product_row(self, slug: str) -> dict[str, Any]:
        """1 ProductDto admin (thấy cả SP ẩn) — đọc drift check của apply_change.

        Dùng search q=slug (admin list trả row đầy đủ) thay vì GET public
        /products/{slug} vì public ẩn SP inBoutique=false.
        """
        data = await self.admin_products(q=slug, limit=5)
        for row in data.get("items", []):
            if row.get("slug") == slug:
                return row
        raise ClockApiError(404, f"Không tìm thấy sp {slug} (admin)", data)

    async def admin_product_update(self, slug: str, patch: dict[str, Any]) -> dict[str, Any]:
        """PATCH /admin/products/{slug} — đổi giá/tồn kho/mô tả... có ProductEvent."""
        return await self.request("PATCH", f"/admin/products/{slug}", json=patch)

    async def admin_promotions(self, *, active: bool | None = None) -> list[dict[str, Any]]:
        """GET /admin/promotions — khuyến mãi theo khung ngày."""
        params: dict[str, Any] = {}
        if active is not None:
            params["active"] = "1" if active else "0"
        return await self.request("GET", "/admin/promotions", params=params)

    async def admin_promotion_create(self, body: dict[str, Any]) -> dict[str, Any]:
        """POST /admin/promotions — tạo khuyến mãi (apply từ staged change)."""
        return await self.request("POST", "/admin/promotions", json=body)

    async def admin_campaigns(self, *, status: str | None = None) -> list[dict[str, Any]]:
        """GET /admin/campaigns — chiến dịch marketing."""
        params: dict[str, Any] = {}
        if status:
            params["status"] = status
        return await self.request("GET", "/admin/campaigns", params=params)

    async def admin_campaign_create(self, body: dict[str, Any]) -> dict[str, Any]:
        """POST /admin/campaigns — tạo campaign (apply từ staged change)."""
        return await self.request("POST", "/admin/campaigns", json=body)

    async def admin_campaign_update(
        self, campaign_id: str, patch: dict[str, Any]
    ) -> dict[str, Any]:
        """PATCH /admin/campaigns/{id} — đổi status/budget/copy..."""
        return await self.request("PATCH", f"/admin/campaigns/{campaign_id}", json=patch)

    async def admin_metrics(
        self, *, metric: str = "sales", granularity: str = "day", days: int = 30
    ) -> dict[str, Any]:
        """GET /admin/metrics — time-series sales/orders từ DB thật."""
        return await self.request(
            "GET",
            "/admin/metrics",
            params={"metric": metric, "granularity": granularity, "days": days},
        )
