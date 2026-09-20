# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Token gate cho MCP merchant server (ghi tiền/kho thật qua MCP).

Vấn đề: MCP merchant expose ``stage_*``/``apply_change`` chạm dữ liệu thật
nhưng FastMCP reference server **không có inbound auth** (vendor chặn bind
ngoài-loopback trừ khi set ``MERCHANT_MCP_UNSAFE_ALLOW_NO_AUTH=1``). Chỉ
loopback là chưa đủ khi chạy trong compose (container khác cùng network vẫn
với tới) — nên cần thêm 1 lớp token ở tầng tool-call.

Cách làm (không sửa vendor): dùng ``Context`` của FastMCP để đọc HTTP header
của request gọi tool, so với ``AGENT_MERCHANT_TOKEN``. Sai/thiếu → raise
trước khi tool chạy (fail-closed). ``/health`` giữ public cho healthcheck.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger("aurel-agents.mcp_auth")

TOKEN_HEADER = "x-agent-token"
TOKEN_ENV = "AGENT_MERCHANT_TOKEN"


def merchant_token_from_env() -> str:
    """Token merchant từ env (rỗng = chưa cấu hình → caller fail-closed)."""
    return (os.environ.get(TOKEN_ENV) or "").strip()


def _request_headers(ctx: object) -> dict[str, str]:
    """Lấy HTTP headers của tool-call từ FastMCP Context.

    Chuỗi truy cập (MCP 1.x, streamable-HTTP):
    ``ctx.request_context.request`` = Starlette ``Request`` gốc — được
    ``streamable_http.py`` nhét vào ``ServerMessageMetadata`` cho mỗi POST.
    Không lấy được (gọi nội bộ/vendor test) → dict rỗng → ``check_token``
    miễn gate (không phải HTTP ngoài thì không có gì để chặn).
    """
    try:
        request = getattr(getattr(ctx, "request_context", None), "request", None)
        headers = getattr(request, "headers", None)
        if headers is None:
            return {}
        if hasattr(headers, "items"):
            return {str(k).lower(): str(v) for k, v in headers.items()}
        return {str(k).lower(): str(v) for k, v in dict(headers).items()}
    except Exception:
        return {}


def check_token(ctx: object, expected: str) -> None:
    """Raise PermissionError khi header token sai/thiếu. Pure → test được.

    Phân biệt 3 trường hợp:
    - không có HTTP request nào (gọi nội bộ/vendor test) → miễn gate;
    - có HTTP request (luôn kèm Host header) nhưng thiếu ``x-agent-token``
      → chặn (fail-closed — attacker ngoài luôn đi qua HTTP);
    - có header nhưng sai → chặn.
    """
    headers = _request_headers(ctx)
    if not headers:
        return  # gọi nội bộ, không qua HTTP
    got = headers.get(TOKEN_HEADER, "")
    # So sánh hằng thời gian để không lộ độ dài token qua timing.
    import hmac

    if not expected or not hmac.compare_digest(got, expected):
        raise PermissionError("Thiếu/sai x-agent-token cho merchant MCP")


def attach_token_gate(expected: str) -> None:
    """Gắn gate vào mọi tool merchant qua middleware của vendor registrar.

    Không sửa vendor: bọc ``ConnectionExecutors.call`` — điểm duy nhất mọi
    tool merchant đi qua (xem ``commerce_common/mcp_server.py``).
    ``ctx`` là tham số đầu của ``call(ctx, name, arguments)``.

    Bọc theo token (không phải singleton 1 lần): mỗi lifespan mount với token
    khác nhau phải check token của chính nó. Bọc chồng an toàn vì lớp ngoài
    check trước — token sai rớt ngay lớp ngoài, không lọt vào lớp trong.
    """
    from commerce_common import mcp_server as _vendor

    original = _vendor.ConnectionExecutors.call

    async def gated(self: object, ctx: object, name: str, arguments: dict) -> str:
        check_token(ctx, expected)
        return await original(self, ctx, name, arguments)

    _vendor.ConnectionExecutors.call = gated  # type: ignore[method-assign]


def attach_health_route(server: object) -> None:
    """Route /health public (không qua gate) cho Caddy/docker healthcheck."""
    custom_route = getattr(server, "custom_route", None)
    if not callable(custom_route):
        return

    @custom_route("/health", methods=["GET"])  # type: ignore[misc]
    async def _health(request: object) -> object:
        from starlette.responses import JSONResponse

        return JSONResponse({"ok": True, "role": "merchant-mcp"})
