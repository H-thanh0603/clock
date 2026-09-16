# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Task tool cho shopping agent: khách giao việc rồi đi ("tối tôi xem",
"chuẩn bị giúp 3 phương án...").

Dùng ``PresentationExtension`` — seam chính thống của upstream (như
watch_tool), KHÔNG sửa vendor. Tool ghi vào ``TaskStore``; transcript đã
persist theo session nên mở lại là có ngay context cũ — đó là toàn bộ
"làm việc khi vắng mặt" của v1 (không đốt LLM nền).

Khác watch: task không cần provenance gate theo product (việc có thể là
"so 3 chiếc", "tìm quà dưới $50k" — chưa gắn SP cụ thể), nhưng có cap
số task open/user + check sở hữu khi complete.
"""

from __future__ import annotations

from typing import Any

from commerce_common.presentation import PresentationExtension
from pydantic import BaseModel, Field

from aurel_agents.proactive import TaskStore


class SaveTaskPayload(BaseModel):
    """Model validates tool input; enriched payload là card cho FE."""

    title: str = Field(max_length=120)
    goal: str = Field(max_length=500)


class CompleteTaskPayload(BaseModel):
    task_id: str


def build_task_extensions(
    task_store: TaskStore,
    user_id_of: Any = None,
    session_id_of: Any = None,
) -> tuple[PresentationExtension, PresentationExtension]:
    """Cặp extension ``save_task`` + ``complete_task``.

    ``user_id_of``/``session_id_of``: callable(session) → str (mặc định đọc
    ``session.user_id`` / ``session.session_id`` — đúng với
    ShoppingSessionContext). Resume sau này mở đúng session này.
    """

    async def enrich_save(payload: SaveTaskPayload, context: Any) -> dict[str, Any]:
        session = context.session
        user_id = user_id_of(session) if user_id_of else session.user_id
        session_id = session_id_of(session) if session_id_of else session.session_id
        task = task_store.add(
            user_id=user_id,
            session_id=session_id,
            title=payload.title,
            goal=payload.goal,
        )
        return {
            "task_id": task.task_id,
            "title": task.title,
            "goal": task.goal,
            "status": task.status,
        }

    async def enrich_complete(payload: CompleteTaskPayload, context: Any) -> dict[str, Any]:
        session = context.session
        user_id = user_id_of(session) if user_id_of else session.user_id
        task = task_store.get(payload.task_id)
        # Chỉ chủ task được đánh xong — chống user đoán task_id người khác.
        if task is None or task.user_id != user_id:
            raise ValueError(f"Không tìm thấy việc {payload.task_id} của bạn")
        done = task_store.complete(payload.task_id)
        return {"task_id": payload.task_id, "status": done.status if done else "done"}

    save_ext = PresentationExtension(
        name="save_task",
        component="task_saved",
        description=(
            "Save a task the customer delegates for later: they will leave and "
            "come back (tonight, tomorrow) to continue. The full conversation "
            "is preserved, so save a clear title and the goal/constraints "
            "discussed so far. Use it when the customer says things like "
            "'để đó', 'tối tôi xem', 'chuẩn bị giúp', 'giao cho bạn'. "
            "Do NOT use it for immediate requests they want answered now."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Short task title (<=120 chars), in the customer's language.",
                },
                "goal": {
                    "type": "string",
                    "description": (
                        "What was discussed and what remains: constraints, "
                        "shortlist so far, next step (<=500 chars)."
                    ),
                },
            },
            "required": ["title", "goal"],
            "additionalProperties": False,
        },
        payload_model=SaveTaskPayload,
        enrich=enrich_save,
    )
    complete_ext = PresentationExtension(
        name="complete_task",
        component="task_completed",
        description=(
            "Mark one of the customer's own open tasks as done (they confirmed, "
            "or you just finished it together). Only tasks of this customer."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "string",
                    "description": "Task id from a previous save_task result.",
                },
            },
            "required": ["task_id"],
            "additionalProperties": False,
        },
        payload_model=CompleteTaskPayload,
        enrich=enrich_complete,
    )
    return save_ext, complete_ext
