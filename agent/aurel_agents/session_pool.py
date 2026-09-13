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


class PooledStorefront:
    """StorefrontBackend isolate giỏ theo chat session.

    Mỗi ``session.session_id`` map tới 1 ``AurelStorefront`` + ``ClockClient``
    riêng (email suy ra ``shop+<prefix>@domain``, tự register lần đầu).

    Evict in-memory sau 12h không dùng (client httpx giữ connection + RAM);
    session cũ quay lại thì register lại shopper đã có (email prefix giữ
    nguyên) — không mất gì vì giỏ BE lưu theo user, không phải theo pool.
    """

    IDLE_EVICT_S = 12 * 3600

    def __init__(self, settings) -> None:
        self._settings = settings
        self._backends: dict[str, Any] = {}
        self._clients: dict[str, Any] = {}
        self._locks: dict[str, Any] = {}
        self._last_used: dict[str, float] = {}

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

    # -- StorefrontBackend delegate (mỗi method lấy backend theo session) --
    async def search_products(self, session, query, filters=None, limit=8):
        return await (await self._backend_for(session.session_id)).search_products(
            session, query, filters, limit
        )

    async def get_product_details(self, session, product_id):
        return await (await self._backend_for(session.session_id)).get_product_details(
            session, product_id
        )

    async def get_cart(self, session):
        return await (await self._backend_for(session.session_id)).get_cart(session)

    async def add_to_cart(self, session, product_id, quantity):
        return await (await self._backend_for(session.session_id)).add_to_cart(
            session, product_id, quantity
        )

    async def update_cart_item(self, session, product_id, quantity):
        return await (await self._backend_for(session.session_id)).update_cart_item(
            session, product_id, quantity
        )

    async def remove_from_cart(self, session, product_id):
        return await (await self._backend_for(session.session_id)).remove_from_cart(
            session, product_id
        )

    async def get_preferences(self, session):
        return await (await self._backend_for(session.session_id)).get_preferences(session)

    async def checkout_handoff(self, session, cart):
        return await (await self._backend_for(session.session_id)).checkout_handoff(session, cart)

    async def get_account_context(self, session):
        return await (await self._backend_for(session.session_id)).get_account_context(session)

    async def get_disclosure(self, session, product_id):
        return await (await self._backend_for(session.session_id)).get_disclosure(
            session, product_id
        )

    async def get_orders(self, session, limit=5):
        return await (await self._backend_for(session.session_id)).get_orders(session, limit)

    async def get_order(self, session, order_id):
        return await (await self._backend_for(session.session_id)).get_order(session, order_id)

    async def search_policies(self, session, query):
        return await (await self._backend_for(session.session_id)).search_policies(session, query)

    async def get_fulfillment_options(self, session, product_ids):
        return await (await self._backend_for(session.session_id)).get_fulfillment_options(
            session, product_ids
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
