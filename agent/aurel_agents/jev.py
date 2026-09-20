# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Jev (TypeSafe AI) — quyết định có cấu trúc cho handoff ticket.

Jev KHÔNG thay LLM concierge/merchant (không sinh text, không tool_use).
Dùng làm lớp xác nhận + route bên cạnh heuristic 0-call trong host.py:

- heuristic trúng rõ → mở ticket luôn, tốn 0 call
- heuristic trượt (khiếu nại diễn đạt không chứa từ khoá) → hỏi Jev 1 call
  (noul complaint + choice department để route đội xử lý)
- Jev chết / thiếu key / parse lỗi → ``classify`` trả None, caller fallback
  heuristic cũ (handoff không bao giờ fail vì Jev — như Meili fallback Prisma)

API: POST full endpoint (mặc định ``https://api.typesafe.ai/v1/systemone``,
model ``jev-latest``; qua AI/ML API thì endpoint ``.../v1/decisions``,
model ``typesafe/jev`` — cả hai đều Bearer auth + cùng shape questions).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger("aurel-agents.jev")

QUESTIONS = {
    "is_complaint": {
        "type": "noul",
        "instructions": (
            "Khách có đang báo sự cố / khiếu nại về đơn hàng, sản phẩm hay "
            "dịch vụ không (không tính câu hỏi chính sách chung)?"
        ),
    },
    "department": {
        "type": "choice",
        "instructions": "Khiếu nại này thuộc đội nào xử lý?",
        "criteria": {
            "billing": "Thanh toán, hoàn tiền, hóa đơn",
            "technical": "Lỗi/hỏng sản phẩm, bảo hành, sửa chữa",
            "logistics": "Giao hàng, đơn hàng, vận chuyển",
            "sales": "Giá, tư vấn mua, đổi ý",
        },
    },
    # Triage (cùng 1 call — Jev trả nhiều câu hỏi trong 1 request):
    "severity": {
        "type": "choice",
        "instructions": "Mức ưu tiên xử lý khiếu nại này?",
        "criteria": {
            "urgent": (
                "Mất tiền thật, đơn giá trị lớn, sản phẩm hỏng hoàn toàn, "
                "khách tuyên bố pháp lý hoặc đề nghị hoàn tiền ngay"
            ),
            "normal": "Lỗi thông thường, cần xử lý trong ngày làm việc",
            "low": "Góp ý, không đúng sản phẩm, ưu tiên thấp",
        },
    },
    "sentiment": {
        "type": "choice",
        "instructions": "Tâm trạng khách trong tin nhắn này?",
        "criteria": {
            "angry": "Bức xúc, đe dọa bỏ đi/tố cáo, chửi mắng, CẦN XỬ LÝ NGAY",
            "upset": "Không hài lòng rõ ràng nhưng còn kiểm soát",
            "neutral": "Bình thường, chỉ trình bày sự việc",
        },
    },
}


@dataclass(frozen=True)
class JevVerdict:
    is_complaint: bool
    department: str | None = None
    confidence: float = 0.0
    severity: str | None = None
    sentiment: str | None = None


def classify(
    message: str,
    *,
    api_key: str | None,
    base_url: str,
    model: str,
    threshold: float,
    timeout_s: float,
) -> JevVerdict | None:
    """Hỏi Jev 1 call. None = thiếu key / Jev chết / parse lỗi → caller fallback."""
    if not api_key:
        return None
    try:
        resp = httpx.post(
            base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "state": message[:2000], "questions": QUESTIONS},
            timeout=timeout_s,
        )
        resp.raise_for_status()
        answers = resp.json().get("answers", {})
        noul = answers.get("is_complaint", {}).get("noul")
        if not isinstance(noul, (int, float)):
            return None
        if noul < threshold:
            return JevVerdict(is_complaint=False, confidence=float(noul))
        choice = answers.get("department", {}).get("choice")
        severity = answers.get("severity", {}).get("choice")
        sentiment = answers.get("sentiment", {}).get("choice")
        return JevVerdict(
            is_complaint=True,
            department=choice if isinstance(choice, str) else None,
            severity=severity if isinstance(severity, str) else None,
            sentiment=sentiment if isinstance(sentiment, str) else None,
            confidence=float(noul),
        )
    except Exception:
        logger.warning("Jev classify lỗi (fallback heuristic)", exc_info=True)
        return None
