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
"""

from __future__ import annotations

from typing import Any

from commerce_common.presentation import PresentationExtension
from pydantic import BaseModel, Field

from aurel_agents.proactive import WatchStore


class SetWatchPayload(BaseModel):
    """Model validates tool input; enriched payload là UI card cho FE."""

    product_id: str
    kind: str = Field(pattern="^(restock|price_drop)$")
    price_drop_pct: float | None = Field(default=None, ge=1, le=90)
    note: str | None = Field(default=None, max_length=200)


def build_watch_extension(
    watch_store: WatchStore,
    user_id_of: Any = None,
) -> PresentationExtension:
    """``set_watch`` presentation extension.

    ``user_id_of``: callable(session) → user_id (mặc định lấy
    ``session.user_id`` — đúng với ShoppingSessionContext).
    ``enrich`` chạy trong executor của agent với session thật.
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
        baseline: float | None = None
        if payload.kind == "price_drop":
            product = context.state.seen_products.get(payload.product_id)
            baseline = float(product.price) if product else None
        watch = watch_store.add(
            user_id=user_id,
            product_id=payload.product_id,
            kind=payload.kind,
            price_drop_pct=payload.price_drop_pct,
            baseline_price=baseline,
        )
        if payload.kind == "restock":
            confirm = "sản phẩm về lại hàng"
        else:
            pct = payload.price_drop_pct or 0
            confirm = f"giá giảm ít nhất {pct:g}% so với ${baseline or 0:,.0f}"
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
