# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Các đường dẫn chuẩn của phần agent (data, memory store, vendor).

Tách riêng để import không kéo theo dotenv/httpx (dùng được từ test).
"""

from __future__ import annotations

from pathlib import Path

AGENT_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = AGENT_DIR.parent

# Nơi memory store + dữ liệu runtime sống. agent/data/ đã .gitignore.
DATA_DIR = AGENT_DIR / "data"
MEMORY_STORE_FILE = DATA_DIR / "memory-store.json"
# Transcript chat theo session + staged-change ledger (persist qua restart).
SESSIONS_DIR = DATA_DIR / "sessions"
LEDGER_FILE = DATA_DIR / "ledger-merchant.json"
# Proactive: alert feed + watch khách + handoff tickets.
ALERTS_FILE = DATA_DIR / "alerts.json"
WATCHES_FILE = DATA_DIR / "watches.json"
TICKETS_FILE = DATA_DIR / "tickets.json"
# Task store (việc khách giao rồi đi — G2-5).
TASKS_FILE = DATA_DIR / "tasks.json"
# AI Activity Log: tool-call nào, của ai/session nào, ok/fail, bao lâu.
# Ghi bởi adapter (pool + AurelMerchant) khi host wire vào ở lifespan.
ACTIVITY_FILE = DATA_DIR / "activity.jsonl"

# vendor/ chứa 5 package của commerce-agents (đã pin trong requirements)
VENDOR_DIR = AGENT_DIR / "vendor"
SHOPPING_SKILLS = VENDOR_DIR / "shopping-agent" / "skills"
MERCHANT_SKILLS = VENDOR_DIR / "merchant-agent" / "skills"

__all__ = [
    "AGENT_DIR",
    "REPO_ROOT",
    "DATA_DIR",
    "MEMORY_STORE_FILE",
    "SESSIONS_DIR",
    "LEDGER_FILE",
    "ACTIVITY_FILE",
    "ALERTS_FILE",
    "TASKS_FILE",
    "ALERTS_FILE",
    "WATCHES_FILE",
    "TICKETS_FILE",
    "VENDOR_DIR",
    "SHOPPING_SKILLS",
    "MERCHANT_SKILLS",
]
