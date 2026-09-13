# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Console chạy shopping/merchant agent trên Claude Agent SDK path.

Cùng prompt/skills/tools với Messages API path (host.py) nhưng vòng loop do
SDK chạy. Backend là adapter Aurel thật (REST clock), không phải mock ACME.

Chạy::

    python -m aurel_agents.sdk_console shop --once "tourbillon dưới 150k USD còn chiếc nào?"
    python -m aurel_agents.sdk_console merchant --once "tình hình kinh doanh tháng này?"
    python -m aurel_agents.sdk_console shop   # REPL
"""

from __future__ import annotations

import argparse
import asyncio
import contextlib
import json
import sys


async def _make_shop_toolset(session_id: str, user_id: str):
    from shopping_agent_sdk import make_options

    from aurel_agents.clock_client import ClockClient
    from aurel_agents.config import (
        SHOPPING_SKILLS,
        build_shopping_config,
        get_settings,
    )
    from aurel_agents.shopping.backend import AurelStorefront

    settings = get_settings()
    client = ClockClient(
        settings.backend_url,
        settings.shopper_email,
        settings.shopper_password,
        register_if_new=True,
    )
    await client.ensure_session()
    options, toolset = make_options(
        backend=AurelStorefront(client),
        config=build_shopping_config(settings),
        skills_dir=SHOPPING_SKILLS,
        session_id=session_id,
        user_id=user_id,
    )
    return options, toolset, client


async def _make_merchant_toolset(session_id: str, operator: str):
    from merchant_agent_sdk import make_options

    from aurel_agents.clock_client import ClockClient
    from aurel_agents.config import (
        MERCHANT_SKILLS,
        build_merchant_config,
        get_settings,
    )
    from aurel_agents.merchant.backend import AurelMerchant

    settings = get_settings()
    client = ClockClient(
        settings.backend_url,
        settings.admin_email,
        settings.admin_password,
        register_if_new=False,
    )
    await client.ensure_session()
    options, toolset = make_options(
        backend=AurelMerchant(client),
        config=build_merchant_config(settings),
        skills_dir=MERCHANT_SKILLS,
        session_id=session_id,
        merchant_id="aurel",
        operator=operator,
    )
    return options, toolset, client


def _print_result(result) -> None:
    if result.text:
        print(f"\n{result.text}\n")
    for event in result.ui:
        print(f"--- ui:{event['component']} ---")
        print(json.dumps(event["payload"], indent=2, default=str, ensure_ascii=False))
        print()
    if result.tool_calls:
        print(f"[tools: {', '.join(result.tool_calls)}]")
    for error in result.tool_errors:
        print(f"[tool error: {error}]")
    if result.cost_usd is not None:
        print(f"[cost: ${result.cost_usd:.4f}]")


async def _run_once(role: str, prompt: str, session_id: str, user: str) -> int:
    from claude_agent_sdk import ClaudeSDKClient

    if role == "shop":
        from shopping_agent_sdk import run_turn

        options, toolset, client = await _make_shop_toolset(session_id, user)
    else:
        from merchant_agent_sdk import run_turn  # type: ignore[no-redef]

        options, toolset, client = await _make_merchant_toolset(session_id, user)
    try:
        async with ClaudeSDKClient(options=options) as sdk_client:
            result = await run_turn(sdk_client, prompt, toolset=toolset)
            _print_result(result)
    finally:
        await client.aclose()
    return 0


async def _repl(role: str, session_id: str, user: str) -> int:
    from claude_agent_sdk import ClaudeSDKClient

    if role == "shop":
        from shopping_agent_sdk import run_turn

        options, toolset, client = await _make_shop_toolset(session_id, user)
    else:
        from merchant_agent_sdk import run_turn  # type: ignore[no-redef]

        options, toolset, client = await _make_merchant_toolset(session_id, user)
    print(f"Aurel {role} agent (Agent SDK path). Gõ 'exit' để thoát.\n")
    try:
        async with ClaudeSDKClient(options=options) as sdk_client:
            while True:
                try:
                    text = (await asyncio.to_thread(input, "you> ")).strip()
                except (EOFError, KeyboardInterrupt):
                    break
                if not text:
                    continue
                if text.lower() in {"exit", "quit", "q"}:
                    break
                result = await run_turn(sdk_client, text, toolset=toolset)
                _print_result(result)
    finally:
        await client.aclose()
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Aurel agents on the Claude Agent SDK")
    parser.add_argument("role", choices=["shop", "merchant"])
    parser.add_argument("--once", metavar="QUERY", help="chạy 1 query rồi thoát")
    parser.add_argument("--session", default="local-session")
    parser.add_argument("--user", default="demo-user")
    args = parser.parse_args(argv)
    with contextlib.suppress(KeyboardInterrupt):
        if args.once:
            return asyncio.run(_run_once(args.role, args.once, args.session, args.user))
        return asyncio.run(_repl(args.role, args.session, args.user))
    return 0


if __name__ == "__main__":
    sys.exit(main())
