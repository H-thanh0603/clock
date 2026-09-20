# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Chạy eval suite như 1 test: hồi quy hành vi (không tốn token).

Mỗi case là 1 test riêng để pytest chỉ rõ case nào vỡ. Ngưỡng điểm đặt trong
``MIN_SCORE`` — hạ ngưỡng phải là quyết định có chủ ý, không phải để CI xanh.
"""

from __future__ import annotations

import pytest

from evals.cases import CASES
from evals.run import _run_case
from evals.suite import Result

# Sàn điểm toàn suite. Baseline hiện tại 100% → đặt 1.0 để bắt mọi hồi quy;
# khi chủ động thêm case mới khó hơn thì hạ xuống kèm ghi chú trong commit.
MIN_SCORE = 1.0


@pytest.mark.parametrize("case", CASES, ids=[c.name for c in CASES])
@pytest.mark.asyncio
async def test_eval_case(case):
    result = await _run_case(case)
    assert result.ok, "\n".join(result.failures)


@pytest.mark.asyncio
async def test_suite_score_not_regressed():
    result = Result()
    for case in CASES:
        result.cases.append(await _run_case(case))
    assert result.score >= MIN_SCORE, (
        f"Điểm eval tụt: {result.score:.1%} < {MIN_SCORE:.0%} "
        f"({result.passed}/{result.total} case pass)"
    )


def test_agenteval_config_matches_cases():
    """Config AgentEval sinh ra phải phủ ĐỦ case, tên task khớp inspect_task."""
    from evals.agenteval_config import build_config
    from evals.inspect_task import PRIMARY_METRIC, case_task_names

    cfg = build_config()
    tasks = cfg["suite_config"]["splits"][0]["tasks"]
    names = [t["name"] for t in tasks]
    assert names == case_task_names()
    assert len(names) == len(CASES)
    assert all(t["primary_metric"] == PRIMARY_METRIC for t in tasks)
    assert all(t["path"] == "evals/inspect_task.py" for t in tasks)
    # Mỗi case phải có ít nhất 1 tag để AgentEval gom nhóm được.
    assert all(t["tags"] for t in tasks)


def test_agenteval_config_write(tmp_path):
    from evals.agenteval_config import write

    paths = write(tmp_path)
    assert {p.name for p in paths} == {
        "eval_config.json",
        "suite_config.json",
        "suite_metadata.json",
    }
    import json

    cfg = json.loads((tmp_path / "eval_config.json").read_text())
    assert cfg["split"] == "test"
    meta = json.loads((tmp_path / "suite_metadata.json").read_text())
    assert meta["cases"] == len(CASES)
    assert meta["offline"] is True


def test_inspect_task_metadata_without_inspect_ai():
    """metadata() đọc được kể cả khi CHƯA cài inspect-ai (repo không phụ thuộc)."""
    from evals.inspect_task import metadata

    meta = metadata()
    assert meta["name"] == "aurel-agent-behavior"
    assert meta["cases"] == len(CASES)
