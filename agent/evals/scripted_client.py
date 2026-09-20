# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Model giả (scripted) — thay ``AsyncAnthropic`` cho eval offline, 0 token.

Orchestrator gọi::

    async with agent.client.messages.stream(**request) as stream:
        async for event in ...
        final = await stream.get_final_message()

nên fake cần đúng 3 thứ: ``messages.stream(...)`` trả async context manager,
stream async-iterable, và ``get_final_message()`` trả 1 Anthropic Message.

Script mỗi round = 1 trong:
  - ``{"text": "..."}``            → assistant chỉ nói, hết turn
  - ``{"tool": ("name", {...})}``  → assistant gọi tool, orchestrator chạy tiếp
  - list nhiều tool cũng được: ``{"tools": [("a",{}), ("b",{})]}``
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ScriptedRound:
    text: str = ""
    tools: list[tuple[str, dict[str, Any]]] = field(default_factory=list)


def _block_text(text: str) -> Any:
    from anthropic.types import TextBlock

    return TextBlock(type="text", text=text)


def _block_tool(idx: int, name: str, args: dict[str, Any]) -> Any:
    from anthropic.types import ToolUseBlock

    return ToolUseBlock(type="tool_use", id=f"toolu_fake_{idx}", name=name, input=args)


class _FakeStream:
    """Async context manager + async iterator quanh 1 round."""

    def __init__(self, round_: ScriptedRound, index: int) -> None:
        self._round = round_
        self._index = index

    async def __aenter__(self) -> _FakeStream:
        return self

    async def __aexit__(self, *exc: Any) -> None:
        return None

    def __aiter__(self) -> Any:
        return self._events()

    async def _events(self) -> Any:
        # Orchestrator chỉ cần stream relay chạy; không cần event thật phức tạp.
        from anthropic.types import RawContentBlockDeltaEvent, TextDelta

        if self._round.text:
            yield RawContentBlockDeltaEvent(
                type="content_block_delta",
                index=0,
                delta=TextDelta(type="text_delta", text=self._round.text),
            )

    async def get_final_message(self) -> Any:
        from anthropic.types import Message, Usage

        blocks: list[Any] = []
        if self._round.text:
            blocks.append(_block_text(self._round.text))
        for i, (name, args) in enumerate(self._round.tools):
            blocks.append(_block_tool(self._index * 100 + i, name, args))
        return Message(
            id=f"msg_fake_{self._index}",
            type="message",
            role="assistant",
            model="scripted-fake",
            content=blocks,
            stop_reason="tool_use" if self._round.tools else "end_turn",
            stop_sequence=None,
            usage=Usage(input_tokens=1, output_tokens=1),
        )


class _FakeMessages:
    def __init__(self, rounds: list[ScriptedRound], log: list[dict[str, Any]]) -> None:
        self._rounds = rounds
        self._log = log
        self._i = 0

    def stream(self, **request: Any) -> _FakeStream:
        self._log.append(request)
        idx = self._i
        self._i += 1
        # Hết script → trả round rỗng (assistant im lặng, turn kết thúc) thay
        # vì crash: model thật cũng có thể chỉ trả text rỗng.
        rnd = self._rounds[idx] if idx < len(self._rounds) else ScriptedRound()
        return _FakeStream(rnd, idx)


class ScriptedClient:
    """Thay ``AsyncAnthropic``: model phát đúng script, ghi lại request."""

    def __init__(self, rounds: list[ScriptedRound | dict[str, Any]]) -> None:
        self.rounds = [
            r if isinstance(r, ScriptedRound) else _round_from_dict(r) for r in rounds
        ]
        self.requests: list[dict[str, Any]] = []
        self.messages = _FakeMessages(self.rounds, self.requests)

    @property
    def calls(self) -> int:
        return len(self.requests)

    def sent_text(self) -> str:
        """Ghép mọi text block đã gửi — để assert nội dung."""
        out: list[str] = []
        for req in self.requests:
            for msg in req.get("messages", []):
                content = msg.get("content")
                if isinstance(content, str):
                    out.append(content)
                elif isinstance(content, list):
                    for b in content:
                        if isinstance(b, dict) and b.get("type") == "text":
                            out.append(str(b.get("text", "")))
        return "\n".join(out)


def _round_from_dict(spec: dict[str, Any]) -> ScriptedRound:
    tools: list[tuple[str, dict[str, Any]]] = []
    if "tool" in spec:
        tools.append(tuple(spec["tool"]))  # type: ignore[arg-type]
    if "tools" in spec:
        tools.extend(tuple(t) for t in spec["tools"])  # type: ignore[misc, arg-type]
    return ScriptedRound(text=spec.get("text", ""), tools=tools)
