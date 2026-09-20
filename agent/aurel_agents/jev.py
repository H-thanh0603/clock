# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Jev (TypeSafe AI) — quyết định có cấu trúc cho handoff ticket.

Jev KHÔNG thay LLM concierge/merchant (không sinh text, không tool_use).
Dùng làm lớp xác nhận + route bên cạnh heuristic 0-call trong host.py:

- heuristic trúng rõ → mở ticket luôn, tốn 0 call
- heuristic trượt (khiếu nại diễn đạt không chứa từ khoá) → hỏi Jev 1 call
  (noul complaint + choice department để route đội xử lý)
- khách đã có ticket open → gửi kèm ``prior`` (lịch sử các lượt trước)
  để Jev chấm severity **của lần này** trong ngữ cảnh — câu ngắn kiểu
  "vẫn chưa thấy ai liên hệ" là leo thang dù không có từ khoá nặng
- Jev chết / thiếu key / parse lỗi → ``classify`` trả None, caller fallback
  heuristic cũ (handoff không bao giờ fail vì Jev — như Meili fallback Prisma)

API: POST full endpoint (mặc định ``https://api.typesafe.ai/v1/systemone``,
model ``jev-latest``; qua AI/ML API thì endpoint ``.../v1/decisions``,
model ``typesafe/jev`` — cả hai đều Bearer auth + cùng shape questions).
"""

from __future__ import annotations

import json
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


# --- #1 watch intent (Jev phân loại loại watch khi heuristic/model trượt) ------------

QUESTIONS_WATCH = {
    "is_watch_intent": {
        "type": "noul",
        "instructions": (
            "Khách có đang nhờ theo dõi một sản phẩm để được báo sau không "
            "(báo khi về hàng, báo khi giảm giá)?"
        ),
    },
    "watch_type": {
        "type": "choice",
        "instructions": "Loại theo dõi khách muốn?",
        "criteria": {
            "restock": "Báo khi sản phẩm có lại hàng (hết hàng, về lại)",
            "price_drop": "Báo khi giá giảm (rẻ hơn, giảm giá, xuống dưới mức nào đó)",
        },
    },
    "price_drop_pct": {
        "type": "choice",
        "instructions": (
            "Nếu là báo giảm giá: mức giảm tối thiểu khách chấp nhận? "
            "Chọn bucket gần nhất với lời khách."
        ),
        "criteria": {
            "5": "Chỉ cần rẻ hơn chút ('giảm chút', 'rẻ hơn tí', không nói mức)",
            "10": "Khoảng 10% hoặc 'giảm 10%'",
            "20": "Giảm sâu ('mới đáng mua', 'giảm nhiều', ~20%+)",
        },
    },
}


@dataclass(frozen=True)
class WatchIntentVerdict:
    is_watch_intent: bool
    watch_type: str | None = None
    price_drop_pct: int | None = None


def classify_watch_intent(
    message: str,
    *,
    api_key: str | None,
    base_url: str,
    model: str,
    timeout_s: float,
    threshold: float = 0.6,
) -> WatchIntentVerdict | None:
    """#1: phân loại ý định watch. None = Jev chết/thiếu key → caller giữ
    nguyên kind model đã chọn (fail-safe); is_watch_intent=False nghĩa là
    Jev chấm thấp — cũng giữ nguyên, chỉ là không tinh chỉnh."""
    if not api_key:
        return None
    try:
        resp = httpx.post(
            base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "state": message[:2000], "questions": QUESTIONS_WATCH},
            timeout=timeout_s,
        )
        resp.raise_for_status()
        answers = resp.json().get("answers", {})
        noul = answers.get("is_watch_intent", {}).get("noul")
        if not isinstance(noul, (int, float)):
            return None
        if float(noul) < threshold:
            return WatchIntentVerdict(is_watch_intent=False)
        wtype = answers.get("watch_type", {}).get("choice")
        pct_raw = answers.get("price_drop_pct", {}).get("choice")
        pct: int | None = None
        if isinstance(pct_raw, str):
            try:
                pct = int(pct_raw)
            except ValueError:
                pct = None
        elif isinstance(pct_raw, (int, float)):
            pct = int(pct_raw)
        return WatchIntentVerdict(
            is_watch_intent=True,
            watch_type=wtype if isinstance(wtype, str) else None,
            price_drop_pct=pct,
        )
    except Exception:
        logger.warning("Jev watch-intent lỗi (giữ kind model chọn)", exc_info=True)
        return None


# --- #3 lọc nhiễu alert merchant-scan ------------------------------------------------

QUESTIONS_ALERT = {
    "is_noteworthy": {
        "type": "noul",
        "instructions": (
            "Alert vận hành này có ĐÁNG để chủ cửa hàng biết NGAY không "
            "(ảnh hưởng tiền, khách chờ, mất bán) — hay là nhiễu lặp lại "
            "đã biết từ trước?"
        ),
    },
}


@dataclass(frozen=True)
class AlertVerdict:
    is_noteworthy: bool


def classify_alert(
    alert_kind: str,
    alert_title: str,
    alert_detail: str,
    *,
    api_key: str | None,
    base_url: str,
    model: str,
    timeout_s: float,
) -> AlertVerdict | None:
    """#3: chấm alert merchant-scan có đáng lên feed không. None = Jev
    chết/thiếu key → caller publish như cũ (fail-safe, không mất alert)."""
    if not api_key:
        return None
    state = json.dumps(
        {"kind": alert_kind, "title": alert_title, "detail": alert_detail},
        ensure_ascii=False,
    )[:2000]
    try:
        resp = httpx.post(
            base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "state": state, "questions": QUESTIONS_ALERT},
            timeout=timeout_s,
        )
        resp.raise_for_status()
        noul = resp.json().get("answers", {}).get("is_noteworthy", {}).get("noul")
        if not isinstance(noul, (int, float)):
            return None
        return AlertVerdict(is_noteworthy=float(noul) >= 0.5)
    except Exception:
        logger.warning("Jev alert-classify lỗi (publish như cũ)", exc_info=True)
        return None


# --- #4 pre-router intent (hint sớm cho FE, giảm cảm giác chờ) -----------------------

QUESTIONS_INTENT = {
    "intent": {
        "type": "choice",
        "instructions": "Ý định chính của tin nhắn khách này?",
        "criteria": {
            "browse": "Tìm/xem/so sánh sản phẩm, hỏi giá",
            "order_status": "Hỏi trạng thái đơn hàng đang chờ",
            "complaint": "Khiếu nại, báo sự cố đơn/sản phẩm",
            "policy_question": "Hỏi chính sách (bảo hành, đổi trả, hoàn tiền, ship)",
            "smalltalk": "Chào hỏi, ngoài chủ đề mua sắm",
        },
    },
}


@dataclass(frozen=True)
class IntentVerdict:
    bucket: str
    confidence: float = 0.0


def classify_intent(
    message: str,
    *,
    api_key: str | None,
    base_url: str,
    model: str,
    timeout_s: float,
) -> IntentVerdict | None:
    """#4: pre-router 1 call — bucket intent. Host dùng làm hint `progress`
    sớm cho FE (model reasoning mất 1-3s mới có token đầu). None = Jev
    tắt/chết → không hint, agent chạy như cũ."""
    if not api_key:
        return None
    try:
        resp = httpx.post(
            base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "state": message[:2000], "questions": QUESTIONS_INTENT},
            timeout=timeout_s,
        )
        resp.raise_for_status()
        answer = resp.json().get("answers", {}).get("intent", {})
        bucket = answer.get("choice")
        conf = answer.get("confidence")
        if not isinstance(bucket, str):
            return None
        return IntentVerdict(
            bucket=bucket,
            confidence=float(conf) if isinstance(conf, (int, float)) else 0.0,
        )
    except Exception:
        logger.warning("Jev intent lỗi (không hint, agent chạy như cũ)", exc_info=True)
        return None


def classify(
    message: str,
    *,
    api_key: str | None,
    base_url: str,
    model: str,
    threshold: float,
    timeout_s: float,
    prior: str | None = None,
) -> JevVerdict | None:
    """Hỏi Jev 1 call. None = thiếu key / Jev chết / parse lỗi → caller fallback.

    ``prior``: lịch sử các lượt khiếu nại trước của cùng vụ việc (ticket
    đang open). Ghép vào ``state`` có nhãn rõ để model không nhầm lịch sử
    với tin hiện tại — severity trả về là **của tin mới nhất**.
    """
    if not api_key:
        return None
    state = message[:2000]
    if prior:
        state = (
            "[Các lượt trước của cùng vụ việc]\n"
            f"{prior[:1500]}\n\n"
            f"[Tin nhắn mới nhất cần chấm]\n{state}"
        )
    try:
        resp = httpx.post(
            base_url.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "state": state, "questions": QUESTIONS},
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
