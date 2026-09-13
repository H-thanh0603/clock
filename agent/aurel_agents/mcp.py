# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""MCP servers cho Managed Agents path: expose Aurel backends thật qua MCP.

- Shop: ``python -m aurel_agents.mcp shop`` → 127.0.0.1:8200/mcp
- Merchant: ``python -m aurel_agents.mcp merchant`` → 127.0.0.1:8201/mcp

Managed agent (hosted) trỏ vào URL này; approval của merchant path là
platform ``always_ask`` trên ``apply_change`` nên config ở đây set
``require_host_approval=False`` (đúng hợp đồng vendor).
"""

from __future__ import annotations

import argparse
import asyncio
import sys


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
    )
    await client.ensure_session()
    return AurelMerchant(client), client, build_merchant_config(settings)


def build_shop_server(host: str = "127.0.0.1", port: int = 8200):
    """FastMCP storefront server trên catalog/cart/orders thật của clock."""
    import sys as _sys

    from commerce_common.memory import JsonFileMemoryStore

    from aurel_agents.config import build_shopping_config, get_settings
    from aurel_agents.paths import DATA_DIR

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
    backend, _client = asyncio.run(_shop_backend())
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return build_server(
        backend=backend,
        memory_store=JsonFileMemoryStore(DATA_DIR / "shop-mcp-memory.json"),
        config=build_shopping_config(settings),
        host=host,
        port=port,
    )


def build_merchant_server(host: str = "127.0.0.1", port: int = 8201):
    """FastMCP merchant server trên admin API thật của clock."""
    import sys as _sys

    from commerce_common.memory import JsonFileMemoryStore

    from aurel_agents.paths import DATA_DIR

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

    backend, _client, base_config = asyncio.run(_merchant_backend())
    cfg = base_config.model_copy(
        update={
            "brand_name": "Aurel & Co.",
            "require_host_approval": False,
            "stage_shows_preview": False,
        }
    )
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return build_server(
        backend=backend,
        memory_store=JsonFileMemoryStore(DATA_DIR / "merchant-mcp-memory.json"),
        config=cfg,
        host=host,
        port=port,
    )


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
            warning="Aurel storefront MCP: không auth — chỉ bind loopback / gateway riêng.",
        )
    else:
        host = args.host or "127.0.0.1"
        port = args.port or 8201
        run(
            build_merchant_server(host, port),
            url=f"http://{host}:{port}/mcp",
            warning="Aurel merchant MCP: stage/apply chạm dữ liệu thật — chỉ bind loopback / gateway riêng.",
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
