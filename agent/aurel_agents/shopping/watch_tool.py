# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Watch tool cho shopping agent: khách nhờ "báo tôi khi về hàng / giảm giá".

Dùng ``PresentationExtension`` — seam chính thống của upstream
(commerce_common.presentation) để thêm tool vào agent mà KHÔNG sửa vendor.
Tool này ghi vào ``WatchStore``; ``ProactiveMonitor`` (loop nền của host)
check định kỳ và publish alert khi điều kiện khớp.

Tại sao đây là tính năng agent-only: chatbot trả lời xong là quên — nó
không có tiến trình dài hạn để kiểm tra lại, cũng không có tool ghi
trạng thái để vòng sau đọc.

``jev_gate``: async callback ``(message, kind, pct) → (kind, pct)`` do host
cắm vào — hỏi Jev phân loại lại ý định watch (noul + choice) và sửa
kind/pct nếu model chính chọn sai diễn đạt tự nhiên ("báo khi rẻ hơn" là
price_drop dù model tick restock). Callback raise ``PresentationRefused``
khi cần hỏi lại khách (chưa rõ điều kiện, chưa có key...); lỗi khác trong
callback được nuốt — watch luôn ghi được, Jev không bao giờ chặn việc.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from commerce_common.presentation import PresentationExtension
from pydantic import BaseModel, Field

from aurel_agents.proactive import WatchStore

logger = logging.getLogger("aurel-agents.watch")

# Callback Jev gate: async (message, kind, pct) -> (kind, pct)
JevWatchGate = Callable[[str, str, float | None], Awaitable[tuple[str, float | None]]]


class SetWatchPayload(BaseModel):
    """Model validates tool input; enriched payload là UI card cho FE."""

    product_id: str
    kind: str = Field(pattern="^(restock|price_drop)$")
    price_drop_pct: float | None = Field(default=None, ge=1, le=90)
    note: str | None = Field(default=None, max_length=200)


def build_watch_extension(
    watch_store: WatchStore,
    user_id_of: Any = None,
    jev_gate: JevWatchGate | None = None,
) -> PresentationExtension:
    """``set_watch`` presentation extension.

    ``user_id_of``: callable(session) → user_id (mặc định lấy
    ``session.user_id`` — đúng với ShoppingSessionContext).
    ``enrich`` chạy trong executor của agent với session thật.
    ``jev_gate``: callback host cắm, hỏi Jev phân loại lại ý định
    (xem module docstring). None = tắt gate (test cũ chạy như trước).
    """

    async def enrich(payload: SetWatchPayload, context: Any) -> dict[str, Any]:
        session = context.session
        user_id = user_id_of(session) if user_id_of else session.user_id
        # Provenance gate: chỉ cho watch id đã thấy trong session (state
        # của shopping agent giữ seen_products — đúng tinh thần gates).
        seen = set(getattr(context.state, "seen_products", {}) or {})
        if payload.product_id not in seen:
            raise ValueError(
                f"product_id {payload.product_id} chưa từng được tìm trong phiên "
                "này — hãy search/get_product_details trước khi đặt watch."
            )
        kind = payload.kind
        pct = payload.price_drop_pct
        baseline: float | None = None
        if kind == "price_drop":
            product = context.state.seen_products.get(payload.product_id)
            baseline = float(product.price) if product else None
        if jev_gate is not None:
            # Jev gate (async — PresentationExtension enrich đã là coroutine):
            # LỖI BẤT KỲ (key rỗng, Jev chết, parse lỗi) → nuốt, giữ kind/pct
            # model chọn. Jev chỉ là gate tinh chỉnh, không bao giờ chặn việc.
            try:
                user_message = (getattr(context.session.page, "query", None) or "").strip()
                if user_message:
                    kind, pct = await jev_gate(user_message, kind, pct)
            except Exception:
                logger.warning(
                    "Jev watch gate lỗi — giữ kind/pct model chọn", exc_info=True
                )
        watch = watch_store.add(
            user_id=user_id,
            product_id=payload.product_id,
            kind=kind,
            price_drop_pct=pct,
            baseline_price=baseline if kind == "price_drop" else None,
        )
        if watch.kind == "restock":
            confirm = "sản phẩm về lại hàng"
        else:
            final_pct = watch.price_drop_pct or 0
            confirm = f"giá giảm ít nhất {final_pct:g}% so với ${baseline or 0:,.0f}"
        return {
            "watch_id": watch.watch_id,
            "product_id": watch.product_id,
            "kind": watch.kind,
            "price_drop_pct": watch.price_drop_pct,
            "baseline_price": watch.baseline_price,
            "confirmed": confirm,
        }

    return PresentationExtension(
        name="set_watch",
        component="watch_confirmed",
        description=(
            "Set a watch for the customer: the system checks the product in the "
            "background and notifies them when it is back in stock "
            "(kind='restock') or the price drops by at least price_drop_pct "
            "percent (kind='price_drop'). The product_id must be one returned "
            "by a search or details call this session. Use it when the customer "
            "asks to be told/alerted/notified about a product."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "product_id": {
                    "type": "string",
                    "description": "Product id returned by a tool this session.",
                },
                "kind": {
                    "type": "string",
                    "enum": ["restock", "price_drop"],
                    "description": "What to watch for.",
                },
                "price_drop_pct": {
                    "type": "number",
                    "description": (
                        "Required for price_drop: minimum percent decrease to "
                        "trigger (1-90)."
                    ),
                },
                "note": {
                    "type": "string",
                    "maxLength": 200,
                    "description": "Optional customer-facing note on the card.",
                },
            },
            "required": ["product_id", "kind"],
            "additionalProperties": False,
        },
        payload_model=SetWatchPayload,
        enrich=enrich,
    )


class PlaceOrderPayload(BaseModel):
    """Model validates tool input; BE kiểm lại hạn mức/total/server-side."""

    payment_intent_id: str = Field(max_length=64)
    customer_name: str = Field(max_length=200)
    contact: str = Field(max_length=200)
    address: str = Field(max_length=500)
    slot: str | None = Field(default=None, max_length=200)


def build_place_order_extension() -> PresentationExtension:
    """Extension ``place_order_with_intent`` — agent chốt đơn hộ trong hạn mức.

    Rào chắn theo lớp (không tin model):
    1. Provenance: giỏ phải có item từ search/details (executor giữ); giỏ
       rỗng → từ chối ngay, không gọi BE.
    2. Delegation: backend ``place_order_with_intent`` từ chối khi client
       không phải delegation (giỏ demo không chốt hộ được).
    3. BE: intent ACTIVE + đúng user + chưa hết hạn + tổng ≤ trần + dùng 1
       lần (conditional LOCKED→USED); tổng do server chốt giá.
    4. Link VNPay do server ký HMAC — agent chỉ nhận `payUrl` để FE redirect
       user, không tự tạo link được.
    """

    async def enrich(payload: PlaceOrderPayload, context: Any) -> dict[str, Any]:

        session = context.session
        backend = context.backend if hasattr(context, "backend") else None
        cart = None
        get_cart = getattr(backend, "get_cart", None)
        place = getattr(backend, "place_order_with_intent", None)
        if not callable(get_cart) or not callable(place):
            raise ValueError("Backend không hỗ trợ chốt đơn hộ")
        cart = await get_cart(session)
        items = list(getattr(cart, "items", None) or [])
        if not items:
            raise ValueError("Giỏ trống — chưa có gì để chốt")
        out = await place(
            session,
            cart,
            str(payload.payment_intent_id).strip(),
            customer={
                "name": payload.customer_name,
                "contact": payload.contact,
                "address": payload.address,
                "slot": payload.slot or "",
            },
        )
        return {
            "order_code": out.get("code"),
            "status": out.get("status"),
            "total_usd": out.get("totalUsd"),
            "pay_url": out.get("payUrl"),
        }

    return PresentationExtension(
        name="place_order_with_intent",
        component="order_placed",
        description=(
            "Place the customer's CURRENT CART as a real order and get a VNPay "
            "payment link, ONLY when ALL are true: (1) the customer explicitly "
            "asked you to check out/pay now in this session; (2) they approved "
            "a payment limit (payment_intent_id) covering the cart total; "
            "(3) the cart is final (no custom/pending-review items). Ask for "
            "name/contact/address first — never invent them. The backend "
            "re-checks the limit, prices, and stock; failures come back as "
            "errors to relay. Never call twice for the same cart."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "payment_intent_id": {
                    "type": "string",
                    "description": "Payment limit id the customer approved (from the chat UI).",
                },
                "customer_name": {
                    "type": "string",
                    "description": "Recipient full name, asked from the customer.",
                },
                "contact": {
                    "type": "string",
                    "description": "Phone or email for delivery contact.",
                },
                "address": {
                    "type": "string",
                    "description": "Full delivery address.",
                },
                "slot": {
                    "type": "string",
                    "description": "Preferred delivery time window (optional).",
                },
            },
            "required": ["payment_intent_id", "customer_name", "contact", "address"],
            "additionalProperties": False,
        },
        payload_model=PlaceOrderPayload,
        enrich=enrich,
    )
