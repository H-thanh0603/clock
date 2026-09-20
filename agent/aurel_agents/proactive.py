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
# Backoff vòng quét khi BE chết: interval × 2^failures, cap ở đây
# (30 phút — alert BE-down đã lên feed, không cần dập BE thêm).
MAX_BACKOFF_S = 30 * 60


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


class TicketMessage(BaseModel):
    """1 lượt khách báo trong cùng vụ việc (ticket)."""

    at: float = Field(default_factory=time.time)
    text: str
    severity: str | None = None
    sentiment: str | None = None
    department: str | None = None
    source: str = "heuristic"  # heuristic | jev


# Thứ tự nặng dần — dùng để biết ticket "leo thang" (lần sau nặng hơn).
SEVERITY_RANK = {"low": 1, "medium": 2, "high": 3, "critical": 4}


class Ticket(BaseModel):
    """Handoff shopping → merchant: khiếu nại cần vận hành xử lý.

    Giữ **toàn bộ lịch sử tin nhắn** của vụ việc (``messages``), không chỉ
    tin đầu tiên: khách quay lại "à mà còn bị trầy thêm chỗ nữa" thì
    merchant phải thấy. ``summary`` vẫn là dòng gọn cho feed/scan, cập nhật
    theo tin mới nhất; ``severity`` chỉ được **tăng**, không giảm.
    """

    ticket_id: str
    user_id: str
    order_id: str | None = None
    summary: str
    status: str = "open"  # open | resolved
    created_at: float = Field(default_factory=time.time)
    messages: list[TicketMessage] = Field(default_factory=list)
    severity: str | None = None
    sentiment: str | None = None
    department: str | None = None
    escalated_at: float | None = None  # lần gần nhất ticket leo thang
    updated_at: float = Field(default_factory=time.time)

    def history_text(self, limit: int = 8) -> str:
        """Gộp lịch sử thành 1 khối text để triage/scan đọc."""
        return "\n".join(f"- {m.text}" for m in self.messages[-limit:])


class Task(BaseModel):
    """Việc khách giao cho agent rồi đi ("tối tôi xem", "chuẩn bị giúp...").

    Khác watch (điều kiện giá/kho do monitor check): task là brief có thể
    tiếp tục — transcript đầy đủ đã persist theo session nên mở lại là có
    ngay context cũ. Không tốn LLM nền: agent không chạy khi không ai chat.
    """

    task_id: str
    user_id: str
    session_id: str  # chat session tạo task — resume mở đúng transcript
    title: str
    goal: str
    status: str = "open"  # open | done
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)


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

    def remove(self, item_id: str, id_field: str) -> bool:
        """Xóa 1 item theo id. Trả True nếu xóa được."""
        before = len(self._items)
        self._items = [
            x for x in self._items if getattr(x, id_field, None) != item_id
        ]
        changed = len(self._items) < before
        if changed:
            self.save()
        return changed

    def trim_before(self, cutoff: float, ts_field: str = "created_at") -> int:
        """Xóa item timestamp cũ hơn cutoff. Trả số item xóa."""
        before = len(self._items)
        self._items = [
            x for x in self._items if float(getattr(x, ts_field, 0) or 0) >= cutoff
        ]
        removed = before - len(self._items)
        if removed:
            self.save()
        return removed

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

    def get(self, watch_id: str) -> Watch | None:
        for w in self.all():
            if isinstance(w, Watch) and w.watch_id == watch_id:
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
        self,
        user_id: str,
        summary: str,
        order_id: str | None = None,
        *,
        severity: str | None = None,
        sentiment: str | None = None,
        department: str | None = None,
        source: str = "heuristic",
    ) -> tuple[Ticket, bool]:
        """Mở ticket mới HOẶC ghi thêm vào ticket đang open cùng user+order.

        Trả về ``(ticket, escalated)`` — ``escalated=True`` khi đây là tin
        tiếp theo của vụ việc đang mở **và** nặng hơn lần trước (customer
        quay lại bực hơn / thêm lỗi). Caller dùng cờ này để đẩy alert
        riêng, tránh feed nuốt mất diễn biến.
        """
        summary = (summary or "")[:400]
        msg = TicketMessage(
            text=summary,
            severity=severity,
            sentiment=sentiment,
            department=department,
            source=source,
        )
        # Dedupe: user + order đang open thì GHI THÊM vào lịch sử, không mở mới.
        for t in self.all():
            if (
                isinstance(t, Ticket)
                and t.status == "open"
                and t.user_id == user_id
                and t.order_id == order_id
            ):
                prev = SEVERITY_RANK.get(t.severity or "", 0)
                now = SEVERITY_RANK.get(severity or "", 0)
                escalated = now > prev
                t.messages.append(msg)
                # Summary theo tin mới nhất — merchant scan đọc dòng này trước.
                t.summary = summary
                if escalated:
                    t.severity = severity
                    t.escalated_at = msg.at
                elif not t.severity and severity:
                    t.severity = severity
                # sentiment: giữ "xấu nhất" đã thấy (angry > neutral).
                if sentiment and (not t.sentiment or sentiment == "angry"):
                    t.sentiment = sentiment
                if department and not t.department:
                    t.department = department
                t.updated_at = msg.at
                self.save()
                return t, escalated
        ticket = Ticket(
            ticket_id=f"t-{int(time.time() * 1000) % 10**9:09d}-{len(self.all()):04d}",
            user_id=user_id,
            order_id=order_id,
            summary=summary,
            messages=[msg],
            severity=severity,
            sentiment=sentiment,
            department=department,
        )
        self._add(ticket)
        return ticket, False

    def resolve(self, ticket_id: str) -> Ticket | None:
        for t in self.all():
            if isinstance(t, Ticket) and t.ticket_id == ticket_id and t.status == "open":
                t.status = "resolved"
                self.save()
                return t
        return None

    def open_tickets(self) -> list[Ticket]:
        return [t for t in self.all() if isinstance(t, Ticket) and t.status == "open"]


MAX_OPEN_TASKS_PER_USER = 10


class TaskStore(_JsonListStore):
    """Việc khách giao (G2-5): tạo bởi tool save_task, resume bằng session_id."""

    def __init__(self, path: Path) -> None:
        super().__init__(path, Task, MAX_OPEN_TASKS_PER_USER * 30)

    def add(self, user_id: str, session_id: str, title: str, goal: str) -> Task:
        """Giao việc mới (quá cap open/user → lỗi để model báo khách gọn bớt)."""
        title = (title or "").strip()[:120]
        goal = (goal or "").strip()[:500]
        if not title or not goal:
            raise ValueError("Thiếu tiêu đề hoặc nội dung công việc")
        mine_open = [
            t
            for t in self.all()
            if isinstance(t, Task) and t.user_id == user_id and t.status == "open"
        ]
        if len(mine_open) >= MAX_OPEN_TASKS_PER_USER:
            raise ValueError("Bạn đang giao quá nhiều việc — hãy xong bớt trước")
        task = Task(
            task_id=f"task-{int(time.time() * 1000) % 10**9:09d}-{len(self.all()):04d}",
            user_id=user_id,
            session_id=session_id,
            title=title,
            goal=goal,
        )
        self._add(task)
        return task

    def get(self, task_id: str) -> Task | None:
        for t in self.all():
            if isinstance(t, Task) and t.task_id == task_id:
                return t
        return None

    def for_user(self, user_id: str, status: str = "open") -> list[Task]:
        items = [
            t
            for t in self.all()
            if isinstance(t, Task) and t.user_id == user_id and t.status == status
        ]
        return sorted(items, key=lambda t: t.updated_at, reverse=True)

    def complete(self, task_id: str) -> Task | None:
        for t in self.all():
            if isinstance(t, Task) and t.task_id == task_id and t.status == "open":
                t.status = "done"
                t.updated_at = time.time()
                self.save()
                return t
        return None


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


def check_ticket_sla(
    tickets: list[Ticket],
    *,
    sla_hours: float = 24.0,
    now: float | None = None,
    bucket_hours: float = 6.0,
) -> list[Alert]:
    """Ticket open quá SLA mà chưa ai xử lý → alert nhắc.

    Trước đây ticket chỉ publish 1 lần lúc mở; khách nhắn 5 lần trong 3 ngày
    mà không ai trả lời thì feed im lặng. Hàm này biến "quá hạn" thành alert
    có thể lặp — caller dùng ``_publish_once`` để không spam mỗi vòng.

    ``data`` cố tình CHỈ chứa field ổn định (count, severity, id) — không
    chứa ``oldest_hours`` vì nó đổi mỗi vòng quét, fingerprint sẽ khác nhau
    → ``_publish_once`` tưởng tình trạng mới và spam alert mỗi 5 phút.
    (Tuổi được gom theo ``bucket_hours`` nếu muốn leak tiến triển.)
    """
    import time as _time

    now = now if now is not None else _time.time()
    cutoff = now - max(0.0, sla_hours) * 3600
    overdue = [
        t
        for t in tickets
        if getattr(t, "status", None) == "open"
        and getattr(t, "updated_at", t.created_at) < cutoff
    ]
    if not overdue:
        return []
    worst = max(overdue, key=lambda t: SEVERITY_RANK.get(t.severity or "", 0))
    oldest = max((now - t.updated_at) / 3600 for t in overdue)
    age_bucket = int(oldest // max(1.0, bucket_hours))
    return [
        Alert(
            alert_id=f"a-{int(now * 1000) % 10**9:09d}-ticketsla",
            kind="ticket_sla",
            title=f"{len(overdue)} ticket quá {sla_hours:.0f}h chưa xử lý",
            detail=(
                f"Lâu nhất ~{oldest:.0f}h. Nặng nhất: "
                f"{worst.severity or 'chưa rõ'} — {worst.summary[:120]}"
            ),
            data={
                "count": len(overdue),
                "age_bucket_6h": age_bucket,
                "worst_severity": worst.severity,
                "ticket_ids": [t.ticket_id for t in overdue[:10]],
            },
        )
    ]


def cleanup_expired(
    sessions_dir: Path,
    watch_store: WatchStore,
    ticket_store: TicketStore,
    alert_feed: AlertFeed,
    retention_days: int,
    task_store: TaskStore | None = None,
) -> dict[str, int]:
    """Dọn dữ liệu cá nhân cũ hơn TTL (transcript/watch/ticket/alert/task).

    GDPR-ish: hội thoại khách không nằm vô hạn trên disk. Transcript
    không watch active → xóa file. Watch active nhưng cũ thì vẫn giữ
    (khách còn đang chờ báo). Task open cũng giữ transcript (resume cần
    context cũ); task done cũ thì dọn. Gọi mỗi vòng monitor; trả về số
    item dọn.
    """
    if retention_days <= 0:
        return {}
    cutoff = time.time() - retention_days * 86400
    removed = {"transcripts": 0, "watches": 0, "tickets": 0, "alerts": 0, "tasks": 0}

    # 1) Transcript: file cũ + user không còn watch active / task open nào → xóa.
    active_watch_users = {w.user_id for w in watch_store.active()}
    open_task_users = (
        {t.user_id for t in task_store.all() if isinstance(t, Task) and t.status == "open"}
        if task_store is not None
        else set()
    )
    if sessions_dir.is_dir():
        for path in sessions_dir.glob("*.json"):
            try:
                if path.stat().st_mtime > cutoff:
                    continue
                # user của session = shopper:<8 prefix đầu file name>
                sid = path.stem
                user_id = f"shopper:{sid[:8]}"
                if user_id in active_watch_users or user_id in open_task_users:
                    continue  # còn watch chờ báo / task đang mở — giữ transcript
                path.unlink(missing_ok=True)
                removed["transcripts"] += 1
            except Exception:
                pass

    # 2) Ticket resolved cũ + open quá cũ (không ai xử lý 30 ngày → dọn).
    for t in ticket_store.all():
        if not isinstance(t, Ticket):
            continue
        if t.status == "resolved" and t.created_at < cutoff:
            ticket_store.remove(t.ticket_id, "ticket_id")
            removed["tickets"] += 1

    # 3) Watch inactive cũ (đã khớp/hủy — chỉ còn làm data rác).
    for w in watch_store.all():
        if isinstance(w, Watch) and not w.active and w.created_at < cutoff:
            watch_store.remove(w.watch_id, "watch_id")
            removed["watches"] += 1

    # 4) Alert feed tự cap 500 (MAX_ALERTS) — chỉ trim thêm theo TTL.
    trimmed = alert_feed.trim_before(cutoff)
    removed["alerts"] = trimmed

    # 5) Task done cũ (việc xong quá TTL — chỉ còn làm data rác). Task open
    # dù cũ vẫn giữ: đó là cam kết đang chờ khách quay lại.
    if task_store is not None:
        for t in task_store.all():
            if (
                isinstance(t, Task)
                and t.status == "done"
                and t.updated_at < cutoff
            ):
                task_store.remove(t.task_id, "task_id")
                removed["tasks"] += 1

    total = sum(removed.values())
    if total:
        logger.info("retention dọn %s (TTL %dd)", removed, retention_days)
    return removed




# --- single-instance lock ---------------------------------------------------------------


def acquire_single_instance_lock(lock_path: Path) -> Any:
    """File-lock fcntl: chống 2 process agent host chạy song song.

    Các store JSON (transcript/watch/alert/ticket/ledger) giả định
    single-writer — 2 replica cùng ghi sẽ đè mất update của nhau. Lock
    giữ sống trong lifespan của host (giữ handle, không close). Trả về
    file handle (giữ tham chiếu!) hoặc raise RuntimeError nếu có
    instance khác đang giữ.
    """
    import fcntl

    lock_path.parent.mkdir(parents=True, exist_ok=True)
    handle = open(lock_path, "w")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as error:
        handle.close()
        raise RuntimeError(
            "Một instance agent host khác đang chạy (lock "
            f"{lock_path}). Các store JSON giả định single-writer — "
            "muốn chạy nhiều replica thì chuyển store sang DB."
        ) from error
    handle.write(str(time.time()))
    handle.flush()
    return handle


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
        sessions_dir: Path | None = None,
        activity_log=None,
        task_store=None,
        alert_gate=None,
    ) -> None:
        self._watches = watch_store
        self._alerts = alert_feed
        self._tickets = ticket_store
        self._task_store = task_store
        self._settings = settings
        # #3: gate Jev chấm alert merchant-scan có đáng lên feed không.
        # Async callable (kind, title, detail) → bool (True = publish).
        # None = tắt lọc (publish như cũ). Gate tự fail-safe: lỗi → True.
        self._alert_gate = alert_gate
        # AI Activity Log (host wire vào ở lifespan) — retention sweep dọn
        # dòng cũ cùng vòng quét. None = không dọn (test không cần).
        self._activity_log = activity_log
        self._sessions_dir = sessions_dir if sessions_dir is not None else Path("/dev/null")
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

    async def _should_publish(self, kind: str, title: str, detail: str) -> bool:
        """#3: hỏi Jev alert có đáng lên feed không (chỉ merchant-scan).

        Tick mỗi alert mỗi vòng quét (mặc định interval 300s) nên chi phí
        bị chặn bằng số alert thực phát sinh — thường 0-2/vòng. Gate lỗi
        (Jev chết/thiếu key) → True: không bao giờ MẤT alert vì Jev.
        """
        if self._alert_gate is None:
            return True
        try:
            return await self._alert_gate(kind, title, detail)
        except Exception:
            logger.warning(
                "alert gate lỗi — publish như cũ (fail-safe)", exc_info=True
            )
            return True

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
        """Vòng lặp chính: interval cố định khi khỏe, backoff khi BE chết.

        BE down 1 ngày không nên tạo 288 stack trace + 288 vòng login vô
        ích: sau mỗi lần fail liên tiếp, interval nhân đôi (cap
        MAX_BACKOFF_S). Vào trạng thái down → 1 alert "agent không nối
        được BE"; phục hồi → 1 alert "đã phục hồi" — operator nhìn feed là
        biết, không cần đọc log.
        """
        failures = 0
        was_down = False
        while not self._stop.is_set():
            try:
                await asyncio.wait_for(
                    self._stop.wait(), timeout=self._current_delay(failures)
                )
                break  # stop() được gọi
            except TimeoutError:
                pass
            try:
                await self.run_once()
                failures = 0
                if was_down:
                    was_down = False
                    self._publish_once(
                        "be_status",
                        "Backend đã nối lại",
                        "Vòng quét agent chạy lại bình thường sau gián đoạn.",
                        {"status": "up"},
                    )
            except asyncio.CancelledError:
                raise
            except Exception:
                failures += 1
                if not was_down:
                    was_down = True
                    self._publish_once(
                        "be_status",
                        "Agent không nối được backend",
                        f"Vòng quét fail liên tục — thử lại sau backoff "
                        f"(tối đa {MAX_BACKOFF_S}s). Kiểm tra backend "
                        f"{self._settings.backend_url}.",
                        {"status": "down"},
                    )
                logger.exception("vòng monitor lỗi (lần %d) — backoff", failures)

    def _current_delay(self, failures: int) -> int:
        """Interval hiện tại: base khi khỏe, nhân đôi mỗi lần fail (cap)."""
        if failures <= 0:
            return self._settings.monitor_interval_s

        backoff = self._settings.monitor_interval_s * (2**failures)
        return min(backoff, MAX_BACKOFF_S)

    async def run_once(self) -> dict[str, int]:
        """1 vòng: check watches + merchant scan. Trả về số alert mới.

        Raise khi BE không trả lời được ở KHÔCẢ HAI scan — vòng loop cha
        dùng để backoff. 1 scan sống (BE vẫn nâng cao được) coi như
        vòng thành công.
        """
        self.last_run = time.time()
        counts = {"restock": 0, "price_drop": 0, "merchant": 0, "tickets": 0}
        watch_error: Exception | None = None
        merchant_error: Exception | None = None
        try:
            counts.update(await self._check_watches())
        except Exception as error:  # noqa: BLE001 — quyết định down ở dưới
            watch_error = error
        try:
            counts.update(await self._scan_merchant())
        except Exception as error:  # noqa: BLE001
            merchant_error = error
        if watch_error is not None and merchant_error is not None:
            raise RuntimeError(
                f"cả 2 scan fail: watches={watch_error}, merchant={merchant_error}"
            ) from watch_error
        # Retention sweep — không bao giờ làm fail vòng quét.
        try:
            cleanup_expired(
                sessions_dir=self._sessions_dir,
                watch_store=self._watches,
                ticket_store=self._tickets,
                alert_feed=self._alerts,
                retention_days=self._settings.retention_days,
                task_store=self._task_store,
            )
            if self._activity_log is not None and self._settings.retention_days > 0:
                self._activity_log.trim_before(
                    time.time() - self._settings.retention_days * 86400
                )
        except Exception:
            logger.exception("retention sweep lỗi (bỏ qua)")
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
                actor="agent/merchant",
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
        Lỗi kết nối (login/stats) raise lên để vòng cha backoff; lỗi
        phân tích chỉ log một vòng bỏ qua.
        """
        from merchant_agent import MerchantSessionContext

        from aurel_agents.merchant.backend import AurelMerchant

        client = await self._admin_client()  # login fail → raise (backoff)
        published = 0
        open_tickets = len(self._tickets.open_tickets())
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
            if await self._should_publish(alert.kind, alert.title, alert.detail):
                if self._publish_once(
                    alert.kind, alert.title, alert.detail, alert.data
                ):
                    published += 1
        # Ticket quá SLA → alert (lặp được, _publish_once khử trùng).
        for alert in check_ticket_sla(
            self._tickets.open_tickets(), sla_hours=self._settings.ticket_sla_hours
        ):
            if self._publish_once(
                alert.kind, alert.title, alert.detail, alert.data
            ):
                published += 1
        return {"merchant": published, "open_tickets": open_tickets}


