# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Test fallback model client (A2): gateway 429/5xx → 1 lần retry model dự phòng."""

from __future__ import annotations

import pytest

from aurel_agents.fallback_client import FallbackModelClient


def _patch_retryable(monkeypatch):
    """Dùng exception giả thay vì exception thật của SDK (đơn giản, không cần Response)."""
    monkeypatch.setattr("aurel_agents.fallback_client._RETRYABLE", (RetryableError,))


class FakeStream:
    def __init__(self, body):
        self._body = body
        self.exited = False

    async def __aenter__(self):
        return self._body

    async def __aexit__(self, *a):
        self.exited = True
        return None


class RetryableError(Exception):
    pass


class FatalError(Exception):
    pass


class FakeMessages:
    """messages.stream raise theo kịch bản; ghi lại model mỗi lần gọi."""

    def __init__(self, script):
        self.script = list(script)  # mỗi lần gọi stream pop phần tử đầu
        self.calls: list[str] = []

    def stream(self, **request):
        self.calls.append(request.get("model"))
        action = self.script.pop(0)
        if isinstance(action, Exception):
            raise action
        return action  # một FakeStream

    def create(self, **request):  # orchestrator có thể gọi non-stream
        return {"ok": True}


class FakeAnthropic:
    def __init__(self, messages):
        self.messages = messages


@pytest.mark.asyncio
async def test_fallback_retries_once_on_rate_limit(monkeypatch):
    _patch_retryable(monkeypatch)
    inner = FakeAnthropic(FakeMessages([RetryableError(), FakeStream({"ok": 1})]))
    client = FallbackModelClient(inner, "fallback-model")
    async with client.messages.stream(model="main-model", messages=[]) as stream:
        assert stream == {"ok": 1}
    assert inner.messages.calls == ["main-model", "fallback-model"]


@pytest.mark.asyncio
async def test_fallback_not_triggered_on_fatal_error():
    inner = FakeAnthropic(FakeMessages([FatalError()]))
    client = FallbackModelClient(inner, "fallback-model")
    with pytest.raises(FatalError):
        async with client.messages.stream(model="main-model", messages=[]):
            pass
    assert inner.messages.calls == ["main-model"]  # không phí call vào fallback


@pytest.mark.asyncio
async def test_fallback_raises_when_fallback_also_fails(monkeypatch):
    _patch_retryable(monkeypatch)
    inner = FakeAnthropic(FakeMessages([RetryableError(), RetryableError()]))
    client = FallbackModelClient(inner, "fallback-model")
    with pytest.raises(RetryableError):
        async with client.messages.stream(model="main-model", messages=[]):
            pass
    assert inner.messages.calls == ["main-model", "fallback-model"]  # đúng 1 lần


@pytest.mark.asyncio
async def test_no_fallback_when_disabled_or_same_model(monkeypatch):
    _patch_retryable(monkeypatch)
    # fallback rỗng → raise luôn
    inner = FakeAnthropic(FakeMessages([RetryableError()]))
    client = FallbackModelClient(inner, "")
    with pytest.raises(RetryableError):
        async with client.messages.stream(model="main-model", messages=[]):
            pass
    # request đã dùng fallback model → không retry nữa
    inner2 = FakeAnthropic(FakeMessages([RetryableError()]))
    client2 = FallbackModelClient(inner2, "main-model")
    with pytest.raises(RetryableError):
        async with client2.messages.stream(model="main-model", messages=[]):
            pass
    assert inner2.messages.calls == ["main-model"]


@pytest.mark.asyncio
async def test_passthrough_when_no_error():
    inner = FakeAnthropic(FakeMessages([FakeStream({"ok": 1})]))
    client = FallbackModelClient(inner, "fallback-model")
    async with client.messages.stream(model="main-model", messages=[]) as stream:
        assert stream == {"ok": 1}
    assert inner.messages.calls == ["main-model"]


def test_non_stream_methods_forward():
    inner = FakeAnthropic(FakeMessages([]))
    client = FallbackModelClient(inner, "fallback-model")
    assert client.messages.create(model="x") == {"ok": True}