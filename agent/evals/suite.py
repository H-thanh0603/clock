# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Suite eval: các case hành vi + rubric chấm điểm.

Mỗi case:
  - ``setup``: mock BE (respx) trả dữ liệu cần thiết
  - ``script``: các round model giả phát ra (tool_use / text)
  - ``checks``: kỳ vọng về event/tool/state + trọng số

Điểm = tổng weight check pass / tổng weight. Đây là con số so sánh giữa các
lần chạy (đổi prompt/model/tool schema → điểm tụt = hồi quy).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Check:
    """1 kỳ vọng có trọng số. ``fn`` nhận ``Trace`` và trả bool/str lỗi."""

    name: str
    fn: Callable[[Trace], bool | str]
    weight: float = 1.0


@dataclass
class Case:
    name: str
    description: str = ""
    # Danh sách round model giả (dict theo scripted_client._round_from_dict).
    script: list[dict[str, Any]] = field(default_factory=list)
    checks: list[Check] = field(default_factory=list)
    # Mock BE: list (method, path, json_body).
    mocks: list[tuple[str, str, Any]] = field(default_factory=list)
    message: str = "xin chào"
    # Cho case merchant (khác storefront).
    domain: str = "shopping"


@dataclass
class Trace:
    """Mọi thứ quan sát được của 1 lần chạy case — đầu vào cho Check."""

    events: list[str] = field(default_factory=list)
    tool_calls: list[str] = field(default_factory=list)
    tool_results: list[dict[str, Any]] = field(default_factory=list)
    text: str = ""
    state: Any = None
    error: str | None = None
    model_calls: int = 0
    # Text model ĐÃ NHẬN (system+history) — dùng check fencing/no-leak.
    sent: str = ""

    def used(self, tool: str) -> bool:
        return tool in self.tool_calls

    def used_before(self, a: str, b: str) -> bool:
        try:
            return self.tool_calls.index(a) < self.tool_calls.index(b)
        except ValueError:
            return False

    def result_ok(self, tool: str) -> bool:
        for r in self.tool_results:
            if r.get("name") == tool:
                return bool(r.get("ok", True))
        return False


@dataclass
class CaseResult:
    name: str
    passed: int = 0
    total: int = 0
    weight_pass: float = 0.0
    weight_total: float = 0.0
    failures: list[str] = field(default_factory=list)
    error: str | None = None

    @property
    def score(self) -> float:
        return self.weight_pass / self.weight_total if self.weight_total else 0.0

    @property
    def ok(self) -> bool:
        return self.error is None and self.passed == self.total


@dataclass
class Result:
    cases: list[CaseResult] = field(default_factory=list)

    @property
    def score(self) -> float:
        w = sum(c.weight_total for c in self.cases)
        p = sum(c.weight_pass for c in self.cases)
        return p / w if w else 0.0

    @property
    def passed(self) -> int:
        return sum(1 for c in self.cases if c.ok)

    @property
    def total(self) -> int:
        return len(self.cases)


# ── Check dựng sẵn, dùng lại nhiều case ───────────────────────────────────


def used_tool(tool: str, weight: float = 1.0) -> Check:
    return Check(
        f"gọi tool {tool}",
        lambda t: t.used(tool) or f"không gọi {tool} (đã gọi: {t.tool_calls})",
        weight,
    )


def not_used_tool(tool: str, weight: float = 1.0) -> Check:
    return Check(
        f"KHÔNG gọi {tool}",
        lambda t: (not t.used(tool)) or f"đã gọi {tool} (không được phép)",
        weight,
    )


def tool_before(a: str, b: str, weight: float = 1.0) -> Check:
    return Check(
        f"{a} trước {b}",
        lambda t: t.used_before(a, b)
        or f"thứ tự sai: {t.tool_calls} (cần {a} trước {b})",
        weight,
    )


def tool_ok(tool: str, weight: float = 1.0) -> Check:
    return Check(
        f"{tool} chạy thành công",
        lambda t: t.result_ok(tool) or f"{tool} không có tool_result ok",
        weight,
    )


def has_event(name: str, weight: float = 1.0) -> Check:
    return Check(
        f"có event {name}",
        lambda t: name in t.events or f"thiếu event {name} ({t.events})",
        weight,
    )


def no_error(weight: float = 2.0) -> Check:
    return Check("turn không crash", lambda t: t.error is None or f"lỗi: {t.error}", weight)


def text_contains(*needles: str, weight: float = 1.0) -> Check:
    def _check(t: Trace) -> bool | str:
        low = t.text.lower()
        missing = [n for n in needles if n.lower() not in low]
        return (not missing) or f"text thiếu {missing}"

    return Check(f"text chứa {needles}", _check, weight)


def max_model_calls(n: int, weight: float = 1.0) -> Check:
    return Check(
        f"≤ {n} model call",
        lambda t: t.model_calls <= n or f"tốn {t.model_calls} call (trần {n})",
        weight,
    )


def sent_not_contains(*needles: str, weight: float = 2.0) -> Check:
    """Không rò rỉ nội dung ra model (vd secret/PII trong prompt)."""
    names = tuple(needles)

    def _check(t: Trace) -> bool | str:
        low = t.sent.lower()
        leaked = [n for n in names if n.lower() in low]
        return (not leaked) or f"rò rỉ vào model: {leaked}"

    return Check(f"không gửi {names} cho model", _check, weight)
