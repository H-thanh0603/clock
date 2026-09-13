# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Tính năng agent-only (chatbot không làm được vì không có loop nền
và không giữ trạng thái khi không ai chat):

1. **Watch store**: khách nhờ "báo tôi khi chiếc X về hàng/giảm giá" —
   agent lưu watch qua tool ``set_watch``, loop nền kiểm tra định kỳ và
   ghi alert khi điều kiện khớp. Chatbot quên ngay sau khi trả lời.
2. **Proactive monitoring**: merchant agent TỰ chạy định kỳ (không ai
   hỏi) — quét tồn kho thấp, đơn PENDING, rồi tóm tắt ra alert feed.
3. **Handoff ticket**: shopping agent phát hiện khiếu nại/lỗi đơn →
   ghi ticket, merchant scan đọc ticket trong turn của nó.

Tất cả ghi ra ``data/alerts.json`` (feed) + ``data/watches.json`` +
``data/tickets.json`` — persist qua restart, FE poll ``GET /alerts``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger("aurel-agents.proactive")

# Không rớt alert khi file hỏng; cap để feed không phình vô hạn.
MAX_ALERTS = 500
MAX_WATCHES_PER_USER = 20
MAX_OPEN_TICKETS = 100
# Alert merchant-scan (low_stock/pending/ticket) lặp mỗi vòng — chỉ publish
# lại sau khoảng này để feed không spam cùng 1 tình trạng.
ALERT_REPEAT_AFTER_S = 6 * 3600


# --- mô hình dữ liệu -----------------------------------------------------------------


class Watch(BaseModel):
    """1 lời nhờ theo dõi của khách: restock hoặc giá giảm theo %."""

    watch_id: str
    user_id: str
    product_id: str
    kind: str = "restock"  # "restock" | "price_drop"
    price_drop_pct: float | None = None  # ngưỡng giảm % so với giá lúc đặt
    baseline_price: float | None = None
    created_at: float = Field(default_factory=time.time)
    active: bool = True


class Alert(BaseModel):
    """1 sự kiện agent tự phát hiện — chat vào feed cho FE render."""

    alert_id: str
    kind: str  # "restock" | "price_drop" | "low_stock" | "pending_orders" | "ticket"
    title: str
    detail: str
    data: dict[str, Any] = Field(default_factory=dict)
    created_at: float = Field(default_factory=time.time)


class Ticket(BaseModel):
    """Handoff shopping → merchant: khiếu nại cần vận hành xử lý."""

    ticket_id: str
    user_id: str
    order_id: str | None = None
    summary: str
    status: str = "open"  # open | resolved
    created_at: float = Field(default_factory=time.time)


# --- store JSON (pattern TranscriptStore: load/cache/save, không bao giờ raise) -------


class _JsonListStore:
    """File JSON list + cache in-memory + cap."""

    def __init__(self, path: Path, model: type[BaseModel], cap: int) -> None:
        self._path = path
        self._model = model
        self._cap = cap
        self._items: list[BaseModel] = []
        self._load()

    def _load(self) -> None:
        try:
            if self._path.exists():
                raw = json.loads(self._path.read_text(encoding="utf-8"))
                if isinstance(raw, list):
                    self._items = [
                        self._model.model_validate(x)
                        for x in raw
                        if isinstance(x, dict)
                    ][-self._cap :]
        except Exception:
            self._items = []

    def save(self) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(
                json.dumps(
                    [x.model_dump(mode="json") for x in self._items],
                    ensure_ascii=False,
                    default=str,
                ),
                encoding="utf-8",
            )
        except Exception:
            pass

    def all(self) -> list[BaseModel]:
        return list(self._items)

    def _add(self, item: BaseModel) -> None:
        self._items.append(item)
        if len(self._items) > self._cap:
            self._items = self._items[-self._cap :]
        self.save()


class WatchStore(_JsonListStore):
    def __init__(self, path: Path) -> None:
        super().__init__(path, Watch, MAX_WATCHES_PER_USER * 50)

    def add(
        self,
        user_id: str,
        product_id: str,
        kind: str,
        price_drop_pct: float | None = None,
        baseline_price: float | None = None,
    ) -> Watch:
        """Thêm watch (dedupe: 1 user/1 sp/1 kind chỉ 1 dòng; quá cap → lỗi)."""
        if kind not in ("restock", "price_drop"):
            raise ValueError(f"kind không hợp lệ: {kind}")
        existing = self.all()
        mine = [w for w in existing if isinstance(w, Watch) and w.user_id == user_id]
        if any(
            w.product_id == product_id and w.kind == kind and w.active  # type: ignore[attr-defined]
            for w in mine
        ):
            raise ValueError("Bạn đã nhờ theo dõi điều này rồi")
        if len(mine) >= MAX_WATCHES_PER_USER:
            raise ValueError("Bạn đang theo dõi quá nhiều — hãy bỏ bớt trước")
        watch = Watch(
            watch_id=f"w-{int(time.time() * 1000) % 10**9:09d}-{len(existing):04d}",
            user_id=user_id,
            product_id=product_id,
            kind=kind,
            price_drop_pct=price_drop_pct,
            baseline_price=baseline_price,
        )
        self._add(watch)
        return watch

    def active(self) -> list[Watch]:
        return [w for w in self.all() if isinstance(w, Watch) and w.active]

    def deactivate(self, watch_id: str) -> Watch | None:
        for w in self.all():
            if isinstance(w, Watch) and w.watch_id == watch_id and w.active:
                w.active = False
                self.save()
                return w
        return None

    def for_user(self, user_id: str) -> list[Watch]:
        return [
            w
            for w in self.all()
            if isinstance(w, Watch) and w.user_id == user_id and w.active
        ]


class AlertFeed(_JsonListStore):
    def __init__(self, path: Path) -> None:
        super().__init__(path, Alert, MAX_ALERTS)

    def publish(
        self, kind: str, title: str, detail: str, data: dict[str, Any] | None = None
    ) -> Alert:
        alert = Alert(
            alert_id=f"a-{int(time.time() * 1000) % 10**9:09d}-{len(self.all()):04d}",
            kind=kind,
            title=title[:120],
            detail=detail[:600],
            data=data or {},
        )
        self._add(alert)
        logger.info("alert [%s] %s", kind, title)
        return alert

    def recent(self, limit: int = 50) -> list[Alert]:
        items = [a for a in self.all() if isinstance(a, Alert)]
        return items[-limit:][::-1]


class TicketStore(_JsonListStore):
    def __init__(self, path: Path) -> None:
        super().__init__(path, Ticket, MAX_OPEN_TICKETS * 3)

    def open(
        self, user_id: str, summary: str, order_id: str | None = None
    ) -> Ticket:
        # Dedupe: user + order đang open thì không mở thêm.
        for t in self.all():
            if (
                isinstance(t, Ticket)
                and t.status == "open"
                and t.user_id == user_id
                and t.order_id == order_id
            ):
                return t
        ticket = Ticket(
            ticket_id=f"t-{int(time.time() * 1000) % 10**9:09d}-{len(self.all()):04d}",
            user_id=user_id,
            order_id=order_id,
            summary=summary[:400],
        )
        self._add(ticket)
        return ticket

    def resolve(self, ticket_id: str) -> Ticket | None:
        for t in self.all():
            if isinstance(t, Ticket) and t.ticket_id == ticket_id and t.status == "open":
                t.status = "resolved"
                self.save()
                return t
        return None

    def open_tickets(self) -> list[Ticket]:
        return [t for t in self.all() if isinstance(t, Ticket) and t.status == "open"]


# --- các kiểm tra điều kiện (thuần, test được, không đụng network) ----------------------


def check_watches(
    watches: list[Watch], products: dict[str, dict[str, Any]]
) -> list[Alert]:
    """Đối chiếu watch active với snapshot giá/tồn kho hiện tại.

    ``products``: product_id → ProductDto (BE clock). Trả về alert phát
    sinh, KHÔNG đổi trạng thái watch (caller deactivatе sau khi đăng).
    """
    alerts: list[Alert] = []
    now = time.time()
    for w in watches:
        p = products.get(w.product_id)
        if p is None:
            continue
        stock = int(p.get("stock", 0) or 0)
        in_boutique = bool(p.get("inBoutique", True))
        price = float(p.get("priceUsd", 0) or 0)
        if w.kind == "restock" and stock > 0 and in_boutique:
            alerts.append(
                Alert(
                    alert_id=f"a-{int(now * 1000) % 10**9:09d}-{w.watch_id}",
                    kind="restock",
                    title=f"{p.get('name', w.product_id)} đã về lại hàng",
                    detail=(
                        f"Chiếc {p.get('name', w.product_id)} bạn nhờ theo dõi "
                        f"đã có hàng trở lại ({stock} chiếc)."
                    ),
                    data={"product_id": w.product_id, "stock": stock, "user_id": w.user_id},
                )
            )
        elif (
            w.kind == "price_drop"
            and w.baseline_price
            and price < w.baseline_price
            and (w.baseline_price - price) / w.baseline_price * 100
            >= (w.price_drop_pct or 0)
        ):
            drop_pct = round((w.baseline_price - price) / w.baseline_price * 100, 1)
            alerts.append(
                Alert(
                    alert_id=f"a-{int(now * 1000) % 10**9:09d}-{w.watch_id}",
                    kind="price_drop",
                    title=f"{p.get('name', w.product_id)} giảm {drop_pct}%",
                    detail=(
                        f"Chiếc {p.get('name', w.product_id)} đang giảm giá: "
                        f"từ ${w.baseline_price:,.0f} xuống ${price:,.0f} "
                        f"(-{drop_pct}%)."
                    ),
                    data={
                        "product_id": w.product_id,
                        "old_price": w.baseline_price,
                        "new_price": price,
                        "user_id": w.user_id,
                    },
                )
            )
    return alerts


def check_merchant_snapshot(snapshot: dict[str, Any], inventory: list[dict[str, Any]]) -> list[Alert]:
    """Phát hiện anomaly từ admin/stats + inventory alerts của BE.

    ``inventory``: list InventoryAlert (đã map sẵn từ AurelMerchant
    ``get_inventory_alerts``, model_dump).
    """
    alerts: list[Alert] = []
    now = time.time()
    low = [
        i
        for i in inventory
        if i.get("stock", 0) > 0 and i.get("stock", 0) <= 2
    ]
    if low:
        names = ", ".join(f"{i['title']} (còn {i['stock']})" for i in low[:5])
        alerts.append(
            Alert(
                alert_id=f"a-{int(now * 1000) % 10**9:09d}-lowstock",
                kind="low_stock",
                title=f"{len(low)} sản phẩm tồn kho thấp",
                detail=names,
                data={"count": len(low), "listings": [i.get("listing_id") for i in low]},
            )
        )
    pending = int(snapshot.get("pendingOrders", 0) or 0)
    if pending >= 5:
        alerts.append(
            Alert(
                alert_id=f"a-{int(now * 1000) % 10**9:09d}-pending",
                kind="pending_orders",
                title=f"{pending} đơn đang PENDING",
                detail="Số đơn chờ xử lý cao — merchant agent đề xuất rà soát.",
                data={"pending_orders": pending},
            )
        )
    return alerts


# --- background loop -------------------------------------------------------------------


class ProactiveMonitor:
    """Loop nền chạy song song host: check watch + scan merchant định kỳ.

    Chatbot không có vòng này — nó chỉ tồn tại khi có user message. Agent
    host là process dài hạn nên giám sát được liên tục.
    """

    def __init__(
        self,
        *,
        watch_store: WatchStore,
        alert_feed: AlertFeed,
        ticket_store: TicketStore,
        settings,
    ) -> None:
        self._watches = watch_store
        self._alerts = alert_feed
        self._tickets = ticket_store
        self._settings = settings
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self.last_run: float | None = None
        # Client dài hạn tái dùng qua các vòng quét (đăng nhập lại chỉ khi 401).
        self._shopper: Any | None = None
        self._admin: Any | None = None
        # Dedupe alert merchant: fingerprint → timestamp lần cuối publish.
        # Không có cái này, 1 tình trạng tồn kho thấp lặp lại mỗi vòng quét.
        self._alert_seen: dict[str, float] = {}

    def start(self) -> None:
        if self._settings is None or self._settings.monitor_interval_s <= 0:
            logger.info("Proactive monitor tắt (settings chưa có hoặc interval=0)")
            return
        self._task = asyncio.create_task(self._run(), name="proactive-monitor")
        logger.info(
            "Proactive monitor chạy mỗi %ds", self._settings.monitor_interval_s
        )

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            try:
                await asyncio.wait_for(self._task, timeout=10)
            except (TimeoutError, asyncio.CancelledError):
                self._task.cancel()
        for client in (self._shopper, self._admin):
            if client is not None:
                try:
                    await client.aclose()
                except Exception:
                    pass
        self._shopper = None
        self._admin = None

    def _publish_once(self, kind: str, title: str, detail: str, data: dict[str, Any]) -> bool:
        """Publish alert merchant-scan đúng 1 lần cho 1 tình trạng.

        Fingerprint = kind + data (id sản phẩm/đơn); lặp lại mỗi vòng quét
        thì chỉ nhắc lại sau ALERT_REPEAT_AFTER_S giây.
        """
        fingerprint = kind + ":" + json.dumps(data, sort_keys=True, default=str)
        now = time.time()
        if now - self._alert_seen.get(fingerprint, 0) < ALERT_REPEAT_AFTER_S:
            return False
        self._alert_seen[fingerprint] = now
        self._alerts.publish(kind, title, detail, data)
        return True

    async def _run(self) -> None:
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(
                    self._stop.wait(), timeout=self._settings.monitor_interval_s
                )
                break  # stop() được gọi
            except TimeoutError:
                pass
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("vòng monitor lỗi — bỏ qua, chạy tiếp")

    async def run_once(self) -> dict[str, int]:
        """1 vòng: check watches + merchant scan. Trả về số alert mới."""
        self.last_run = time.time()
        counts = {"restock": 0, "price_drop": 0, "merchant": 0, "tickets": 0}
        counts.update(await self._check_watches())
        counts.update(await self._scan_merchant())
        return counts

    async def _shopper_client(self):
        """ClockClient shopper dài hạn — tạo 1 lần, tái dùng qua các vòng.

        ensure_session() login MỚI mỗi lần gọi (thiết kế cho turn chat),
        nên monitor chỉ gọi khi chưa có user. Hết hạn phiên thì request
        trả 401 → ClockClient tự login lại rồi retry (request đã có sẵn).
        """
        from aurel_agents.clock_client import ClockClient

        if self._shopper is None:
            self._shopper = ClockClient(
                self._settings.backend_url,
                self._settings.shopper_email,
                self._settings.shopper_password,
                register_if_new=True,
            )
        if not self._shopper.user:
            await self._shopper.ensure_session()
        return self._shopper

    async def _admin_client(self):
        from aurel_agents.clock_client import ClockClient

        if self._admin is None:
            self._admin = ClockClient(
                self._settings.backend_url,
                self._settings.admin_email,
                self._settings.admin_password,
                register_if_new=False,
            )
        if not self._admin.user:
            await self._admin.ensure_session()
        return self._admin

    async def _check_watches(self) -> dict[str, int]:
        watches = self._watches.active()
        if not watches:
            return {}
        client = await self._shopper_client()
        published = 0
        products: dict[str, dict[str, Any]] = {}
        for pid in {w.product_id for w in watches}:
            try:
                products[pid] = await client.product(pid)
            except Exception:
                logger.debug("watch product %s không đọc được", pid)
        fired: set[tuple[str, str]] = set()
        for alert in check_watches(watches, products):
            self._alerts.publish(alert.kind, alert.title, alert.detail, alert.data)
            # watch đã khớp → tắt để không lặp lại mỗi vòng
            key = (str(alert.data.get("product_id")), alert.kind)
            if key not in fired:
                for w in watches:
                    if w.product_id == key[0] and w.kind == key[1]:
                        self._watches.deactivate(w.watch_id)
                fired.add(key)
            published += 1
        return {"watches": published}

    async def _scan_merchant(self) -> dict[str, int]:
        """Merchant scan: đọc stats + inventory alerts trực tiếp (không tốn LLM).

        Turn LLM chỉ chạy khi có alert/ticket — operator hỏi tiếp qua chat.
        Ticket đã publish 1 lần khi mở (handoff) — vòng scan chỉ đếm,
        không publish lại, tránh spam feed mỗi 5 phút.
        """
        from merchant_agent import MerchantSessionContext

        from aurel_agents.merchant.backend import AurelMerchant

        client = await self._admin_client()
        published = 0
        open_tickets = len(self._tickets.open_tickets())
        try:
            merchant = AurelMerchant(client)
            session = MerchantSessionContext(
                session_id="monitor", merchant_id="aurel", operator="operator:monitor"
            )
            snapshot = await client.admin_stats()
            inventory = [
                a.model_dump(mode="json")
                for a in await merchant.get_inventory_alerts(session)
            ]
            for alert in check_merchant_snapshot(snapshot, inventory):
                if self._publish_once(
                    alert.kind, alert.title, alert.detail, alert.data
                ):
                    published += 1
        except Exception:
            logger.exception("merchant scan lỗi — bỏ qua vòng này")
        return {"merchant": published, "open_tickets": open_tickets}


