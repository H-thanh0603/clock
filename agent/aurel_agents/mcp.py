# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""MCP servers cho Managed Agents path: expose Aurel backends thật qua MCP.

- Shop: ``python -m aurel_agents.mcp shop`` → 127.0.0.1:8200/mcp
  (catalog/giỏ công khai — như API public của BE, không token).
- Merchant: ``python -m aurel_agents.mcp merchant`` → 127.0.0.1:8201/mcp
  (ghi tiền/kho thật → token gate ``x-agent-token`` của ``mcp_auth`` +
  approval từng ``apply_change`` — mở port vẫn không mở dữ liệu).

Prod: KHÔNG chạy 2 process rời. Agent host mount 2 server này qua ASGI
(``mount_mcp``) và public qua ``/mcp/*`` sau Caddy — 1 process duy nhất,
đúng single-instance guard của store JSON. Dev vẫn chạy rời từng cái được.
"""

from __future__ import annotations

import argparse
import asyncio
import sys


def _await_sync(coro):
    """Chạy coroutine cả khi đang trong event loop (lifespan mount) lẫn
    ngoài (CLI chạy rời). Trong loop → chạy trên loop hiện tại qua run_until
    kiểu an toàn bằng cách tạo task + chờ; ngoài loop → asyncio.run."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    # Đang trong loop (lifespan): không được block loop bằng run_until_complete
    # trực tiếp. Dùng thread riêng chạy loop mới — backend ClockClient là
    # httpx độc lập nên an toàn.
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


async def _shop_backend():
    from aurel_agents.clock_client import ClockClient
    from aurel_agents.config import get_settings
    from aurel_agents.shopping.backend import AurelStorefront

    settings = get_settings()
    client = ClockClient(
        settings.backend_url,
        settings.shopper_email,
        settings.shopper_password,
        register_if_new=True,
    )
    await client.ensure_session()
    return AurelStorefront(client), client


async def _merchant_backend():
    from aurel_agents.clock_client import ClockClient
    from aurel_agents.config import build_merchant_config, get_settings
    from aurel_agents.merchant.backend import AurelMerchant

    settings = get_settings()
    client = ClockClient(
        settings.backend_url,
        settings.admin_email,
        settings.admin_password,
        register_if_new=False,
        actor="agent/merchant",
    )
    await client.ensure_session()
    return AurelMerchant(client), client, build_merchant_config(settings)




def _test_data_dir():
    """DATA_DIR của host khi test patch (TestClient không qua process riêng).

    host.py bind ``DATA_DIR`` lúc import nên patch ``host.DATA_DIR`` trong
    test không lan sang ``paths.DATA_DIR`` mà mcp.py đang dùng. Đọc từ host
    để test mount host dùng lock/store riêng, không đụng data thật.
    """
    try:
        from aurel_agents import host as _host

        return _host.DATA_DIR
    except Exception:
        return None

def build_shop_server(host: str = "127.0.0.1", port: int = 8200):
    """FastMCP storefront server trên catalog/cart/orders thật của clock.

    Shop là catalog/giỏ công khai → không gắn token gate (giữ đúng hành vi
    cũ). Merchant (ghi tiền/kho) thì LUÔN qua ``_token_gate`` — xem
    ``build_merchant_server``.
    """
    import sys as _sys

    from aurel_agents.config import build_shopping_config, get_settings
    from aurel_agents.memory_store import LockedJsonFileMemoryStore
    from aurel_agents.paths import DATA_DIR as _REAL_DATA_DIR

    vendor_mcp = (
        __import__("pathlib").Path(__file__).resolve().parent.parent
        / "vendor"
        / "shopping-agent"
        / "managed-agents"
        / "storefront-mcp-server"
    )
    if str(vendor_mcp) not in _sys.path:
        _sys.path.insert(0, str(vendor_mcp))
    from storefront_mcp_server import build_server

    settings = get_settings()
    backend, _client = _await_sync(_shop_backend())
    _data_dir = _test_data_dir() or _REAL_DATA_DIR
    _data_dir.mkdir(parents=True, exist_ok=True)
    return build_server(
        backend=backend,
        memory_store=LockedJsonFileMemoryStore(_data_dir / "shop-mcp-memory.json"),
        config=build_shopping_config(settings),
        host=host,
        port=port,
    )


def build_merchant_server(host: str = "127.0.0.1", port: int = 8201, token: str | None = None):
    """FastMCP merchant server trên admin API thật của clock.

    Token gate: mọi tool call phải kèm header ``x-agent-token`` khớp
    ``token`` (mặc định đọc ``AGENT_MERCHANT_TOKEN``). Sai/thiếu → 401 trước
    khi tool chạy. Không có token cấu hình → server từ chối khởi động
    (fail-closed, đúng tinh thần AGENT_REQUIRE_MERCHANT_TOKEN của host).

    Gate bọc 1 lần duy nhất cho cả process (idempotent trong ``mcp_auth``)
    vì vendor ``ConnectionExecutors.call`` là singleton module-level — test
    chạy nhiều token khác nhau phải dùng process/lifespan riêng.
    """
    from aurel_agents import mcp_auth

    resolved = token if token is not None else mcp_auth.merchant_token_from_env()
    if not resolved:
        raise RuntimeError(
            "Merchant MCP cần AGENT_MERCHANT_TOKEN — từ chối khởi động "
            "để không mở endpoint ghi tiền/kho ra ngoài."
        )
    # Idempotent: lifespan mount gọi nhiều lần (mỗi TestClient 1 lần) không
    # được bọc gate chồng gate — bọc 2 lớp vẫn đúng nhưng log rác + chậm.
    mcp_auth.attach_token_gate(resolved)
    import sys as _sys

    from aurel_agents.memory_store import LockedJsonFileMemoryStore
    from aurel_agents.paths import DATA_DIR as _REAL_DATA_DIR

    vendor_mcp = (
        __import__("pathlib").Path(__file__).resolve().parent.parent
        / "vendor"
        / "merchant-agent"
        / "managed-agents"
        / "merchant-mcp-server"
    )
    if str(vendor_mcp) not in _sys.path:
        _sys.path.insert(0, str(vendor_mcp))
    from merchant_mcp_server import build_server

    backend, _client, base_config = _await_sync(_merchant_backend())
    cfg = base_config.model_copy(
        update={
            "brand_name": "Aurel & Co.",
            "require_host_approval": False,
            "stage_shows_preview": False,
        }
    )
    _data_dir = _test_data_dir() or _REAL_DATA_DIR
    _data_dir.mkdir(parents=True, exist_ok=True)
    server = build_server(
        backend=backend,
        memory_store=LockedJsonFileMemoryStore(_data_dir / "merchant-mcp-memory.json"),
        config=cfg,
        host=host,
        port=port,
    )
    # /health KHÔNG qua gate (Caddy/docker healthcheck không có token).
    mcp_auth.attach_health_route(server)
    return server


def main(argv: list[str] | None = None) -> int:
    from commerce_common.mcp_server import run

    parser = argparse.ArgumentParser(description="Aurel MCP servers for Managed Agents")
    parser.add_argument("role", choices=["shop", "merchant"])
    parser.add_argument("--host", default=None)
    parser.add_argument("--port", type=int, default=None)
    args = parser.parse_args(argv)
    if args.role == "shop":
        host = args.host or "127.0.0.1"
        port = args.port or 8200
        run(
            build_shop_server(host, port),
            url=f"http://{host}:{port}/mcp",
            warning="Aurel storefront MCP: catalog/giỏ công khai (như API public BE).",
        )
    else:
        host = args.host or "127.0.0.1"
        port = args.port or 8201
        run(
            build_merchant_server(host, port),
            url=f"http://{host}:{port}/mcp",
            warning="Aurel merchant MCP: token gate x-agent-token + approval từng apply.",
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
