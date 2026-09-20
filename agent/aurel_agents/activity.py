# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""AI Activity Log: mỗi tool-call của agent được ghi 1 dòng query được.

Dùng khi khách khiếu nại ("con AI tự thêm món vào giỏ tôi lúc nào?"),
debug hành vi bất thường, và đối soát vận hành. Khác transcript (lưu lời
thoại) và ledger (lưu staged change): đây là log từng ACT (tool, actor,
session, ok/fail, ms).

- ``ActivityLog``: file JSONL append-only (1 JSON/dòng), cùng họ với các
  store JSON single-writer của host (transcript/watch/ledger) — không bao
  giờ raise, cap 20k dòng, retention theo ngày.
- ``log_activity``: decorator cho method backend (AurelMerchant). Shopping
  pool dùng helper tương đương trong session_pool (delegate viết tay).
- PII: KHÔNG ghi args thô (có thể chứa contact/message khách) — chỉ ghi
  ``detail`` do caller chọn (product_id, change_id...).
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from functools import wraps
from pathlib import Path
from typing import Any

logger = logging.getLogger("aurel-agents.activity")

MAX_LINES = 20_000
# Enforce cap mỗi N write (rewrite file) — không check mỗi dòng cho rẻ.
ENFORCE_EVERY = 50


class ActivityLog:
    """Append-only JSONL + đọc lọc + cap + retention. Không bao giờ raise."""

    def __init__(self, path: Path, cap: int = MAX_LINES) -> None:
        self._path = path
        self._cap = cap
        self._writes_since_enforce = 0

    def record(
        self,
        *,
        role: str,
        session_id: str,
        actor: str,
        tool: str,
        ok: bool,
        ms: int,
        detail: str | None = None,
        error: str | None = None,
        trace_id: str | None = None,
    ) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            entry = {
                "ts": time.time(),
                "role": role,
                "session_id": session_id,
                "actor": actor,
                "tool": tool,
                "detail": detail,
                "ok": ok,
                "ms": ms,
                "error": error,
                # Trace xuyên FE → host → BE. None với log cũ / turn không
                # qua host (test/REPL) — đọc lọc vẫn tương thích bản cũ.
                "trace_id": trace_id,
            }
            with open(self._path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")
            self._writes_since_enforce += 1
            if self._writes_since_enforce >= ENFORCE_EVERY:
                self._writes_since_enforce = 0
                self._enforce_cap()
        except Exception:
            logger.debug("activity record thất bại (bỏ qua)", exc_info=True)

    def _read_all(self) -> list[dict[str, Any]]:
        try:
            if not self._path.exists():
                return []
            out = []
            for line in self._path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except Exception:
                    continue
                if isinstance(obj, dict):
                    out.append(obj)
            return out
        except Exception:
            return []

    def _enforce_cap(self) -> None:
        try:
            items = self._read_all()
            if len(items) <= self._cap:
                return
            # Giữ 90% mới nhất.
            keep = items[-(self._cap * 9 // 10) :]
            self._path.write_text(
                "".join(json.dumps(x, ensure_ascii=False, default=str) + "\n" for x in keep),
                encoding="utf-8",
            )
        except Exception:
            pass

    def recent(
        self,
        limit: int = 50,
        *,
        role: str | None = None,
        session_id: str | None = None,
        ok: bool | None = None,
        trace_id: str | None = None,
    ) -> list[dict[str, Any]]:
        items = self._read_all()
        if role is not None:
            items = [x for x in items if x.get("role") == role]
        if session_id is not None:
            items = [x for x in items if x.get("session_id") == session_id]
        if ok is not None:
            items = [x for x in items if bool(x.get("ok")) is ok]
        if trace_id is not None:
            items = [x for x in items if x.get("trace_id") == trace_id]
        return items[-max(1, limit) :][::-1]

    def trim_before(self, cutoff: float) -> int:
        """Xóa dòng cũ hơn cutoff (retention). Trả số dòng xóa."""
        try:
            items = self._read_all()
            kept = [x for x in items if float(x.get("ts", 0) or 0) >= cutoff]
            removed = len(items) - len(kept)
            if removed:
                self._path.write_text(
                    "".join(
                        json.dumps(x, ensure_ascii=False, default=str) + "\n" for x in kept
                    ),
                    encoding="utf-8",
                )
            return removed
        except Exception:
            return 0


def _actor_of(session: Any) -> str:
    return (
        str(getattr(session, "user_id", None) or getattr(session, "operator", None) or "?")[:80]
    )


def _session_of(session: Any) -> str:
    return str(getattr(session, "session_id", "?"))[:64]

def _trace_of(client: Any) -> str | None:
    """Trace id của turn đang chạy (đọc từ client trên backend).

    ``getattr`` an toàn vì decorator cũng chạy với backend test (mock không
    có client) — lúc đó trả None, không crash turn.
    """
    get = getattr(getattr(client, "_client", client), "trace_id", None)
    value = get() if callable(get) else get
    return str(value)[:64] if value else None


def log_activity(
    role: str,
    detail: str | Callable[[Any, tuple, dict], str | None] | None = None,
):
    """Decorator method backend ``async (self, session, *args, **kwargs)``.

    Ghi tool = tên method, actor/session từ context. ``detail``: chuỗi tĩnh
    hoặc fn(session, args, kwargs) → id nghiệp vụ (product_id, change_id...).
    Không có ``self._activity`` (None) → chạy thẳng, không log — an toàn cho
    test/REPL không wire log.
    """

    def deco(fn: Callable):
        @wraps(fn)
        async def wrapper(self: Any, session: Any, *args: Any, **kwargs: Any) -> Any:
            log = getattr(self, "_activity", None)
            if log is None:
                return await fn(self, session, *args, **kwargs)
            t0 = time.monotonic()
            ok, err, res = True, None, None
            try:
                res = await fn(self, session, *args, **kwargs)
                return res
            except Exception as e:
                ok, err = False, f"{type(e).__name__}: {str(e)[:200]}"
                raise
            finally:
                try:
                    d = detail(session, args, kwargs) if callable(detail) else detail
                except Exception:
                    d = None
                log.record(
                    role=role,
                    session_id=_session_of(session),
                    actor=_actor_of(session),
                    tool=fn.__name__,
                    ok=ok,
                    ms=int((time.monotonic() - t0) * 1000),
                    detail=d,
                    error=err,
                    trace_id=_trace_of(self),
                )

        return wrapper

    return deco


__all__ = ["ActivityLog", "log_activity"]
