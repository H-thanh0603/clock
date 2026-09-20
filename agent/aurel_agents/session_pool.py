# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Prod-hardening cho agent host: session persistence, per-session shopper,
ledger persistence, rate limiting.

- ``TranscriptStore``: transcript chat lưu file ``data/sessions/{id}.json``
  (cap 200 message), sống qua restart host.
- ``PooledStorefront``: ``StorefrontBackend`` delegate theo
  ``session.session_id`` — mỗi chat session có 1 tài khoản shopper riêng
  (``shop+<8 ký tự>@...``, tự register) nên giỏ hàng không còn dùng chung.
  Merchant giữ 1 admin client chung (backoffice là view chung, audit theo
  operator id từng session).
- ``load_ledger``/``save_ledger``: persist ``ChangeLedger`` (pending +
  audit trail) ra ``data/ledger-merchant.json``.
- ``RateLimiter``: sliding-window theo IP cho endpoint chat.
"""

from __future__ import annotations

import json
import re
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Any

from aurel_agents.activity import ActivityLog

_SESSION_OK = re.compile(r"[^A-Za-z0-9_-]")

MAX_TRANSCRIPT_MESSAGES = 200


def sanitize_session_id(raw: str) -> str:
    cleaned = _SESSION_OK.sub("", raw or "")[:64]
    return cleaned or "default"


class TranscriptStore:
    """Transcript per-session lưu file JSON."""

    def __init__(self, sessions_dir: Path) -> None:
        self._dir = sessions_dir
        self._dir.mkdir(parents=True, exist_ok=True)
        self._cache: dict[str, list[dict[str, Any]]] = {}

    def load(self, session_id: str) -> list[dict[str, Any]]:
        sid = sanitize_session_id(session_id)
        if sid in self._cache:
            return self._cache[sid]
        path = self._dir / f"{sid}.json"
        transcript: list[dict[str, Any]] = []
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, list):
                    transcript = [m for m in data if isinstance(m, dict)]
            except Exception:
                transcript = []
        self._cache[sid] = transcript
        return transcript

    def save(self, session_id: str) -> None:
        sid = sanitize_session_id(session_id)
        transcript = self._cache.get(sid, [])[-MAX_TRANSCRIPT_MESSAGES:]
        self._cache[sid] = transcript
        try:
            (self._dir / f"{sid}.json").write_text(
                json.dumps(transcript, ensure_ascii=False, default=str),
                encoding="utf-8",
            )
        except Exception:
            pass

    def delete(self, session_id: str) -> bool:
        """Xóa transcript 1 session (quyền xóa dữ liệu — privacy).

        Trả True nếu có gì để xóa (file hoặc cache). Không bao giờ raise.
        """
        sid = sanitize_session_id(session_id)
        removed = self._cache.pop(sid, None) is not None
        try:
            path = self._dir / f"{sid}.json"
            if path.exists():
                path.unlink()
                removed = True
        except Exception:
            pass
        return removed


class PooledStorefront:
    """StorefrontBackend isolate giỏ theo chat session.

    Mỗi ``session.session_id`` map tới 1 ``AurelStorefront`` + ``ClockClient``
    riêng (email suy ra ``shop+<prefix>@domain``, tự register lần đầu).

    Delegation (agentic web — "act on behalf of"): khi request chat mang
    delegation token, backend dùng shopper LÀ CHÍNH user đó (giỏ/đơn/wishlist
    thật), không phải shopper rác. Token TTL 30 phút nên delegated client
    không cache dài hạn — giữ tối đa DELEGATED_TTL_S rồi drop.

    Evict in-memory sau 12h không dùng (client httpx giữ connection + RAM);
    session cũ quay lại thì register lại shopper đã có (email prefix giữ
    nguyên) — không mất gì vì giỏ BE lưu theo user, không phải theo pool.
    """

    IDLE_EVICT_S = 12 * 3600
    DELEGATED_TTL_S = 30 * 60  # token delegation BE cấp TTL 30 phút

    def __init__(self, settings) -> None:
        self._settings = settings
        self._backends: dict[str, Any] = {}
        self._clients: dict[str, Any] = {}
        self._locks: dict[str, Any] = {}
        self._last_used: dict[str, float] = {}
        # Delegated: session_id → (client, backend, created_at). Không vào
        # _backends (vòng đời ngắn theo token, không theo session).
        self._delegated: dict[str, tuple[Any, Any, float]] = {}
        # AI Activity Log (host wire vào; None = không log).
        self._activity: ActivityLog | None = None
        # Token delegation mới nhất mỗi session — FE gửi kèm mỗi request
        # chat; _backend_for đọc binding này (giỏ thật của user thay vì
        # shopper rác).
        self._delegation_tokens: dict[str, str] = {}

    def bind_delegation(self, session_id: str, token: str) -> None:
        """Gắn delegation token cho session (mỗi turn chat cập nhật)."""
        sid = sanitize_session_id(session_id)
        if token:
            self._delegation_tokens[sid] = token
        else:
            self._delegation_tokens.pop(sid, None)
            entry = self._delegated.pop(sid, None)
            if entry is not None:
                # fire-and-forget close — caller không await được từ sync
                import asyncio

                try:
                    asyncio.get_running_loop().create_task(entry[0].aclose())
                except RuntimeError:
                    pass

    async def delegated_backend(self, session_id: str, token: str):
        """AurelStorefront chạy trên behalf-of user (delegation token).

        Client theo session nhưng tái tạo khi token đổi (FE xin token mới
        sau 30 phút) hoặc qua TTL. Đồng bộ caller: 1 session 1 delegated
        client tại một thời điểm.
        """
        import asyncio

        sid = sanitize_session_id(session_id)
        existing = self._delegated.get(sid)
        if existing is not None:
            client, backend, created = existing
            if (
                time.monotonic() - created < self.DELEGATED_TTL_S
                and client.delegation_token == token
            ):
                return backend
        lock = self._locks.setdefault(f"delegated:{sid}", asyncio.Lock())
        async with lock:
            existing = self._delegated.get(sid)
            if existing is not None and existing[0].delegation_token == token:
                return existing[1]
            # Token mới/TTL quá → drop client cũ, tạo mới
            if existing is not None:
                try:
                    await existing[0].aclose()
                except Exception:
                    pass
            from aurel_agents.clock_client import ClockClient
            from aurel_agents.shopping.backend import AurelStorefront

            client = ClockClient(
                self._settings.backend_url,
                "delegated",  # email chỉ để log — không dùng login
                "",
                register_if_new=False,
                delegation_token=token,
                actor="agent/shopping",
            )
            await client.ensure_session()
            backend = AurelStorefront(client)
            self._delegated[sid] = (client, backend, time.monotonic())
            return backend

    def _email_for(self, session_id: str) -> str:
        base = self._settings.shopper_email
        local, _, domain = base.partition("@")
        prefix = sanitize_session_id(session_id)[:8] or "default"
        return f"{local}+{prefix}@{domain}" if domain else f"{local}+{prefix}"

    async def _evict_idle(self) -> None:
        """Evict session không dùng quá IDLE_EVICT_S (giải phóng RAM + socket)."""
        now = time.monotonic()
        stale = []
        for sid, ts in self._last_used.items():
            if now - ts <= self.IDLE_EVICT_S:
                continue
            lock = self._locks.get(sid)
            if lock is not None and lock.locked():
                continue  # đang tạo backend — chờ vòng sau
            stale.append(sid)
        for sid in stale:
            self._last_used.pop(sid, None)
            self._locks.pop(sid, None)
            self._backends.pop(sid, None)
            client = self._clients.pop(sid, None)
            if client is not None:
                try:
                    await client.aclose()
                except Exception:
                    pass

    async def _backend_for(self, session_id: str):
        from aurel_agents.clock_client import ClockClient
        from aurel_agents.shopping.backend import AurelStorefront

        sid = sanitize_session_id(session_id)
        if len(self._backends) > 16:
            await self._evict_idle()
        self._last_used[sid] = time.monotonic()
        # Delegated binding (agentic web): request chat gắn token →
        # backend là chính user (giỏ/đơn/wishlist thật), bỏ qua shopper rác.
        token = self._delegation_tokens.get(sid)
        if token:
            return await self.delegated_backend(sid, token)
        backend = self._backends.get(sid)
        if backend is not None:
            return backend
        import asyncio

        lock = self._locks.get(sid)
        if lock is None:
            lock = asyncio.Lock()
            self._locks[sid] = lock
        async with lock:
            backend = self._backends.get(sid)
            if backend is not None:
                return backend
            client = ClockClient(
                self._settings.backend_url,
                self._email_for(sid),
                self._settings.shopper_password,
                register_if_new=True,
            )
            await client.ensure_session()
            backend = AurelStorefront(client)
            self._clients[sid] = client
            self._backends[sid] = backend
            return backend

    async def aclose(self) -> None:
        for client in self._clients.values():
            try:
                await client.aclose()
            except Exception:
                pass
        self._clients.clear()
        self._backends.clear()
        for entry in self._delegated.values():
            try:
                await entry[0].aclose()
            except Exception:
                pass
        self._delegated.clear()

    async def _logged(self, tool: str, session, call, detail: str | None = None):
        """Chạy 1 tool qua backend của session + ghi activity (nếu wire log).

        Không bao giờ làm hỏng turn: log fail thì bỏ qua, backend lỗi thì
        raise nguyên (ghi fail trước khi raise).
        """
        sid = str(getattr(session, "session_id", "?"))
        actor = str(getattr(session, "user_id", "?"))
        t0 = time.monotonic()
        ok, err, res = True, None, None
        try:
            res = await call(await self._backend_for(sid))
            return res
        except Exception as e:
            ok, err = False, f"{type(e).__name__}: {str(e)[:200]}"
            raise
        finally:
            if self._activity is not None:
                self._activity.record(
                    role="shop",
                    session_id=sid,
                    actor=actor,
                    tool=tool,
                    ok=ok,
                    ms=int((time.monotonic() - t0) * 1000),
                    detail=detail,
                    error=err,
                )

    # -- StorefrontBackend delegate (mỗi method lấy backend theo session) --
    async def search_products(self, session, query, filters=None, limit=8):
        return await self._logged(
            "search_products", session,
            lambda b: b.search_products(session, query, filters, limit),
        )

    async def get_product_details(self, session, product_id):
        return await self._logged(
            "get_product_details", session,
            lambda b: b.get_product_details(session, product_id), detail=str(product_id),
        )

    async def get_cart(self, session):
        return await self._logged(
            "get_cart", session,
            lambda b: b.get_cart(session),
        )

    async def add_to_cart(self, session, product_id, quantity):
        return await self._logged(
            "add_to_cart", session,
            lambda b: b.add_to_cart(session, product_id, quantity), detail=str(product_id),
        )

    async def update_cart_item(self, session, product_id, quantity):
        return await self._logged(
            "update_cart_item", session,
            lambda b: b.update_cart_item(session, product_id, quantity), detail=str(product_id),
        )

    async def remove_from_cart(self, session, product_id):
        return await self._logged(
            "remove_from_cart", session,
            lambda b: b.remove_from_cart(session, product_id), detail=str(product_id),
        )

    async def get_preferences(self, session):
        return await self._logged(
            "get_preferences", session,
            lambda b: b.get_preferences(session),
        )

    async def checkout_handoff(self, session, cart):
        return await self._logged(
            "checkout_handoff", session,
            lambda b: b.checkout_handoff(session, cart),
        )

    async def get_account_context(self, session):
        return await self._logged(
            "get_account_context", session,
            lambda b: b.get_account_context(session),
        )

    async def get_disclosure(self, session, product_id):
        return await self._logged(
            "get_disclosure", session,
            lambda b: b.get_disclosure(session, product_id), detail=str(product_id),
        )

    async def get_orders(self, session, limit=5):
        return await self._logged(
            "get_orders", session,
            lambda b: b.get_orders(session, limit),
        )

    async def get_order(self, session, order_id):
        return await self._logged(
            "get_order", session,
            lambda b: b.get_order(session, order_id), detail=str(order_id),
        )

    async def search_policies(self, session, query):
        return await self._logged(
            "search_policies", session,
            lambda b: b.search_policies(session, query),
        )

    async def get_fulfillment_options(self, session, product_ids):
        return await self._logged(
            "get_fulfillment_options", session,
            lambda b: b.get_fulfillment_options(session, product_ids),
        )


def save_ledger(ledger, path: Path) -> None:
    """Persist ledger (changes + sequence) ra JSON. Không bao giờ raise."""
    try:
        payload = {
            "sequence": getattr(ledger, "_sequence", 0),
            "changes": [
                c.model_dump(mode="json") for c in getattr(ledger, "_changes", {}).values()
            ],
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def load_ledger(ledger, path: Path) -> int:
    """Nạp ledger từ JSON. Trả về số change khôi phục được."""
    try:
        if not path.exists():
            return 0
        payload = json.loads(path.read_text(encoding="utf-8"))
        changes = payload.get("changes", [])
        from merchant_agent import StagedChange

        restored = 0
        for raw in changes:
            try:
                change = StagedChange.model_validate(raw)
            except Exception:
                continue
            ledger._changes[change.change_id] = change
            restored += 1
        seq = int(payload.get("sequence", 0) or 0)
        ledger._sequence = max(seq, len(ledger._changes))
        # Đồng bộ sequence với id lớn nhất (chg-NNNN) để không trùng id.
        for cid in ledger._changes:
            try:
                num = int(str(cid).split("-")[-1])
                ledger._sequence = max(ledger._sequence, num)
            except Exception:
                pass
        return restored
    except Exception:
        return 0


class RateLimiter:
    """Sliding-window rate limiter theo key (IP)."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, key: str, per_min: int) -> bool:
        if per_min <= 0:
            return True
        now = time.monotonic()
        window = self._hits[key]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= per_min:
            return False
        window.append(now)
        return True


__all__ = [
    "MAX_TRANSCRIPT_MESSAGES",
    "PooledStorefront",
    "RateLimiter",
    "TranscriptStore",
    "load_ledger",
    "sanitize_session_id",
    "save_ledger",
]
