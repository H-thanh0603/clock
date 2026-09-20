# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Mount 2 MCP servers (shop + merchant) vào agent host qua ASGI.

Vì sao mount thay vì chạy 2 process rời (``python -m aurel_agents.mcp``):
- Store JSON của host là **single-writer** (host.lock) — 2 process cùng ghi
  watch/alert/ledger sẽ đè mất update của nhau.
- Prod chỉ cần 1 process agent duy nhất sau Caddy: ``/mcp/shop`` + ``/mcp/merchant``.
- Dev/test vẫn chạy rời từng server được (không bắt buộc mount).

Merchant giữ nguyên token gate (``mcp_auth``) — mount không bỏ auth.
"""

from __future__ import annotations

import contextlib
import logging
from typing import Any

logger = logging.getLogger("aurel-agents.mcp_mount")


def mount_mcp(app: Any, *, shop: Any | None = None, merchant: Any | None = None) -> dict[str, str]:
    """Mount FastMCP servers vào FastAPI app. Trả về {path: role} đã mount.

    ``shop``/``merchant`` là FastMCP server đã build (``build_*_server`` với
    host loopback — bind thật không dùng tới khi mount ASGI). None = bỏ qua
    role đó (vd thiếu token merchant thì chỉ mount shop).

    Session manager của FastMCP cần ``run()`` trong lifespan (tạo task group)
    — trả về async context manager để host ``async with`` trong lifespan của
    nó (xem ``lifespan_mcp``).
    """
    mounted: dict[str, str] = {}
    managers: list[Any] = []
    for path, server, role in (
        ("/mcp/shop", shop, "shop"),
        ("/mcp/merchant", merchant, "merchant"),
    ):
        if server is None:
            continue
        # DNS-rebinding protection của FastMCP check Host header — khi mount
        # sau Caddy/FastAPI, Host là domain public (không phải 127.0.0.1).
        # TẮT check này ở đây vì Caddy phía trước đã là reverse proxy tin cậy
        # (không expose MCP trực tiếp ra Internet — xem compose/Caddyfile).
        # Auth thật nằm ở token gate (merchant) + Caddy; check Host header
        # không phải auth, bật nó chỉ gây 421 oan sau proxy.
        try:
            from mcp.server.transport_security import TransportSecuritySettings

            server.settings.transport_security = TransportSecuritySettings(
                enable_dns_rebinding_protection=False,
            )
        except Exception:
            pass
        sub = server.streamable_http_app()
        app.mount(path, sub, name=f"mcp-{role}")
        mounted[path] = role
        managers.append(server.session_manager)
        logger.info("Đã mount MCP %s tại %s", role, path)
    app.state.mcp_managers = managers
    return mounted


async def lifespan_mcp(app: Any):
    """Chạy session managers của MCP đã mount (dùng trong lifespan host).

    Không có cái này thì mọi request /mcp/* rớt "Task group is not
    initialized" — FastMCP yêu cầu ``run()`` đúng vòng đời app.
    """
    import contextlib

    managers: list[Any] = getattr(app.state, "mcp_managers", [])
    if not managers:
        yield
        return
    async with contextlib.AsyncExitStack() as stack:
        for mgr in managers:
            await stack.enter_async_context(mgr.run())
        yield


# Decorate SAU định nghĩa (không đè tên trong chính thân hàm).
lifespan_mcp = contextlib.asynccontextmanager(lifespan_mcp)  # noqa: F811


def build_mounted(host: str = "127.0.0.1") -> tuple[Any | None, Any | None]:
    """Build cả 2 FastMCP servers (loopback bind — chỉ dùng ASGI app).

    Merchant thiếu token → None (fail-open CÓ CHỦ Ý ở tầng mount: shop vẫn
    chạy; endpoint merchant trả 503 rõ ràng thay vì crash cả host).
    """
    from aurel_agents import mcp as _mcp

    shop = _mcp.build_shop_server(host, 8200)
    try:
        merchant = _mcp.build_merchant_server(host, 8201)
    except RuntimeError as error:
        logger.warning("Bỏ mount MCP merchant: %s", error)
        merchant = None
    return shop, merchant
