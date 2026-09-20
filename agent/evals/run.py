# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Chạy suite eval qua orchestrator thật + model giả (offline).

    python -m evals.run                 # tất cả case, in bảng
    python -m evals.run --json out.json # xuất máy đọc (CI so baseline)
    python -m evals.run -k order        # chỉ case có 'order' trong tên
    python -m evals.run --live          # dùng LLM THẬT (tốn token, cần key)

Exit code: 0 nếu mọi case pass, 1 nếu có case fail (dùng làm gate CI).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from typing import Any

from .scripted_client import ScriptedClient
from .suite import Case, CaseResult, Result, Trace

BASE = "http://backend.test"


# ── Dựng agent + mock BE ─────────────────────────────────────────────────


def _install_mocks(respx_mock: Any, mocks: list[tuple[str, str, Any]]) -> None:

    # Auth + prefetch luôn cần, tránh turn fail vì thiếu route.
    respx_mock.post(f"{BASE}/auth/login").respond(
        json={"user": {"id": "u1", "email": "shopper@test", "name": "Eval Shopper"}}
    )
    respx_mock.get(f"{BASE}/auth/csrf").respond(json={"csrfToken": "t" * 32})
    respx_mock.get(f"{BASE}/cart").respond(json=[])
    respx_mock.get(f"{BASE}/wishlist").respond(json=[])
    respx_mock.get(f"{BASE}/orders").respond(json=[])
    for method, path, body in mocks:
        # `path` có thể chứa query — respx so chuỗi query nguyên văn rất dễ
        # lệch (encoding, thứ tự, limit do tool tự chọn). Dùng regex trên
        # pathname để khớp mọi query, chỉ tách path ra so.
        pure = path.split("?", 1)[0]
        getattr(respx_mock, method.lower())(url__regex=rf"{BASE}{pure}(\?.*)?$").respond(
            json=body
        )


async def _run_case(case: Case, *, live: bool = False) -> CaseResult:
    import respx

    result = CaseResult(name=case.name)
    trace = Trace()

    with respx.mock(assert_all_called=False) as m:
        _install_mocks(m, case.mocks)
        try:
            scripted = None if live else ScriptedClient(case.script)
            if case.domain == "merchant":
                state = await _drive_merchant(case, m, scripted)
            else:
                state = await _drive_shopping(case, m, scripted)
            trace.__dict__.update(state)
        except Exception as error:  # noqa: BLE001 - eval cần bắt mọi lỗi turn
            trace.error = f"{type(error).__name__}: {error}"

    _score(case, trace, result)
    return result


async def _drive_shopping(
    case: Case, respx_mock: Any, scripted: ScriptedClient | None
) -> dict[str, Any]:
    from shopping_agent import (  # type: ignore[import-not-found]
        PageContext,
        ShoppingSessionContext,
        ShoppingSessionState,
    )
    from shopping_agent_runtime import ShoppingAgent  # type: ignore[import-not-found]

    from aurel_agents.clock_client import ClockClient
    from aurel_agents.config import build_anthropic_client, build_shopping_config
    from aurel_agents.shopping.backend import AurelStorefront

    trace = Trace()
    client = ClockClient(BASE, "shopper@test", "pass", actor="agent/shopping")
    try:
        agent = ShoppingAgent(
            client=scripted if scripted is not None else build_anthropic_client(),
            backend=AurelStorefront(client),
            config=build_shopping_config(),
        )
        ctx = ShoppingSessionContext(
            session_id=f"eval-{case.name}",
            user_id=f"shopper:{case.name}"[:32],
            page=PageContext(page_type="other"),
        )
        state = ShoppingSessionState()
        async for event in agent.stream_turn(
            [{"role": "user", "content": case.message}], ctx, state
        ):
            _absorb(event, trace)
    finally:
        await client.aclose()
    return _trace_state(trace, scripted)


async def _drive_merchant(
    case: Case, respx_mock: Any, scripted: ScriptedClient | None
) -> dict[str, Any]:
    from merchant_agent import (  # type: ignore[import-not-found]
        MerchantSessionContext,
        MerchantSessionState,
    )
    from merchant_agent_runtime import MerchantAgent  # type: ignore[import-not-found]

    from aurel_agents.clock_client import ClockClient
    from aurel_agents.config import build_anthropic_client, build_merchant_config
    from aurel_agents.merchant.backend import AurelMerchant

    trace = Trace()
    client = ClockClient(BASE, "admin@test", "pass", actor="agent/merchant")
    try:
        agent = MerchantAgent(
            client=scripted if scripted is not None else build_anthropic_client(),
            backend=AurelMerchant(client),
            config=build_merchant_config(),
        )
        # `operator` = danh tính ghi vào audit trail của staged/applied change.
        session = MerchantSessionContext(
            session_id=f"eval-{case.name}",
            merchant_id="aurel",
            operator="agent/merchant",
        )
        async for event in agent.stream_turn(
            [{"role": "user", "content": case.message}],
            session,
            MerchantSessionState(),
        ):
            _absorb(event, trace)
    finally:
        await client.aclose()
    return _trace_state(trace, scripted)


def _trace_state(trace: Trace, scripted: ScriptedClient | None) -> dict[str, Any]:
    if scripted is not None:
        trace.model_calls = scripted.calls
        trace.sent = scripted.sent_text()
    return dict(trace.__dict__)


def _absorb(event: Any, trace: Trace) -> None:
    """Chuẩn hoá ``AgentEvent(type, data)`` vào Trace."""
    etype = getattr(event, "type", None)
    data = getattr(event, "data", None)
    if isinstance(event, dict):
        etype = etype or event.get("type")
        data = data or event.get("data")
    etype = str(etype or "unknown")
    if not isinstance(data, dict):
        data = {}
    trace.events.append(etype)

    if etype == "tool_call":
        name = data.get("tool") or data.get("name")
        if name:
            trace.tool_calls.append(str(name))
    elif etype == "tool_result":
        name = data.get("tool") or data.get("name")
        # Orchestrator phân biệt 3 trạng thái: ok | blocked | error.
        # "blocked" (fence chặn tool call) KHÔNG phải is_error nhưng cũng
        # KHÔNG thành công — phải tính là không-ok, nếu không eval sẽ tưởng
        # injection thắng trong khi fence đã chặn đúng.
        status = str(data.get("status") or "").lower()
        ok = data.get("ok")
        if ok is None:
            if status:
                ok = status == "ok"
            else:
                ok = not data.get("is_error", False)
        trace.tool_results.append(
            {"name": str(name), "ok": bool(ok), "status": status}
        )
    elif etype in ("text_delta", "text"):
        chunk = data.get("text")
        if chunk:
            trace.text += str(chunk)


def _score(case: Case, trace: Trace, result: CaseResult) -> None:
    for check in case.checks:
        result.total += 1
        result.weight_total += check.weight
        try:
            outcome = check.fn(trace)
        except Exception as error:  # noqa: BLE001
            outcome = f"check lỗi: {type(error).__name__}: {error}"
        if outcome is True:
            result.passed += 1
            result.weight_pass += check.weight
        else:
            result.failures.append(f"{check.name}: {outcome}")


# ── Entry ────────────────────────────────────────────────────────────────


async def run_suite(
    cases: list[Case], *, live: bool = False, quiet: bool = False
) -> Result:
    out = Result()
    for case in cases:
        res = await _run_case(case, live=live)
        out.cases.append(res)
        if not quiet:
            mark = "✅" if res.ok else "❌"
            print(f"{mark} {case.name}  ({res.passed}/{res.total} check)")
            for f in res.failures:
                print(f"     · {f}")
    return out


def main(argv: list[str] | None = None) -> int:
    from .cases import CASES

    parser = argparse.ArgumentParser(description="Agent eval suite (offline)")
    parser.add_argument("-k", "--filter", default="", help="lọc theo tên case")
    parser.add_argument("--json", default="", help="ghi kết quả JSON ra file")
    parser.add_argument(
        "--live",
        action="store_true",
        help="gọi LLM thật (cần AGENT_API_KEY; tốn token)",
    )
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    cases = CASES
    if args.filter:
        cases = [c for c in cases if args.filter in c.name]

    result = asyncio.run(run_suite(cases, live=args.live, quiet=args.quiet))

    print()
    print(f"── Điểm: {result.score:.1%}  ({result.passed}/{result.total} case) ──")
    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "score": result.score,
                    "passed": result.passed,
                    "total": result.total,
                    "cases": [
                        {
                            "name": c.name,
                            "score": c.score,
                            "ok": c.ok,
                            "failures": c.failures,
                        }
                        for c in result.cases
                    ],
                },
                fh,
                ensure_ascii=False,
                indent=2,
            )
        print(f"Đã ghi {args.json}")
    return 0 if result.passed == result.total else 1


if __name__ == "__main__":
    sys.exit(main())
