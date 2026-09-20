# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Cầu nối eval suite → Inspect AI (để AgentEval chấm điểm được).

AgentEval (``pip install agent-eval``) đọc **log của Inspect AI** rồi chấm
theo rubric/leaderboard. Muốn đưa suite của mình vào AgentEval (hoặc bất kỳ
tool Inspect nào) thì phải có 1 Inspect ``Task``.

Module này dựng Task đó từ chính ``evals/cases.py`` — chạy lại đúng 12 case
offline (model giả) dưới dạng sample Inspect, mỗi case 1 ``score`` 0..1.

    pip install inspect-ai        # tuỳ chọn, chỉ khi muốn xuất log Inspect
    inspect eval evals/inspect_task.py --model mockllm/model
    # → log .eval, đưa vào AgentEval:  agenteval score <log>

Không có ``inspect_ai`` → module này import được nhưng ``eval_suite()`` raise
hướng dẫn cài; phần còn lại của repo không phụ thuộc nó.
"""

from __future__ import annotations

from typing import Any

SPEC_VERSION = "1.0"

# Tên scorer trong Inspect → AgentEval ghép metric = f"{SCORER_NAME}/{metric}".
# Phải khớp hàm ``score_case`` bên dưới, nếu không AgentEval báo thiếu metric.
SCORER_NAME = "score_case"
PRIMARY_METRIC = f"{SCORER_NAME}/accuracy"

# Ánh xạ case → sample Inspect. Đặt ngoài phần import inspect để đọc được
# metadata (số case, tên) mà không cần cài inspect-ai.
try:  # pragma: no cover - chỉ chạy khi có inspect_ai
    from evals.cases import CASES  # type: ignore[import-not-found]
except Exception:  # pragma: no cover
    CASES = []  # type: ignore[assignment]


def metadata() -> dict[str, Any]:
    """Mô tả suite — dùng cho AgentEval submission / CI in ra."""
    return {
        "name": "aurel-agent-behavior",
        "version": SPEC_VERSION,
        "description": (
            "Hành vi agent Aurel & Co.: tool đúng/thứ tự đúng, fence "
            "provenance, prompt-injection, không rò rỉ, staged-change."
        ),
        "cases": len(CASES),
        "offline": True,  # model giả scripted — 0 token
        "domains": sorted({c.domain for c in CASES}) if CASES else [],
    }


def eval_suite() -> Any:
    """Inspect Task GỘP (mọi case, tiện chạy nhanh/xem chi tiết)."""
    tasks = [build_task(c) for c in CASES]
    if len(tasks) == 1:
        return tasks[0]
    return tasks


def case_task_names() -> list[str]:
    """Tên task của từng case (AgentEval khớp theo tên task)."""
    return [f"aurel_{c.name}" for c in CASES]


def build_task(case: Any) -> Any:
    """1 Inspect Task cho đúng 1 case.

    AgentEval tính điểm theo **task name** (mỗi task = 1 benchmark), nên suite
    phải tách thành nhiều task chứ không thể 1 task 12 sample — nếu gộp,
    AgentEval báo "missing tasks" và summary = 0.
    """
    try:
        from inspect_ai import Task, task
        from inspect_ai.dataset import Sample
        from inspect_ai.scorer import Score, Scorer, Target, accuracy, scorer
        from inspect_ai.solver import TaskState, solver
    except ImportError as error:  # pragma: no cover
        raise ImportError(
            "Cần 'pip install inspect-ai' để xuất log Inspect cho AgentEval. "
            "Bản thân suite offline chạy bằng `python -m evals.run` (không cần)."
        ) from error

    from evals.run import _run_case  # type: ignore[import-not-found]

    @solver
    def run_case_in_scorer() -> Any:
        """Solver rỗng (có registry): case tự chạy agent trong scorer, không
        gọi LLM của Inspect — nên không cần model thật."""

        async def solve(state: TaskState, generate: Any) -> TaskState:
            return state

        return solve

    # Không đặt tên riêng cho scorer: Inspect sẽ dùng tên metric = "accuracy"
    # (khớp ``primary_metric`` trong eval_config.json của AgentEval). Nếu đặt
    # tên, metric thành "case_score/accuracy" và AgentEval báo thiếu metric.
    @scorer(metrics=[accuracy()])
    def score_case() -> Scorer:
        async def score(state: TaskState, target: Target) -> Score:
            result = await _run_case(case)
            return Score(
                value=result.score,
                explanation="; ".join(result.failures) or "pass hết",
            )

        return score

    @task(name=f"aurel_{case.name}")
    def _case_task() -> Task:
        return Task(
            dataset=[
                Sample(
                    input=case.message,
                    target="pass",
                    id=case.name,
                    metadata={"case": case.name, "domain": case.domain},
                )
            ],
            solver=run_case_in_scorer(),
            scorer=score_case(),
        )

    return _case_task()


if __name__ == "__main__":  # pragma: no cover
    import json

    print(json.dumps(metadata(), ensure_ascii=False, indent=2))
