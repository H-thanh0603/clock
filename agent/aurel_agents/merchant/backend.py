# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""``MerchantBackend`` của Aurel & Co.: map admin API của backend clock
(stats/orders/products) lên interface merchant-agent (Anthropic commerce-agents).

Kiến trúc staged-change (propose → preview → approve → apply):

- ``stage_*``: ghi vào ``ChangeLedger`` (in-memory của upstream) — KHÔNG đụng BE.
- ``apply_change``: duy nhất nơi ghi thật, gọi ``PATCH /admin/products/{slug}``.
  Mọi PATCH của BE tự ghi ``ProductEvent`` — audit trail 2 lớp.
- clock KHÔNG có hệ thống campaign/promotion → ``stage_campaign`` /
  ``stage_promotion`` raise ``ChangeNotApplicable`` (executor sẽ relay cho model).

Số liệu map từ ``GET /admin/stats``: revenue (đơn PAID+), orders, users, products.
Traffic/conversion không có nguồn → None đúng luật "never a stand-in zero".
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from merchant_agent import (
    ActorKind,
    AlertCounts,
    BusinessSnapshot,
    Campaign,
    CampaignDraft,
    ChangeItem,
    ChangeKind,
    ChangeNotApplicable,
    InventoryActionItem,
    InventoryAlert,
    Listing,
    ListingDetails,
    ListingFilters,
    MerchantBackend,
    MerchantSessionContext,
    MetricPoint,
    MetricSeries,
    OrderIssue,
    PriceUpdateItem,
    PricingContext,
    PromotionDraft,
    StagedChange,
)
from merchant_agent.changes import ChangeLedger
from merchant_agent.config import MerchantAgentConfig

from aurel_agents.clock_client import ClockClient

logger = logging.getLogger(__name__)

# Trường Listing mà clock lưu được (admin PATCH nhận các field này)
_LISTING_FIELDS = {
    "title",
    "short_description",
    "long_description",
    "labels",
    "stock",
    "status",
}


def _listing_from_clock(p: dict[str, Any]) -> Listing:
    """ProductDto (admin view, gồm cả SP ẩn) → merchant Listing (plain shape)."""
    status: str = "active"
    if not p.get("inBoutique", True):
        status = "paused"  # ẩn khỏi boutique = tạm ngừng bán
    elif not p.get("stock", 0):
        status = "out_of_stock"
    return Listing(
        listing_id=str(p["slug"]),
        title=str(p.get("name", "")),
        status=status,  # type: ignore[arg-type]
        price=float(p.get("priceUsd", 0)),
        stock=int(p.get("stock", 0)),
        category=p.get("collection") or None,
        image_url=p.get("cardImage") or None,
        short_description=p.get("shortDescription") or None,
        attributes={
            "reference": str(p.get("reference", "")),
            "calibre": str(p.get("calibre", "")),
        },
    )


def _details_from_clock(p: dict[str, Any]) -> ListingDetails:
    base = _listing_from_clock(p).model_dump()
    base["long_description"] = p.get("narrative") or None
    return ListingDetails(**base)


class AurelMerchant(MerchantBackend):
    """Adapter chạy trên 1 ``ClockClient`` admin (login ADMIN)."""

    def __init__(
        self,
        client: ClockClient,
        *,
        ledger: ChangeLedger | None = None,
        config: MerchantAgentConfig | None = None,
    ) -> None:
        self._client = client
        self._ledger = ledger or ChangeLedger(
            config or MerchantAgentConfig(brand_name="Aurel & Co.")
        )

    # -- Performance ------------------------------------------------------------

    async def get_business_snapshot(
        self, session: MerchantSessionContext, period: str | None = None
    ) -> BusinessSnapshot:
        stats = await self._client.admin_stats()
        period = period or datetime.now(UTC).strftime("%Y-%m")
        orders_by_status = {
            str(c["status"]): int(c["count"]) for c in stats.get("ordersByStatus", [])
        }
        pending = len(self._ledger.pending())
        open_issues = sum(
            1 for s in ("PENDING", "CONFIRMED") if orders_by_status.get(s, 0) > 0
        )
        return BusinessSnapshot(
            period=period,
            compare_to=None,
            sales=float(stats.get("revenueUsd", 0) or 0),
            orders=int(stats.get("totalOrders", 0) or 0),
            # clock không có analytics traffic → None (không thay bằng số 0 giả)
            traffic=None,
            conversion_rate=None,
            average_order_value=(
                float(stats.get("revenueUsd", 0)) / stats["totalOrders"]
                if stats.get("totalOrders")
                else None
            ),
            alerts=AlertCounts(
                order_issues=open_issues,
                pending_changes=pending,
            ),
            currency="USD",
            note="Doanh thu chỉ tính đơn đã thu tiền (PAID+); không có nguồn traffic.",
        )

    async def query_metrics(
        self,
        session: MerchantSessionContext,
        metric: str,
        period: str | None = None,
        granularity: str = "day",
        segment: str | None = None,
    ) -> MetricSeries:
        # clock chỉ có tổng lũy kế qua /admin/stats — không có chuỗi thời gian
        if metric == "sales":
            stats = await self._client.admin_stats()
            return MetricSeries(
                metric="sales",
                unit="USD",
                granularity="month",
                period=period or "to-date",
                segment=segment,
                points=[
                    MetricPoint(
                        date=datetime.now(UTC).strftime("%Y-%m"),
                        value=float(stats.get("revenueUsd", 0) or 0),
                    )
                ],
                note="Tổng lũy kế từ /admin/stats; không có chuỗi theo ngày.",
            )
        return MetricSeries(
            metric=metric,
            granularity=granularity,
            period=period,
            segment=segment,
            points=[],
            note="clock chỉ có số liệu tổng lũy kế — metric này không có nguồn.",
        )

    async def get_campaign_performance(
        self, session: MerchantSessionContext, campaign_id: str | None = None
    ) -> list[Campaign]:
        return []  # clock không chạy campaign — model sẽ nói rõ điều này

    # -- Listings -----------------------------------------------------------------

    async def search_listings(
        self,
        session: MerchantSessionContext,
        query: str,
        filters: ListingFilters | None = None,
        limit: int = 10,
    ) -> list[Listing]:
        params: dict[str, Any] = {"limit": max(1, min(limit, 50))}
        if query.strip():
            params["q"] = query.strip()
        if filters and filters.category:
            # admin API không có filter collection — lọc client-side sau khi fetch
            pass
        data = await self._client.admin_products(**params)
        listings = [_listing_from_clock(p) for p in data.get("items", [])]
        if filters and filters.category:
            listings = [x for x in listings if x.category == filters.category]
        if filters and filters.status:
            listings = [x for x in listings if x.status == filters.status]
        if filters and filters.max_stock is not None:
            listings = [x for x in listings if x.stock <= (filters.max_stock or 0)]
        return listings[:limit]

    async def get_listing(
        self, session: MerchantSessionContext, listing_id: str
    ) -> ListingDetails | None:
        try:
            dto = await self._client.product(listing_id)
        except Exception as error:
            logger.debug("get_listing(%s): %s", listing_id, error)
            return None
        return _details_from_clock(dto)

    # -- Inventory and order health --------------------------------------------------

    async def get_inventory_alerts(
        self, session: MerchantSessionContext
    ) -> list[InventoryAlert]:
        data = await self._client.admin_products(limit=50)
        alerts: list[InventoryAlert] = []
        for p in data.get("items", []):
            stock = int(p.get("stock", 0))
            if stock > 0 and stock <= 2:  # mỗi chiếc là độc bản — ngưỡng rất thấp
                listing = _listing_from_clock(p)
                alerts.append(
                    InventoryAlert(
                        listing_id=listing.listing_id,
                        title=listing.title,
                        kind="low_stock",
                        stock=stock,
                        threshold=2,
                        storefront_visible=bool(p.get("inBoutique", True)),
                    )
                )
        return alerts

    async def get_order_issues(
        self, session: MerchantSessionContext
    ) -> list[OrderIssue]:
        data = await self._client.admin_orders(status="PENDING", limit=50)
        issues: list[OrderIssue] = []
        for o in data.get("items", []):
            issues.append(
                OrderIssue(
                    issue_id=f"pending-{o.get('id', '')}",
                    order_id=str(o.get("code", o.get("id", ""))),
                    kind="delayed",
                    summary=(
                        f"Đơn {o.get('code', '')} vẫn ở trạng thái PENDING — "
                        "chưa thanh toán hoặc chưa xử lý"
                    ),
                )
            )
        return issues

    # -- Pricing -------------------------------------------------------------------------

    async def get_pricing_context(
        self, session: MerchantSessionContext, listing_id: str
    ) -> PricingContext | None:
        try:
            dto = await self._client.product(listing_id)
        except Exception as error:
            logger.debug("get_pricing_context(%s): %s", listing_id, error)
            return None
        config = MerchantAgentConfig()
        return PricingContext(
            listing_id=listing_id,
            current_price=float(dto.get("priceUsd", 0)),
            currency="USD",
            max_price_delta_pct=float(config.max_price_delta_pct),
            max_promotion_discount_pct=float(config.max_promotion_discount_pct),
        )

    # -- Staged writes ----------------------------------------------------------------------

    def _actor(self, session: MerchantSessionContext) -> str:
        return session.operator or self._client.user_id or "operator"

    async def stage_listing_update(
        self,
        session: MerchantSessionContext,
        listing_id: str,
        fields: dict[str, Any],
        note: str | None = None,
    ) -> StagedChange:
        listing = await self.get_listing(session, listing_id)
        if listing is None:
            raise ChangeNotApplicable(f"Không rõ sản phẩm {listing_id}")
        items: list[ChangeItem] = []
        allowed = {
            "title": "title",
            "short_description": "short_description",
            "long_description": "long_description",
            "labels": "labels",
        }
        for agent_field in allowed:
            if agent_field in fields:
                items.append(
                    ChangeItem(
                        target=listing_id,
                        field=agent_field,
                        before=getattr(listing, agent_field, None),
                        after=fields[agent_field],
                    )
                )
        unsupported = [k for k in fields if k not in allowed and k not in ("stock", "price")]
        if unsupported:
            raise ChangeNotApplicable(
                f"clock không lưu qua listing_update: {', '.join(unsupported)} "
                "(stock → inventory action, price → price update)"
            )
        if not items:
            raise ChangeNotApplicable("Không có field hợp lệ nào trong listing update")
        return self._ledger.stage(
            kind=ChangeKind.LISTING_UPDATE,
            summary=note or f"Cập nhật nội dung {listing_id}",
            items=items,
            actor=self._actor(session),
            actor_kind=ActorKind.AGENT,
        )

    async def stage_price_update(
        self,
        session: MerchantSessionContext,
        items: list[PriceUpdateItem],
        note: str | None = None,
    ) -> StagedChange:
        change_items: list[ChangeItem] = []
        for it in items:
            dto = await self._client.product(it.listing_id)
            change_items.append(
                ChangeItem(
                    target=it.listing_id,
                    field="price",
                    before=float(dto.get("priceUsd", 0) or 0),
                    after=it.new_price,
                )
            )
        return self._ledger.stage(
            kind=ChangeKind.PRICE_UPDATE,
            summary=note or "Điều chỉnh giá",
            items=change_items,
            actor=self._actor(session),
            actor_kind=ActorKind.AGENT,
            currency="USD",
        )

    async def stage_inventory_action(
        self,
        session: MerchantSessionContext,
        items: list[InventoryActionItem],
        note: str | None = None,
    ) -> StagedChange:
        change_items: list[ChangeItem] = []
        for it in items:
            dto = await self._client.product(it.listing_id)
            if it.action == "restock":
                change_items.append(
                    ChangeItem(
                        target=it.listing_id,
                        field="stock",
                        before=int(dto.get("stock", 0) or 0),
                        after=int(dto.get("stock", 0) or 0) + int(it.quantity or 0),
                    )
                )
            elif it.action == "pause":
                change_items.append(
                    ChangeItem(
                        target=it.listing_id,
                        field="status",
                        before="active" if dto.get("inBoutique") else "paused",
                        after="paused",
                    )
                )
            elif it.action == "activate":
                change_items.append(
                    ChangeItem(
                        target=it.listing_id,
                        field="status",
                        before="active" if dto.get("inBoutique") else "paused",
                        after="active",
                    )
                )
        return self._ledger.stage(
            kind=ChangeKind.INVENTORY_ACTION,
            summary=note or "Thao tác tồn kho",
            items=change_items,
            actor=self._actor(session),
            actor_kind=ActorKind.AGENT,
        )

    async def stage_promotion(
        self, session: MerchantSessionContext, promotion: PromotionDraft
    ) -> StagedChange:
        raise ChangeNotApplicable(
            "clock (Aurel & Co.) không có hệ thống khuyến mãi theo khung ngày"
        )

    async def stage_campaign(
        self, session: MerchantSessionContext, campaign: CampaignDraft
    ) -> StagedChange:
        raise ChangeNotApplicable(
            "clock không chạy marketing campaign — không có kênh để áp dụng"
        )

    # -- Change lifecycle ------------------------------------------------------------

    async def get_pending_changes(
        self, session: MerchantSessionContext
    ) -> list[StagedChange]:
        return self._ledger.pending()

    async def apply_change(
        self, session: MerchantSessionContext, change_id: str
    ) -> StagedChange:
        change = self._ledger.get(change_id)
        if change is None or change.status.value != "staged":
            raise ChangeNotApplicable(f"Không có change {change_id} đang staged")
        # Thực hiện write thật — đây là platform write duy nhất
        for item in change.items:
            slug = item.target
            if item.field == "price":
                await self._client.admin_product_update(
                    slug, {"priceUsd": int(float(item.after))}
                )
            elif item.field == "stock":
                await self._client.admin_product_update(
                    slug, {"stock": int(item.after)}
                )
            elif item.field == "status":
                activate = item.after == "active"
                await self._client.admin_product_update(
                    slug, {"inBoutique": activate}
                )
            elif item.field == "title":
                await self._client.admin_product_update(slug, {"name": str(item.after)})
            elif item.field == "short_description":
                await self._client.admin_product_update(
                    slug, {"shortDescription": str(item.after)}
                )
            elif item.field == "long_description":
                await self._client.admin_product_update(
                    slug, {"narrative": str(item.after)}
                )
            elif item.field == "labels":
                value = item.after
                labels = value if isinstance(value, list) else [str(value)]
                await self._client.admin_product_update(
                    slug, {"badges": [str(x) for x in labels]}
                )
        return self._ledger.apply(change_id, self._actor(session))

    async def discard_change(
        self,
        session: MerchantSessionContext,
        change_id: str,
        actor_kind: ActorKind = ActorKind.OPERATOR,
    ) -> StagedChange:
        return self._ledger.discard(change_id, self._actor(session), actor_kind)

    # -- Merchant context ----------------------------------------------------------------

    async def get_merchant_context(
        self, session: MerchantSessionContext
    ) -> dict[str, Any]:
        from merchant_agent import DataLimitation

        return {
            "brand": "Aurel & Co.",
            "limitations": [
                DataLimitation(
                    source="admin stats",
                    note="Chỉ có tổng lũy kế; không có chuỗi theo ngày/traffic",
                ),
                DataLimitation(
                    source="campaigns",
                    note="Không có hệ thống khuyến mãi/marketing",
                ),
            ],
        }


__all__ = ["AurelMerchant"]
