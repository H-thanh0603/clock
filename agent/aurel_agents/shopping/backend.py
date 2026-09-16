# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""``StorefrontBackend`` của Aurel & Co.: map catalog/cart/orders/policies của
backend clock (NestJS) lên interface của shopping-agent (Anthropic commerce-agents).

Cách map (xem ``vendor/docs/backends.md``):

- Catalog clock là **plain product** (không có variant gia đình): mỗi chiếc đồng hồ
  là 1 ``Product`` mua thẳng — ``options`` để trống đúng luật "plain: bought as is".
- ``product_id`` = slug (id ổn định, URL-friendly, BE dùng làm PK).
- Giá: BE chốt USD là nguồn sự thật; VND chỉ là hiển thị. ``price`` = priceUsd,
  VND đưa vào ``attributes["price_vnd"]`` để model trả lời khách nếu được hỏi.
- Giỏ: mỗi CartItem clock là (slug, strap, engraving) — map thành dòng cart.
  BE tự tra giá DB (không tin giá client) nên adapter chỉ truyền display price.
- Đơn: ``/orders/mine`` cho user đăng nhập; tra cứu theo mã ``AC-YYYY-NNNNNN``
  qua ``/orders/by-code`` cho khách vãng lai (rate-limit 30/phút của BE).
- Chính sách: clock không có API policy — 4 trang legal FE
  (terms/privacy/complaints/shipping) được dựng thành ``Policy`` tĩnh ở đây
  (nội dung đồng bộ với ``src/app/legal/``).
"""

from __future__ import annotations

import logging
from typing import Any

from shopping_agent import (
    Cart,
    CartItem,
    CheckoutHandoff,
    FulfillmentOption,
    Order,
    OrderItem,
    OrderStatus,
    Policy,
    Product,
    ProductDetails,
    SearchFilters,
    ShoppingSessionContext,
    StorefrontBackend,
    UserPreferences,
)

from aurel_agents.clock_client import ClockClient

logger = logging.getLogger(__name__)

# Chuẩn nội dung của BE (backend/src/common/pricing.ts) — hiển thị tham khảo
VND_PER_USD = "25,200"

POLICIES: list[Policy] = [
    Policy(
        policy_id="terms",
        title="Điều khoản dịch vụ & mua hàng",
        category="điều khoản",
        content=(
            "Giá hiển thị bằng USD đã bao gồm thuế; VND quy đổi theo tỷ lệ cố định "
            f"{VND_PER_USD} VND/USD. Với đơn cá nhân hóa (khắc tên, bespoke), giá chốt "
            "được xác nhận qua email concierge trước khi sản xuất. Mỗi chiếc đồng hồ "
            "hoàn thiện thủ công là độc bản — chi tiết có thể sai khác nhẹ giữa các chiếc."
        ),
    ),
    Policy(
        policy_id="privacy",
        title="Chính sách bảo mật",
        category="bảo mật",
        content=(
            "Thông tin cá nhân chỉ dùng để xử lý đơn hàng, liên hệ concierge và vận "
            "chuyển. Không chia sẻ với bên thứ ba ngoài nhà vận chuyển và cổng thanh "
            "toán VNPay. Cookie phiên đăng nhập là JWT HttpOnly, 7 ngày."
        ),
    ),
    Policy(
        policy_id="complaints",
        title="Tiếp nhận & xử lý khiếu nại",
        category="khiếu nại",
        content=(
            "Kênh: hotline concierge 24/7, email concierge, hoặc trực tiếp tại Private "
            "Salon. Khiếu nại được cấp mã theo dõi trong 24 giờ; phản hồi đầu 48 giờ "
            "làm việc. Khiếu nại chất lượng: giải quyết trong 15 ngày (kể cả thẩm "
            "định tại atelier). Khiếu nại thanh toán: đối soát VNPay trong 5 ngày "
            "làm việc. Giải quyết: đổi sản phẩm cùng dòng, sửa tại atelier miễn phí "
            "trong bảo hành, hoặc hoàn tiền qua kênh thanh toán ban đầu."
        ),
    ),
    Policy(
        policy_id="fulfillment",
        title="Vận chuyển & bàn giao",
        category="vận chuyển",
        content=(
            "Miễn phí toàn quốc, vận chuyển an ninh có bảo hiểm 100%. Đơn "
            "CONFIRMED/PAID bàn giao trong 2 giờ làm việc nội thành, 24–48 giờ "
            "liên tỉnh theo khung giờ khách chọn. Kiểm tra ngoại quan khi nhận; "
            "vấn đề ngoại quan ghi nhận trong 48 giờ. Đổi mới 7 ngày nếu lỗi "
            "NSX/giao sai; hàng bespoke/khắc tên không đổi trả trừ lỗi chế tác. "
            "Đơn vãng lai tra cứu theo mã AC-YYYY-NNNNNN trên web."
        ),
    ),
    Policy(
        policy_id="bespoke",
        title="Hàng bespoke & đặt chế tác riêng",
        category="bespoke",
        content=(
            "Đơn bespoke qua configurator là yêu cầu tư vấn, chưa phải đơn mua — "
            "concierge phản hồi bản dựng kỹ thuật và giá chốt trong 48 giờ làm "
            "việc. Giá chốt chỉ hiệu lực khi hai bên xác nhận bằng email; sau đó "
            "đặt cọc 20%, chế tác 14–24 tháng."
        ),
    ),
]

_DELIVERY = FulfillmentOption(
    method="delivery",
    eta="Bàn giao theo khung giờ đã hẹn (concierge xác nhận trong 2 giờ làm việc)",
    fee=0.0,
    location="Private Salon Hà Nội / Sài Gòn / Genève",
)
_PICKUP = FulfillmentOption(
    method="pickup",
    eta="Lấy trực tiếp tại salon sau khi concierge xác nhận",
    fee=0.0,
    location="Private Salon Hà Nội / Sài Gòn / Genève",
)


def _product_from_clock(p: dict[str, Any]) -> Product:
    """ProductDto (clock) → shopping_agent.Product."""
    attrs: dict[str, str] = {
        "price_vnd": f"{p.get('priceVnd', 0):,.0f} ₫",
        "reference": str(p.get("reference", "")),
        "collection": str(p.get("collection", "")),
        "calibre": str(p.get("calibre", "")),
    }
    diameter = p.get("diameterMm")
    if diameter:
        attrs["diameter"] = f"{diameter} mm"
    if p.get("caseMaterial"):
        attrs["material"] = str(p["caseMaterial"])
    if p.get("strapLabel"):
        attrs["strap"] = str(p["strapLabel"])
    if p.get("complications"):
        attrs["complications"] = ", ".join(p["complications"])
    return Product(
        product_id=str(p["slug"]),
        title=str(p.get("name", "")),
        price=float(p.get("priceUsd", 0)),
        currency="USD",
        image_url=p.get("cardImage") or None,
        labels=[str(b) for b in (p.get("badges") or [])],
        attributes=attrs,
        in_stock=bool(p.get("stock", 0)) and bool(p.get("inBoutique", True)),
        short_description=p.get("shortDescription") or None,
    )


def _details_from_clock(p: dict[str, Any]) -> ProductDetails:
    """ProductDto đầy đủ → ProductDetails (specs + narrative vào fields tự do)."""
    base = _product_from_clock(p).model_dump()
    details = dict(base)
    details["attributes"] = {
        **base["attributes"],
        **{
            str(s.get("label", "")): str(s.get("value", ""))
            for s in (p.get("specs") or [])
        },
    }
    details["long_description"] = p.get("narrative") or p.get("shortDescription") or None
    return ProductDetails(**details)


def _cart_from_clock(items: list[dict[str, Any]]) -> Cart:
    cart_items = [
        CartItem(
            product_id=str(i["slug"]),
            title=str(i.get("name", "")),
            price=float(i.get("priceUsd", 0)),
            quantity=int(i.get("qty", 1)),
            option_values=(
                {"strap": str(i["strap"])} if i.get("strap") else {}
            )
            | ({"engraving": str(i["engraving"])} if i.get("engraving") else {}),
            image_url=i.get("image") or None,
        )
        for i in items or []
    ]
    return Cart(items=cart_items, currency="USD")


_STATUS_MAP = {
    "PENDING": OrderStatus.PROCESSING,
    "CONFIRMED": OrderStatus.PROCESSING,
    "PAID": OrderStatus.PROCESSING,
    "SHIPPED": OrderStatus.SHIPPED,
    "COMPLETED": OrderStatus.DELIVERED,
    "CANCELLED": OrderStatus.CANCELLED,
}


def _order_from_clock(o: dict[str, Any]) -> Order:
    status = _STATUS_MAP.get(str(o.get("status", "PENDING")), OrderStatus.PROCESSING)
    placed = o.get("createdAt") or o.get("updatedAt")
    return Order(
        order_id=str(o.get("code", o.get("id", ""))),
        status=status,
        placed_at=_parse_dt(placed),
        items=[
            OrderItem(
                product_id=str(i.get("slug", "")),
                title=str(i.get("name", "")),
                quantity=int(i.get("qty", 1)),
                price=float(i.get("priceUsd", 0) or 0),
            )
            for i in (o.get("items") or [])
        ],
        total=float(o.get("totalUsd", 0) or 0),
        currency="USD",
        estimated_delivery=str(o.get("slot") or "") or None,
    )


def _parse_dt(raw: Any) -> Any:
    from datetime import UTC, datetime

    if isinstance(raw, datetime):
        return raw
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00")) or datetime.now(
            UTC
        )
    except Exception:
        return datetime.now(UTC)


def _policy_matches(policy: Policy, query: str) -> bool:
    hay = f"{policy.title} {policy.category} {policy.content}".lower()
    return all(tok in hay for tok in query.lower().split() if len(tok) > 1)


class AurelStorefront(StorefrontBackend):
    """Adapter chạy trên 1 ``ClockClient`` (đúng 1 shopper session).

    Mỗi ``ShoppingSessionContext`` của agent map sang 1 ClockClient. Mặc định
    tất cả session dùng chung shopper demo (giỏ hàng chia sẻ) — với đồ án
    này chấp nhận được; multi-user ở host layer.
    """

    def __init__(self, client: ClockClient) -> None:
        self._client = client

    # -- Catalog ------------------------------------------------------------------

    async def search_products(
        self,
        session: ShoppingSessionContext,
        query: str,
        filters: SearchFilters | None = None,
        limit: int = 8,
    ) -> list[Product]:
        params: dict[str, Any] = {"limit": max(1, min(limit, 50))}
        if query.strip():
            params["q"] = query.strip()
        if filters:
            if filters.category:
                params["collection"] = filters.category
            if filters.attributes.get("material"):
                params["material"] = filters.attributes["material"]
            if filters.attributes.get("movement"):
                params["movements"] = filters.attributes["movement"]
            if filters.attributes.get("size"):
                params["size"] = filters.attributes["size"]
            if filters.attributes.get("complication"):
                params["complications"] = filters.attributes["complication"]
            if filters.sort == "price_asc":
                params["sort"] = "price-asc"
            elif filters.sort == "price_desc":
                params["sort"] = "price-desc"
            if filters.min_price is not None or filters.max_price is not None:
                logger.info(
                    "clock products API không có price range filter — lọc client-side"
                )
        data = await self._client.products(**params)
        products = [_product_from_clock(p) for p in data.get("items", [])]
        if filters and (filters.min_price is not None or filters.max_price is not None):
            products = [
                p
                for p in products
                if (filters.min_price is None or p.price >= filters.min_price)
                and (filters.max_price is None or p.price <= filters.max_price)
            ]
        return products[:limit]

    async def get_product_details(
        self, session: ShoppingSessionContext, product_id: str
    ) -> ProductDetails | None:
        try:
            dto = await self._client.product(product_id)
        except Exception as error:  # slug lạ → None theo hợp đồng
            logger.debug("get_product_details(%s): %s", product_id, error)
            return None
        return _details_from_clock(dto)

    # -- Cart -----------------------------------------------------------------------

    async def get_cart(self, session: ShoppingSessionContext) -> Cart:
        items = await self._client.cart_get()
        return _cart_from_clock(items)

    async def add_to_cart(
        self, session: ShoppingSessionContext, product_id: str, quantity: int
    ) -> Cart:
        details = await self.get_product_details(session, product_id)
        if details is None:
            raise ValueError(f"Không rõ sản phẩm {product_id}")
        strap = details.attributes.get("strap", "")
        items = await self._client.cart_add(
            product_id,
            details.title,
            details.price,
            details.image_url or "",
            strap=strap,
            qty=quantity,
        )
        return _cart_from_clock(items)

    async def update_cart_item(
        self, session: ShoppingSessionContext, product_id: str, quantity: int
    ) -> Cart:
        items = await self._client.cart_update(product_id, qty=quantity)
        return _cart_from_clock(items)

    async def remove_from_cart(
        self, session: ShoppingSessionContext, product_id: str
    ) -> Cart:
        items = await self._client.cart_remove(product_id)
        return _cart_from_clock(items if isinstance(items, list) else [])

    # -- Customer context --------------------------------------------------------------

    async def get_preferences(self, session: ShoppingSessionContext) -> UserPreferences:
        user = self._client.user or {}
        return UserPreferences(
            user_id=str(user.get("id") or session.user_id),
            display_name=str(user.get("name") or user.get("email") or "Khách Aurel"),
            preferences={"brand": "Aurel & Co.", "locale": "vi-VN"},
        )

    async def checkout_handoff(
        self, session: ShoppingSessionContext, cart: Cart
    ) -> list[CheckoutHandoff]:
        # clock có checkout riêng: handoff về trang /checkout của FE.
        from aurel_agents.config import get_settings

        frontend = get_settings().frontend_url
        return [CheckoutHandoff(url=f"{frontend}/checkout", label="Hoàn tất đặt hàng")]

    # -- Orders and policies --------------------------------------------------------------

    async def get_orders(
        self, session: ShoppingSessionContext, limit: int = 5
    ) -> list[Order]:
        data = await self._client.orders_mine(limit=limit)
        return [_order_from_clock(o) for o in data.get("items", [])][:limit]

    async def get_order(
        self, session: ShoppingSessionContext, order_id: str
    ) -> Order | None:
        # Ưu tiên tra theo mã đơn công khai AC-YYYY-NNNNNN (BE cho phép guest)
        if order_id.startswith("AC-"):
            try:
                data = await self._client.order_by_code(order_id)
                return _order_from_clock(data)
            except Exception as error:
                logger.debug("order_by_code(%s): %s", order_id, error)
        for order in await self.get_orders(session, limit=50):
            if order.order_id == order_id:
                return order
        return None

    async def search_policies(
        self, session: ShoppingSessionContext, query: str
    ) -> list[Policy]:
        matches = [p for p in POLICIES if _policy_matches(p, query)]
        if not matches:
            # fallback: trả toàn bộ để model tự chọn phần liên quan
            return POLICIES
        return matches

    # -- Fulfillment ------------------------------------------------------------------------

    async def get_fulfillment_options(
        self, session: ShoppingSessionContext, product_ids: list[str]
    ) -> list[FulfillmentOption]:
        # clock bàn giao qua salon với khung giờ hẹn — cùng 1 lựa chọn cho mọi SP
        return [_DELIVERY, _PICKUP]


__all__ = ["AurelStorefront", "POLICIES"]
