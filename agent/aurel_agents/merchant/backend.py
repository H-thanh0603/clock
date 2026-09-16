# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""``MerchantBackend`` của Aurel & Co.: map admin API của backend clock
(stats/orders/products/promotions/campaigns/metrics) lên interface
merchant-agent (Anthropic commerce-agents).

Kiến trúc staged-change (propose → preview → approve → apply):

- ``stage_*``: ghi vào ``ChangeLedger`` — KHÔNG đụng BE.
- ``apply_change``: duy nhất nơi ghi thật (products/promotions/campaigns).
  Mọi PATCH product của BE tự ghi ``ProductEvent`` — audit trail 2 lớp.

Số liệu: snapshot từ ``GET /admin/stats`` + time-series từ ``GET /admin/metrics``.
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

from aurel_agents.activity import ActivityLog, log_activity
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

# Optimistic-drift check: field agent → getter lấy giá trị hiện tại từ
# ProductDto (admin view). Field không map (mô tả dài) → không check.
_DRIFT_FIELD_MAP: dict[str, Any] = {
    "price": lambda row: float(row.get("priceUsd") or 0),
    "stock": lambda row: int(row.get("stock") or 0),
    "status": lambda row: ("active" if row.get("inBoutique", True) else "paused"),
    "title": lambda row: str(row.get("name") or ""),
    "labels": lambda row: [str(x) for x in (row.get("badges") or [])],
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


_DRAFT_PREFIX = "aurel-draft:"


def _encode_draft(kind: str, draft: dict[str, Any]) -> str:
    """Nhúng draft vào guardrail_notes để sống qua persist ledger (restart)."""
    import json as _json

    return _DRAFT_PREFIX + kind + ":" + _json.dumps(draft, ensure_ascii=False, default=str)


def _decode_draft(change: Any, kind: str) -> dict[str, Any]:
    """Đọc draft từ guardrail_notes của change (fallback khi sidecar memory mất)."""
    import json as _json

    for note in getattr(change, "guardrail_notes", None) or []:
        if isinstance(note, str) and note.startswith(_DRAFT_PREFIX + kind + ":"):
            try:
                data = _json.loads(note[len(_DRAFT_PREFIX + kind + ":") :])
                if isinstance(data, dict):
                    return data
            except Exception:
                pass
    return {}


def _campaign_from_clock(c: dict[str, Any]) -> Campaign:
    """CampaignDto (clock) → merchant Campaign (spend/revenue None khi chưa báo)."""
    status = str(c.get("status", "draft"))
    if status not in ("draft", "active", "paused", "ended"):
        status = "draft"
    return Campaign(
        campaign_id=str(c.get("id", "")),
        name=str(c.get("name", "")),
        status=status,  # type: ignore[arg-type]
        objective=c.get("objective"),
        budget=float(c.get("budgetUsd", 0) or 0),
        spend=c.get("spendUsd"),
        revenue=c.get("revenueUsd"),
        currency="USD",
        starts=str(c["startsAt"][:10]) if c.get("startsAt") else None,
        ends=str(c["endsAt"][:10]) if c.get("endsAt") else None,
    )


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
        # AI Activity Log (host wire vào; None = không log — test/REPL).
        self._activity: ActivityLog | None = None
        self._ledger = ledger or ChangeLedger(
            config or MerchantAgentConfig(brand_name="Aurel & Co.")
        )
        # Draft gốc cho staged PROMOTION/CAMPAIGN (apply mới ghi BE).
        self._promo_drafts: dict[str, dict[str, Any]] = {}
        self._campaign_drafts: dict[str, dict[str, Any]] = {}

    # -- Performance ------------------------------------------------------------

    @log_activity("merchant")
    async def get_business_snapshot(
        self, session: MerchantSessionContext, period: str | None = None
    ) -> BusinessSnapshot:
        stats = await self._client.admin_stats()
        period = period or datetime.now(UTC).strftime("%Y-%m")
        orders_by_status = {
            str(c["status"]): int(c["count"]) for c in stats.get("ordersByStatus", [])
        }
        pending = len(self._ledger.pending())
        open_issues = sum(1 for s in ("PENDING", "CONFIRMED") if orders_by_status.get(s, 0) > 0)
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

    @log_activity("merchant")
    async def query_metrics(
        self,
        session: MerchantSessionContext,
        metric: str,
        period: str | None = None,
        granularity: str = "day",
        segment: str | None = None,
    ) -> MetricSeries:
        # Time-series thật từ /admin/metrics (sales + orders theo ngày/tuần/tháng).
        # Traffic/others không có nguồn → points rỗng + note, không bịa số.
        if metric in ("sales", "orders"):
            gran = granularity if granularity in ("day", "week", "month") else "day"
            data = await self._client.admin_metrics(metric=metric, granularity=gran, days=90)
            points = [
                MetricPoint(date=str(p.get("date", "")), value=float(p.get("value", 0)))
                for p in (data.get("points") or [])
            ]
            return MetricSeries(
                metric=metric,
                unit="USD" if metric == "sales" else "orders",
                granularity=gran,  # type: ignore[arg-type]
                period=period or "last-90-days",
                segment=segment,
                points=points,
                note="Số liệu từ đơn thật (sales chỉ PAID+).",
            )
        return MetricSeries(
            metric=metric,
            granularity=granularity,  # type: ignore[arg-type]
            period=period,
            segment=segment,
            points=[],
            note="clock không có nguồn cho metric này (traffic: chưa có analytics).",
        )

    @log_activity("merchant")
    async def get_campaign_performance(
        self, session: MerchantSessionContext, campaign_id: str | None = None
    ) -> list[Campaign]:
        rows = await self._client.admin_campaigns()
        campaigns = [_campaign_from_clock(r) for r in rows]
        if campaign_id:
            campaigns = [c for c in campaigns if c.campaign_id == campaign_id]
        return campaigns

    # -- Listings -----------------------------------------------------------------

    @log_activity("merchant")
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

    @log_activity("merchant", lambda s, a, k: str(a[0]) if a else None)
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

    @log_activity("merchant")
    async def get_inventory_alerts(self, session: MerchantSessionContext) -> list[InventoryAlert]:
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

    @log_activity("merchant")
    async def get_order_issues(self, session: MerchantSessionContext) -> list[OrderIssue]:
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

    @log_activity("merchant", lambda s, a, k: str(a[0]) if a else None)
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

    @log_activity("merchant")
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

    @log_activity("merchant")
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

    @log_activity("merchant")
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

    @log_activity("merchant")
    async def stage_promotion(
        self, session: MerchantSessionContext, promotion: PromotionDraft
    ) -> StagedChange:
        # Khuyến mãi thật: mỗi listing là 1 price move (before → giá KM),
        # guardrail max_promotion_discount_pct của ledger kiểm tra cap.
        # Apply mới tạo Promotion + cập nhật giá SP trong BE.
        change_items: list[ChangeItem] = []
        for listing_id in promotion.listing_ids:
            dto = await self._client.product(listing_id)
            before = float(dto.get("priceUsd", 0) or 0)
            after = round(before * (1 - promotion.discount_pct / 100))
            change_items.append(
                ChangeItem(
                    target=listing_id,
                    field="price",
                    before=before,
                    after=float(after),
                )
            )
        change = self._ledger.stage(
            kind=ChangeKind.PROMOTION,
            summary=f"Khuyến mãi {promotion.name} ({promotion.discount_pct}% "
            f"từ {promotion.starts} đến {promotion.ends})",
            items=change_items,
            actor=self._actor(session),
            actor_kind=ActorKind.AGENT,
            currency="USD",
            guardrail_notes=[
                _encode_draft(
                    "promo",
                    {
                        "name": promotion.name,
                        "listing_ids": list(promotion.listing_ids),
                        "discount_pct": promotion.discount_pct,
                        "starts": promotion.starts,
                        "ends": promotion.ends,
                    },
                )
            ],
        )
        self._promo_drafts[change.change_id] = {
            "name": promotion.name,
            "listing_ids": list(promotion.listing_ids),
            "discount_pct": promotion.discount_pct,
            "starts": promotion.starts,
            "ends": promotion.ends,
        }
        return change

    @log_activity("merchant")
    async def stage_campaign(
        self, session: MerchantSessionContext, campaign: CampaignDraft
    ) -> StagedChange:
        # Campaign thật: tạo mới (campaign_id None) hoặc đổi budget/copy/status.
        # Guardrail max_campaign_budget của ledger kiểm tra budget cap.
        if campaign.campaign_id:
            rows = await self._client.admin_campaigns()
            current = next((r for r in rows if str(r.get("id")) == campaign.campaign_id), None)
            if current is None:
                raise ChangeNotApplicable(f"Không thấy campaign {campaign.campaign_id}")
            items: list[ChangeItem] = []
            if campaign.budget is not None:
                items.append(
                    ChangeItem(
                        target=campaign.campaign_id,
                        field="budget",
                        before=float(current.get("budgetUsd", 0) or 0),
                        after=float(campaign.budget),
                    )
                )
            if campaign.copy_text is not None:
                items.append(
                    ChangeItem(
                        target=campaign.campaign_id,
                        field="copy_text",
                        before=current.get("copyText"),
                        after=campaign.copy_text,
                    )
                )
            if not items:
                raise ChangeNotApplicable("Không có thay đổi nào cho campaign")
            draft = {
                "campaign_id": campaign.campaign_id,
                "budget": campaign.budget,
                "copy_text": campaign.copy_text,
            }
            summary = f"Cập nhật campaign {current.get('name', campaign.campaign_id)}"
        else:
            items = [
                ChangeItem(
                    target="new",
                    field="budget",
                    before=0,
                    after=float(campaign.budget or 0),
                )
            ]
            draft = {
                "name": campaign.name,
                "objective": campaign.objective,
                "audience": campaign.audience,
                "budget": campaign.budget or 0,
                "copy_text": campaign.copy_text,
                "starts": campaign.starts,
                "ends": campaign.ends,
            }
            summary = f"Tạo campaign {campaign.name}"
        change = self._ledger.stage(
            kind=ChangeKind.CAMPAIGN,
            summary=summary,
            items=items,
            actor=self._actor(session),
            actor_kind=ActorKind.AGENT,
            currency="USD",
            guardrail_notes=[_encode_draft("campaign", draft)],
        )
        self._campaign_drafts[change.change_id] = draft
        return change

    # -- Change lifecycle ------------------------------------------------------------

    async def _assert_no_drift(self, change: Any) -> None:
        """Mỗi item của change: giá hiện tại BE phải còn khớp ``before``.

        Chỉ check field có nguồn đọc được (price/stock/inBoutique/name/
        badges — map từ field agent); field mô tả dài bỏ qua (so sánh text
        tốn mà đổi ý là chuyện thường). Drift → ChangeNotApplicable với
        message nêu rõ field nào trượt, operator xem lại rồi stage lại.
        """
        for item in change.items:
            getter = _DRIFT_FIELD_MAP.get(str(item.field))
            if getter is None or item.before is None:
                continue
            try:
                row = await self._client.admin_product_row(item.target)
            except Exception as error:
                logger.debug("drift check %s không đọc được: %s", item.target, error)
                continue  # không đọc được → để PATCH tự báo lỗi phía BE
            current = getter(row)
            if current is not None and current != item.before:
                raise ChangeNotApplicable(
                    f"{item.target}: trường '{item.field}' đã đổi từ lúc đề xuất "
                    f"({item.before!r} → {current!r}) — hãy xem lại rồi đề xuất lại"
                )

    @log_activity("merchant")
    async def get_pending_changes(self, session: MerchantSessionContext) -> list[StagedChange]:
        return self._ledger.pending()

    @log_activity("merchant", lambda s, a, k: str(a[0]) if a else None)
    async def apply_change(self, session: MerchantSessionContext, change_id: str) -> StagedChange:
        change = self._ledger.get(change_id)
        if change is None or change.status.value != "staged":
            raise ChangeNotApplicable(f"Không có change {change_id} đang staged")
        # Optimistic concurrency: giá trị khi stage (item.before) phải còn
        # đúng lúc apply. Operator/admin sửa trực tiếp ở giữa → từ chối
        # cả change thay vì ghi đè âm thầm (lost update).
        await self._assert_no_drift(change)
        if change.kind == ChangeKind.PROMOTION:
            draft = self._promo_drafts.get(change_id) or _decode_draft(change, "promo")
            await self._client.admin_promotion_create(
                {
                    "name": draft.get("name", change.summary[:80]),
                    "listingSlugs": draft.get("listing_ids", [i.target for i in change.items]),
                    "discountPct": draft.get("discount_pct", 0),
                    "startsAt": draft.get("starts"),
                    "endsAt": draft.get("ends"),
                }
            )
            for item in change.items:
                await self._client.admin_product_update(
                    item.target, {"priceUsd": int(float(item.after))}
                )
        elif change.kind == ChangeKind.CAMPAIGN:
            draft = self._campaign_drafts.get(change_id) or _decode_draft(change, "campaign")
            if draft.get("campaign_id"):
                patch: dict[str, Any] = {}
                if draft.get("budget") is not None:
                    patch["budgetUsd"] = int(float(draft["budget"]))
                if draft.get("copy_text") is not None:
                    patch["copyText"] = str(draft["copy_text"])
                if patch:
                    await self._client.admin_campaign_update(str(draft["campaign_id"]), patch)
            else:
                await self._client.admin_campaign_create(
                    {
                        "name": draft.get("name", change.summary[:80]),
                        "objective": draft.get("objective"),
                        "audience": draft.get("audience"),
                        "budgetUsd": int(float(draft.get("budget") or 0)),
                        "copyText": draft.get("copy_text"),
                        "startsAt": draft.get("starts"),
                        "endsAt": draft.get("ends"),
                    }
                )
        else:
            # Thực hiện write thật cho listing/price/inventory
            for item in change.items:
                slug = item.target
                if item.field == "price":
                    await self._client.admin_product_update(
                        slug, {"priceUsd": int(float(item.after))}
                    )
                elif item.field == "stock":
                    await self._client.admin_product_update(slug, {"stock": int(item.after)})
                elif item.field == "status":
                    activate = item.after == "active"
                    await self._client.admin_product_update(slug, {"inBoutique": activate})
                elif item.field == "title":
                    await self._client.admin_product_update(slug, {"name": str(item.after)})
                elif item.field == "short_description":
                    await self._client.admin_product_update(
                        slug, {"shortDescription": str(item.after)}
                    )
                elif item.field == "long_description":
                    await self._client.admin_product_update(slug, {"narrative": str(item.after)})
                elif item.field == "labels":
                    value = item.after
                    labels = value if isinstance(value, list) else [str(value)]
                    await self._client.admin_product_update(
                        slug, {"badges": [str(x) for x in labels]}
                    )
        change = self._ledger.apply(change_id, self._actor(session))
        self._promo_drafts.pop(change_id, None)
        self._campaign_drafts.pop(change_id, None)
        return change

    @log_activity("merchant", lambda s, a, k: str(a[0]) if a else None)
    async def discard_change(
        self,
        session: MerchantSessionContext,
        change_id: str,
        actor_kind: ActorKind = ActorKind.OPERATOR,
    ) -> StagedChange:
        change = self._ledger.discard(change_id, self._actor(session), actor_kind)
        self._promo_drafts.pop(change_id, None)
        self._campaign_drafts.pop(change_id, None)
        return change

    # -- Merchant context ----------------------------------------------------------------

    @log_activity("merchant")
    async def get_merchant_context(self, session: MerchantSessionContext) -> dict[str, Any]:
        from merchant_agent import DataLimitation

        return {
            "brand": "Aurel & Co.",
            "limitations": [
                DataLimitation(
                    source="traffic",
                    note="Chưa có analytics traffic — sales/orders có time-series thật",
                ),
            ],
        }


__all__ = ["AurelMerchant"]
