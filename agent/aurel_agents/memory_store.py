# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Memory store an toàn cho multi-worker / multi-process.

``JsonFileMemoryStore`` của upstream (vendor, Apache-2.0) đọc → sửa → ghi file
JSON **không khoá**. Một process thì ổn, nhưng 2 worker uvicorn (hoặc host +
proactive loop cùng ghi) thì read-modify-write đua nhau → mất fact của nhau
(last-writer-wins).

Wrapper ở đây KHÔNG sửa vendor: bọc store gốc, thay mỗi ``_read``/``_write``
bằng bản có ``fcntl.flock`` (POSIX advisory lock, Linux VPS) và ghi atomic
qua file tạm + ``os.replace`` để reader không bao giờ thấy file cụt.

- ``flock`` khoá theo inode của 1 file lock riêng (``<path>.lock``) — không
  khoá chính file dữ liệu vì ``os.replace`` đổi inode.
- Khoá chia sẻ khi đọc, độc quyền khi ghi; giữ khoá trong suốt chu kỳ
  read-modify-write bằng context manager ``transaction()``.
- Trên hệ không có ``fcntl`` (Windows) → no-op, giữ nguyên hành vi cũ.
"""

from __future__ import annotations

import json
import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

try:  # POSIX (Linux VPS, macOS). Windows: không có flock → chạy đơn process.
    import fcntl
except ImportError:  # pragma: no cover - chỉ chạy trên Windows
    fcntl = None  # type: ignore[assignment]


class LockedJsonFileMemoryStore:
    """``JsonFileMemoryStore`` + file lock + ghi atomic.

    Giữ đúng protocol ``MemoryStore`` (get/upsert/search/delete/clear/
    purge_generation) nên cắm vào ``MemoryRuntime.build`` không cần đổi gì.
    """

    def __init__(self, path: Path | str, *, lock_timeout_s: float = 5.0) -> None:
        self._path = Path(path)
        self._lock_path = self._path.with_name(self._path.name + ".lock")
        self._lock_timeout_s = max(0.1, lock_timeout_s)

    # -- khoá ------------------------------------------------------------------

    @contextmanager
    def _lock(self, *, exclusive: bool) -> Iterator[None]:
        """flock file lock riêng; giữ trong suốt block."""
        if fcntl is None:  # pragma: no cover - Windows
            yield
            return
        self._lock_path.parent.mkdir(parents=True, exist_ok=True)
        # 0o600: file lock cạnh dữ liệu cá nhân, không cần world-readable.
        fd = os.open(self._lock_path, os.O_RDWR | os.O_CREAT, 0o600)
        try:
            mode = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
            self._acquire(fd, mode)
            yield
        finally:
            try:
                fcntl.flock(fd, fcntl.LOCK_UN)
            finally:
                os.close(fd)

    def _acquire(self, fd: int, mode: int) -> None:
        """flock có timeout để worker kẹt không treo cả request."""
        deadline = _monotonic() + self._lock_timeout_s
        while True:
            try:
                fcntl.flock(fd, mode | fcntl.LOCK_NB)
                return
            except OSError:
                if _monotonic() >= deadline:
                    raise TimeoutError(
                        f"memory store lock quá {self._lock_timeout_s}s: {self._lock_path}"
                    ) from None
                _sleep(0.02)

    # -- đọc/ghi ---------------------------------------------------------------

    def _read(self) -> tuple[dict[str, Any], dict[str, int]]:
        """Giống upstream nhưng chịu được file cụt/đang ghi dở."""
        if not self._path.exists():
            return {}, {}
        raw = self._path.read_text(encoding="utf-8") or "{}"
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            # Ghi atomic nên hiếm khi xảy ra; nếu có (file cũ hỏng) → coi như rỗng
            # thay vì crash cả turn chat.
            return {}, {}
        if not isinstance(data, dict):
            return {}, {}
        return dict(data.get("facts") or {}), dict(data.get("purges") or {})

    def _write(self, facts: dict[str, Any], purges: dict[str, int]) -> None:
        """Ghi atomic: file tạm cùng thư mục → fsync → os.replace."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {"version": 2, "facts": facts, "purges": purges}
        content = json.dumps(payload, indent=2, default=str).encode("utf-8")
        tmp = self._path.with_name(f"{self._path.name}.{os.getpid()}.tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, content)
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(tmp, self._path)
        # fsync thư mục để rename bền qua crash (best-effort).
        try:
            dir_fd = os.open(self._path.parent, os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
        except OSError:  # pragma: no cover - không phải mọi FS hỗ trợ
            pass

    # -- MemoryStore protocol -------------------------------------------------

    async def get_facts(self, subject_id: str) -> list[Any]:
        from commerce_common.types import MemoryFact

        with self._lock(exclusive=False):
            facts, _ = self._read()
        return [MemoryFact.model_validate(raw) for raw in facts.get(subject_id, {}).values()]

    async def search_facts(self, subject_id: str, query: str) -> list[Any]:
        from commerce_common.memory import match_facts

        return match_facts(await self.get_facts(subject_id), query)

    async def upsert_facts(self, subject_id: str, facts: list[Any]) -> None:
        with self._lock(exclusive=True):
            stored, purges = self._read()
            bucket = stored.setdefault(subject_id, {})
            for fact in facts:
                bucket[fact.key] = fact.model_dump(mode="json")
            self._write(stored, purges)

    async def delete_fact(self, subject_id: str, key: str) -> bool:
        with self._lock(exclusive=True):
            stored, purges = self._read()
            bucket = stored.get(subject_id, {})
            if key not in bucket:
                return False
            bucket.pop(key)
            self._write(stored, purges)
            return True

    async def clear(self, subject_id: str) -> None:
        with self._lock(exclusive=True):
            stored, purges = self._read()
            stored.pop(subject_id, None)
            purges[subject_id] = purges.get(subject_id, 0) + 1
            self._write(stored, purges)

    async def purge_generation(self, subject_id: str) -> int:
        with self._lock(exclusive=False):
            _, purges = self._read()
        return purges.get(subject_id, 0)


# Tách ra để test monkeypatch được, tránh import time.
def _monotonic() -> float:
    import time

    return time.monotonic()


def _sleep(seconds: float) -> None:
    import time

    time.sleep(seconds)
