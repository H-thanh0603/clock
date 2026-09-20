# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Eval harness cho agent — đo hồi quy chất lượng, chạy được KHÔNG tốn token.

Vấn đề: 220 test hiện có kiểm *cơ chế* (gate chặn, CSRF, retry) nhưng không
kiểm *hành vi* (agent có tìm đúng đồng hồ, có đề xuất đúng thay đổi, có
chặn prompt-injection không). Fuzz (`test_model_fuzz.py`) kiểm hành vi nhưng
cần key + tốn token → không chạy trong CI → hồi quy lọt lưới.

Harness này chèn một **model giả scripted** (``ScriptedClient``) vào đúng
chỗ Anthropic client, nên:
  - chạy offline, 0 token, vào được CI
  - mỗi case = 1 kịch bản model + tool result giả + kỳ vọng về *hành vi*
  - chấm theo rubric có trọng số → 1 con số (score) so sánh giữa các lần

Thêm khi có key thật thì chạy ``--live`` để so model giả vs model thật.

Chạy:  python -m evals.run            (offline, mặc định)
       python -m evals.run --live     (gọi LLM thật, tốn token)
"""

from __future__ import annotations

__all__ = ["Case", "Check", "run_suite", "Result"]
