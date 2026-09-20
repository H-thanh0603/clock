# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Xuất config AgentEval (``eval_config.json`` + suite config) từ eval suite.

AgentEval (``pip install agent-eval``) cần 1 thư mục log có:

  - ``*.eval``            — log của Inspect AI (sinh bởi ``inspect eval``)
  - ``eval_config.json``  — ``{suite_config: {...}, split: "..."}``

Module này sinh đúng 2 file đó từ ``evals/cases.py`` để đưa suite Aurel vào
AgentEval (hoặc pipeline nào đọc format của nó) mà không phải viết tay.

    python -m evals.agenteval_config                 # in ra stdout
    python -m evals.agenteval_config -o evals/agenteval/   # ghi file

Luồng đầy đủ (khi cần leaderboard/nghiệm thu ngoài):

    pip install inspect-ai agent-eval
    python -m evals.agenteval_config -o /tmp/logs
    inspect eval evals/inspect_task.py --model mockllm/model --log-dir /tmp/logs
    LITELLM_LOCAL_MODEL_COST_MAP=True agenteval score /tmp/logs
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .inspect_task import PRIMARY_METRIC, SPEC_VERSION, metadata

SUITE_NAME = "aurel-agent-behavior"
# Tên task phải khớp ``@task(name=...)`` trong inspect_task.py — và vì mỗi
# case là 1 task riêng nên tên = ``aurel_<case>`` (AgentEval khớp theo tên).
TASK_NAME_PREFIX = "aurel_"
# Các "tag" nhóm case — AgentEval tính điểm theo tag khi tính summary.
TAG_BY_CASE_PREFIX: list[tuple[str, str]] = [
    ("merchant_", "merchant"),
    ("prompt_injection", "security"),
    ("no_fabricated", "security"),
    ("no_internal_leak", "security"),
    ("memory_", "personalization"),
    ("order_", "customer-care"),
    ("policy_", "customer-care"),
    ("search_", "discovery"),
    ("comparison_", "discovery"),
]


def _tags_for(case_name: str, domain: str) -> list[str]:
    tags = [domain]
    for prefix, tag in TAG_BY_CASE_PREFIX:
        if case_name.startswith(prefix) and tag not in tags:
            tags.append(tag)
    return tags


def build_config() -> dict[str, Any]:
    """``eval_config.json`` theo schema ``agenteval.models.EvalConfig``."""
    from .cases import CASES

    tasks = [
        {
            "name": f"{TASK_NAME_PREFIX}{case.name}",
            # Mọi case cùng 1 file, nhưng mỗi cái 1 @task(name=) riêng.
            "path": "evals/inspect_task.py",
            "primary_metric": PRIMARY_METRIC,
            "tags": _tags_for(case.name, case.domain),
        }
        for case in CASES
    ]
    suite_config = {
        "name": SUITE_NAME,
        "version": SPEC_VERSION,
        "splits": [{"name": "test", "tasks": tasks}],
    }
    return {
        "suite_config": suite_config,
        "split": "test",
        "inspect_command": [
            "inspect",
            "eval",
            "evals/inspect_task.py@aurel_<case>",
            "--model",
            "mockllm/model",
        ],
    }


def write(output_dir: Path) -> list[Path]:
    cfg = build_config()
    output_dir.mkdir(parents=True, exist_ok=True)
    cfg_path = output_dir / "eval_config.json"
    cfg_path.write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    # Suite config tách riêng để tool khác (không phải AgentEval) đọc được.
    suite_path = output_dir / "suite_config.json"
    suite_path.write_text(
        json.dumps(cfg["suite_config"], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    # Metadata mô tả suite (số case, domain) — tiện cho leaderboard/submission.
    meta_path = output_dir / "suite_metadata.json"
    meta_path.write_text(
        json.dumps(metadata(), ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return [cfg_path, suite_path, meta_path]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Sinh config AgentEval")
    parser.add_argument(
        "-o", "--output", default="", help="thư mục ghi (bỏ trống = stdout)"
    )
    args = parser.parse_args(argv)
    if not args.output:
        json.dump(build_config(), sys.stdout, ensure_ascii=False, indent=2)
        print()
        return 0
    paths = write(Path(args.output))
    for p in paths:
        print(f"đã ghi {p}")
    return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
