# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Fallback model client (A2): gateway 429/5xx/network lỗi → thử lại 1 lần
với model dự phòng.

Câu hỏi phòng vệ số 10: "model free-tier 429 thì UX thế nào?" — trước đây
turn chết bằng SSE error. Giờ host wrap AsyncAnthropic bằng proxy này:
- lỗi tạm thời (RateLimitError / InternalServerError / APIConnectionError)
  → đổi ``request["model"]`` thành ``AGENT_FALLBACK_MODEL``, thử lại đúng
  1 lần (không vòng lặp, không retry khi model đã là fallback);
- lỗi khác (400/401/404 — sai request/key/model) → raise như cũ, không
  phí một call vào fallback chắc chắn cũng lỗi.

Orchestrator chỉ dùng ``client.messages.stream(...)`` qua async context
manager và nhận stream thật từ ``__aenter__`` — nên proxy chỉ cần implements
2 method đó, mọi attribute khác của stream không bị chạm tới.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger("aurel-agents.fallback")

# Chỉ retry lỗi TẠM THỜI — lỗi logic (400/401/404) fallback cũng không cứu.
_RETRYABLE: tuple[type[Exception], ...]
try:
    import anthropic as _anthropic

    _RETRYABLE = (
        _anthropic.RateLimitError,
        _anthropic.InternalServerError,
        _anthropic.APIConnectionError,
    )
except ImportError:  # pragma: no cover — môi trường không có SDK
    _RETRYABLE = ()


class _FallbackStream:
    """Async CM: vào stream với model chính; lỗi tạm thời → 1 lần fallback."""

    def __init__(
        self, messages: Any, request: dict[str, Any], fallback_model: str
    ) -> None:
        self._messages = messages
        self._request = request
        self._fallback = fallback_model
        self._cm: Any = None

    async def __aenter__(self) -> Any:
        try:
            self._cm = self._messages.stream(**self._request)
            return await self._cm.__aenter__()
        except _RETRYABLE:
            current = str(self._request.get("model", ""))
            if not self._fallback or current == self._fallback:
                raise  # không có dự phòng / đã là dự phòng mà vẫn lỗi
            logger.warning(
                "gateway lỗi tạm thời với model %s — retry 1 lần với fallback %s",
                current,
                self._fallback,
            )
            retry = {**self._request, "model": self._fallback}
            self._cm = self._messages.stream(**retry)
            return await self._cm.__aenter__()

    async def __aexit__(self, *args: Any) -> Any:
        if self._cm is None:
            return None
        return await self._cm.__aexit__(*args)


class _FallbackMessages:
    """Wrap ``client.messages``: chỉ chặn ``stream``, còn lại forwards."""

    def __init__(self, messages: Any, fallback_model: str) -> None:
        self._messages = messages
        self._fallback = fallback_model

    def stream(self, **request: Any) -> _FallbackStream:
        return _FallbackStream(self._messages, request, self._fallback)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._messages, name)


class FallbackModelClient:
    """Proxy AsyncAnthropic — orchestrator/ memory runtime dùng như client."""

    def __init__(self, inner: Any, fallback_model: str) -> None:
        self._inner = inner
        self._messages = _FallbackMessages(inner.messages, fallback_model)

    @property
    def messages(self) -> _FallbackMessages:
        return self._messages

    def __getattr__(self, name: str) -> Any:
        return getattr(self._inner, name)
