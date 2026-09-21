# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""A2A (Agent-to-Agent, Google) endpoint cho agent bên thứ ba.

Vì sao KHÔNG dùng ``a2a-sdk`` (không thêm dep):
- SDK kéo protobuf + grpcio + starlette riêng (~30MB) chỉ để serve 3 method
  JSON-RPC mà FastAPI sẵn có; repo đã có FastAPI + Pydantic.
- Implement JSON-RPC theo spec A2A (``message/send``, ``message/stream``,
  ``tasks/get``, ``tasks/cancel`` + ``AgentCard`` ở ``/.well-known/agent-card.json``)
  bằng ~200 dòng, dùng đúng orchestrator turn của host (không fork logic).

Ranh giới an toàn (giữ đúng hợp đồng repo):
- Chỉ expose **shop concierge** (catalog/giỏ công khai + watch + tra đơn) —
  KHÔNG expose merchant (ghi tiền/kho) qua A2A.
- Không session mới: mỗi A2A task = 1 chat session riêng (``a2a:<task_id>``),
  delegation KHÔNG áp dụng (agent ngoài không cầm token user).
- Rate-limit/budget dùng chung guard của ``/shop/chat``.

Tham chiếu spec: https://a2a-protocol.org (A2A v0.3: JSON-RPC 2.0,
TaskState submitted→working→completed/failed/canceled).
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field

logger = logging.getLogger("aurel-agents.a2a")

# --- JSON-RPC 2.0 envelope ----------------------------------------------------

class RpcRequest(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: str | int | None = None
    method: str
    params: dict[str, Any] = Field(default_factory=dict)


def _ok(rid: str | int | None, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": rid, "result": result}


def _err(rid: str | int | None, code: int, message: str, data: Any = None) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": rid, "error": err}


# --- A2A types (tối thiểu theo spec v0.3) -------------------------------------

class TextPart(BaseModel):
    kind: Literal["text"] = "text"
    text: str


class A2AMessage(BaseModel):
    role: Literal["user", "agent"] = "user"
    parts: list[TextPart] = Field(default_factory=list)
    messageId: str = Field(default_factory=lambda: uuid.uuid4().hex[:16])


class TaskStatus(BaseModel):
    state: Literal[
        "submitted", "working", "input-required",
        "completed", "failed", "canceled", "rejected",
    ]


class A2ATask(BaseModel):
    id: str
    contextId: str
    status: TaskStatus
    history: list[A2AMessage] = Field(default_factory=list)
    artifacts: list[dict[str, Any]] = Field(default_factory=list)


class AgentSkill(BaseModel):
    id: str
    name: str
    description: str
    tags: list[str] = Field(default_factory=list)


class AgentCard(BaseModel):
    name: str
    description: str
    version: str
    url: str
    protocolVersion: str = "0.3"
    capabilities: dict[str, Any] = Field(
        default_factory=lambda: {"streaming": True, "pushNotifications": False}
    )
    defaultInputModes: list[str] = Field(default_factory=lambda: ["text"])
    defaultOutputModes: list[str] = Field(default_factory=lambda: ["text"])
    skills: list[AgentSkill] = Field(default_factory=list)


def build_agent_card(base_url: str) -> dict[str, Any]:
    """AgentCard cho concierge shop (merchant KHÔNG expose qua A2A)."""
    root = base_url.rstrip("/")
    return AgentCard(
        name="Aurel & Co. — AI Concierge",
        description=(
            "Concierge AI boutique đồng hồ Aurel & Co.: tư vấn, tìm kiếm, "
            "theo dõi về hàng/giảm giá, tra đơn. Chỉ shop — vận hành "
            "(merchant) không expose qua A2A."
        ),
        version="1.0.0",
        url=f"{root}/a2a",
        skills=[
            AgentSkill(
                id="concierge",
                name="Tư vấn mua sắm",
                description="Hỏi đáp đồng hồ, so sánh, điền giỏ hộ (checkout do user bấm).",
                tags=["shopping", "watch", "concierge"],
            ),
            AgentSkill(
                id="watch",
                name="Theo dõi về hàng / giảm giá",
                description="Đặt watch qua chat ('báo tôi khi...').",
                tags=["watch", "alert"],
            ),
            AgentSkill(
                id="order-lookup",
                name="Tra cứu đơn",
                description="Tra trạng thái đơn theo mã AC-YYYY-NNNNNN.",
                tags=["order", "lookup"],
            ),
        ],
    ).model_dump()


# --- Task store (in-memory; task ngắn, xong là hết) --------------------------

_TASKS: dict[str, A2ATask] = {}
_MAX_TASKS = 200


def _get_task(task_id: str) -> A2ATask | None:
    return _TASKS.get(task_id)


def _new_task(context_id: str | None, message: A2AMessage) -> A2ATask:
    task = A2ATask(
        id=f"a2a-{uuid.uuid4().hex[:12]}",
        contextId=context_id or f"ctx-{uuid.uuid4().hex[:12]}",
        status=TaskStatus(state="submitted"),
        history=[message],
    )
    _TASKS[task.id] = task
    if len(_TASKS) > _MAX_TASKS:
        # Evict task cũ nhất đã terminal; chưa terminal thì giữ.
        for tid, t in list(_TASKS.items()):
            if t.status.state in ("completed", "failed", "canceled", "rejected"):
                del _TASKS[tid]
                break
    return task


def _message_text(message: dict[str, Any] | A2AMessage) -> str:
    if isinstance(message, A2AMessage):
        parts = message.parts
    else:
        parts = [TextPart(**p) for p in message.get("parts", []) if isinstance(p, dict)]
    return "\n".join(p.text for p in parts if p.kind == "text").strip()


# --- Executor: chạy turn shop của host, gom text + artifacts -----------------

async def run_a2a_turn(
    host: Any, message_text: str, session_id: str, trace_id: str | None = None
) -> tuple[str, list[dict[str, Any]]]:
    """Chạy 1 turn shopping qua orchestrator của host.

    Trả (reply_text, artifacts): artifacts là UI card (present_products...),
    order code, watch id — agent ngoài render tiếp được thay vì parse text.
    """
    agent = host._require_agent("shopping")
    texts: list[str] = []
    artifacts: list[dict[str, Any]] = []
    async for event in host._run_shopping_turn(
        agent, message_text, session_id, trace_id=trace_id
    ):
        payload = event.data if hasattr(event, "data") else event
        if isinstance(payload, str):
            try:
                import json as _json

                payload = _json.loads(payload.removeprefix("data:").strip())
            except Exception:
                continue
        if not isinstance(payload, dict):
            continue
        etype = payload.get("type")
        if etype == "text_delta" and payload.get("text"):
            texts.append(str(payload["text"]))
        elif etype == "ui":
            artifacts.append(
                {
                    "artifactId": f"art-{len(artifacts)}",
                    "name": str(payload.get("component", "ui")),
                    "parts": [{"kind": "text", "text": _artifact_text(payload)}],
                }
            )
        elif etype in ("cart_update", "change_update", "handoff"):
            artifacts.append(
                {
                    "artifactId": f"art-{len(artifacts)}",
                    "name": str(etype),
                    "parts": [{"kind": "data", "data": payload}],
                }
            )
    return "".join(texts).strip(), artifacts


def _artifact_text(payload: dict[str, Any]) -> str:
    comp = payload.get("component", "ui")
    data = payload.get("data", payload.get("payload", {}))
    if isinstance(data, dict):
        title = data.get("title") or data.get("headline") or ""
        return f"[{comp}] {title}".strip()
    return f"[{comp}]"


# --- Dispatcher JSON-RPC ------------------------------------------------------

async def dispatch(host: Any, req: RpcRequest, trace_id: str | None = None, client_ip: str = "a2a") -> dict[str, Any]:
    """Route method A2A → handler. Lỗi nào cũng thành JSON-RPC error (không 500)."""
    handlers = {
        "message/send": _handle_send,
        "message/stream": _handle_send_stream,
        "tasks/get": _handle_get,
        "tasks/cancel": _handle_cancel,
    }
    handler = handlers.get(req.method)
    if handler is None:
        return _err(req.id, -32601, f"Method không hỗ trợ: {req.method}")
    try:
        if req.method in ("message/send", "message/stream"):
            return await handler(host, req, trace_id, client_ip)
        return await handler(host, req, trace_id)
    except ValueError as e:
        return _err(req.id, -32602, f"Param không hợp lệ: {e}")
    except Exception as e:
        # HTTPException từ guard (429 hết budget/rate) → JSON-RPC -32001 để
        # agent ngoài phân biệt "bị giới hạn" với "lỗi nội bộ" (-32603).
        from fastapi import HTTPException as _HTTPException

        if isinstance(e, _HTTPException) and e.status_code == 429:
            return _err(req.id, -32001, str(e.detail))
        logger.exception("A2A %s lỗi", req.method)
        return _err(req.id, -32603, "Lỗi nội bộ")


def _parse_message(params: dict[str, Any]) -> tuple[A2AMessage, str | None, str | None]:
    raw = params.get("message")
    if not isinstance(raw, dict):
        raise ValueError("thiếu params.message")
    message = A2AMessage(**raw)
    text = _message_text(message)
    if not text:
        raise ValueError("message rỗng (cần ít nhất 1 text part)")
    task_id = params.get("taskId")
    context_id = params.get("contextId")
    if task_id is not None and not isinstance(task_id, str):
        raise ValueError("taskId phải là string")
    if context_id is not None and not isinstance(context_id, str):
        raise ValueError("contextId phải là string")
    return message, task_id, context_id


async def _handle_send(host: Any, req: RpcRequest, trace_id: str | None, client_ip: str = "a2a") -> dict[str, Any]:
    from aurel_agents.host import _check_budget  # guard chung với /shop/chat

    message, task_id, context_id = _parse_message(req.params)
    task = _get_task(task_id) if task_id else None
    if task_id and task is None:
        return _err(req.id, -32004, f"Không thấy task {task_id}")
    if task is None:
        task = _new_task(context_id, message)
    else:
        task.history.append(message)
    session_id = f"a2a:{task.id}"
    # Guard chung với /shop/chat (rate theo IP + budget) — agent ngoài cũng
    # bị giới hạn. _check_rate cần Request → truyền IP trực tiếp qua helper.
    settings = host.get_settings()
    from aurel_agents import host as _host
    _host_rate = _host._rate
    if settings.chat_rate_limit_per_min > 0 and not _host_rate.allow(
        f"a2a:{client_ip}", settings.chat_rate_limit_per_min
    ):
        task.status = TaskStatus(state="rejected")
        return _err(req.id, -32001, "Quá nhiều request — thử lại sau 1 phút")
    _check_budget(session_id, settings.chat_turns_per_day, settings.global_turns_per_day)
    task.status = TaskStatus(state="working")
    t0 = time.monotonic()
    try:
        reply, artifacts = await run_a2a_turn(
            host, _message_text(message), session_id, trace_id
        )
    except Exception as e:
        task.status = TaskStatus(state="failed")
        return _err(req.id, -32603, f"Turn lỗi: {type(e).__name__}")
    agent_msg = A2AMessage(
        role="agent", parts=[TextPart(text=reply or "(không có nội dung)")]
    )
    task.history.append(agent_msg)
    task.status = TaskStatus(state="completed")
    task.artifacts.extend(artifacts)
    logger.info("A2A task %s xong %.1fs (%d artifacts)", task.id, time.monotonic() - t0, len(artifacts))
    return _ok(req.id, task.model_dump())


async def _handle_send_stream(host: Any, req: RpcRequest, trace_id: str | None, client_ip: str = "a2a") -> dict[str, Any]:
    """Streaming: SSE event (giữ đúng transport SSE của A2A streaming).

    Caller gọi endpoint ``/a2a/stream`` (SSE) thay vì POST JSON thường.
    """
    message, task_id, context_id = _parse_message(req.params)
    task = _get_task(task_id) if task_id else None
    if task_id and task is None:
        return _err(req.id, -32004, f"Không thấy task {task_id}")
    if task is None:
        task = _new_task(context_id, message)
    else:
        task.history.append(message)

    async def _gen():
        import json as _json

        session_id = f"a2a:{task.id}"
        settings = host.get_settings()
        from aurel_agents import host as _host
        from aurel_agents.host import _check_budget
        _host_rate = _host._rate
        try:
            if settings.chat_rate_limit_per_min > 0 and not _host_rate.allow(
                f"a2a:{client_ip}", settings.chat_rate_limit_per_min
            ):
                raise RuntimeError("Quá nhiều request — thử lại sau 1 phút")
            _check_budget(session_id, settings.chat_turns_per_day, settings.global_turns_per_day)
        except Exception as e:
            yield f"data: {_json.dumps(_err(req.id, -32001, str(e)), ensure_ascii=False)}\n\n"
            return
        task.status = TaskStatus(state="working")
        yield f"data: {_json.dumps(_ok(req.id, task.model_dump()), ensure_ascii=False)}\n\n"
        try:
            reply, artifacts = await run_a2a_turn(
                host, _message_text(message), session_id, trace_id
            )
        except Exception as e:
            task.status = TaskStatus(state="failed")
            yield f"data: {_json.dumps(_err(req.id, -32603, f'Turn lỗi: {type(e).__name__}'), ensure_ascii=False)}\n\n"
            return
        agent_msg = A2AMessage(
            role="agent", parts=[TextPart(text=reply or "(không có nội dung)")]
        )
        task.history.append(agent_msg)
        task.status = TaskStatus(state="completed")
        task.artifacts.extend(artifacts)
        yield f"data: {_json.dumps(_ok(req.id, task.model_dump()), ensure_ascii=False)}\n\n"

    return {"__sse__": _gen()}  # marker để route stream riêng


async def _handle_get(host: Any, req: RpcRequest, trace_id: str | None) -> dict[str, Any]:
    del host, trace_id
    task_id = req.params.get("id")
    if not isinstance(task_id, str):
        raise ValueError("thiếu params.id")
    task = _get_task(task_id)
    if task is None:
        return _err(req.id, -32004, f"Không thấy task {task_id}")
    return _ok(req.id, task.model_dump())


async def _handle_cancel(host: Any, req: RpcRequest, trace_id: str | None) -> dict[str, Any]:
    del host, trace_id
    task_id = req.params.get("id")
    if not isinstance(task_id, str):
        raise ValueError("thiếu params.id")
    task = _get_task(task_id)
    if task is None:
        return _err(req.id, -32004, f"Không thấy task {task_id}")
    if task.status.state in ("completed", "failed", "canceled"):
        return _ok(req.id, task.model_dump())  # terminal rồi — idempotent
    task.status = TaskStatus(state="canceled")
    return _ok(req.id, task.model_dump())
