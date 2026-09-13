# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Cấu hình + provider abstraction cho agent host.

Provider: dùng SDK Anthropic chuẩn nhưng trỏ ``base_url`` sang gateway tương
 thích (z.ai, OpenRouter, LiteLLM, Bedrock/Vertex proxy...). Không phụ thuộc
 key Anthropic trực tiếp — chỉ cần 1 endpoint nói đúng Messages API.

Env (xem agent/.env.example):
- AGENT_BASE_URL / AGENT_API_KEY / AGENT_MODEL
- AUREL_BACKEND_URL, AGENT_SHOPPER_*, AGENT_ADMIN_*
- AGENT_HOST / AGENT_PORT
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

from aurel_agents.paths import (
    AGENT_DIR,
    MERCHANT_SKILLS,
    REPO_ROOT,
    SHOPPING_SKILLS,
    VENDOR_DIR,
)

# Back-compat: các hằng đường dẫn đã chuyển sang aurel_agents.paths
# (import ở trên để dùng trực tiếp; __all__ giữ tên cho code cũ).


def _load_env() -> None:
    load_dotenv(AGENT_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    """Toàn bộ cấu hình agent, đọc 1 lần khi khởi động."""

    # provider
    base_url: str | None = None
    api_key: str | None = None
    model: str = "claude-sonnet-5"
    # "x-api-key" (chuẩn Anthropic/DeepSeek/z.ai...) hoặc "bearer"
    # (OpenRouter, một số gateway khác)
    auth_header: str = "x-api-key"

    # backend clock
    backend_url: str = "http://localhost:4000"
    frontend_url: str = "http://localhost:3100"

    # tài khoản demo
    shopper_email: str = "agent-shopper@aurel.local"
    shopper_password: str = "AgentShopper1!"
    admin_email: str = "admin@aurel.local"
    admin_password: str = "Admin123!"

    # host
    host: str = "127.0.0.1"
    port: int = 8100

    # prod-hardening (optional, bỏ trống = tắt để tương thích dev cũ)
    # AGENT_MERCHANT_TOKEN: nếu đặt, /merchant/* yêu cầu header x-agent-token.
    merchant_token: str | None = None
    # Rate limit chat: số request/phút/IP (0 = tắt).
    chat_rate_limit_per_min: int = 60
    # Budget model mỗi round (upstream mặc định 2048 — thinking + reply chung).
    # Model suy luận dài (reasoning) qua gateway nên đặt 8192+.
    max_tokens: int = 2048
    request_timeout_s: float = 120.0

    # Proactive monitor: interval vòng quét nền (giây, 0 = tắt).
    # Watch khách + merchant scan + ticket handoff chạy trên vòng này.
    monitor_interval_s: int = 300
    # Retention: transcript/watches/tickets cũ hơn (giây) bị dọn mỗi vòng
    # quét — 0 = giữ vĩnh viễn (khuyến nghị đặt ở prod: hội thoại khách
    # là dữ liệu cá nhân, không nên nằm vô hạn trên disk).
    retention_days: int = 30
    # Budget chat: số turn mỗi chat-session/ngày (midnight reset, 0 = tắt).
    # Chống 1 user/cú script đốt token LLM qua vòng tool-call 8 lần/turn.
    chat_turns_per_day: int = 100

    @classmethod
    def from_env(cls) -> Settings:
        _load_env()
        return cls(
            base_url=os.getenv("AGENT_BASE_URL") or None,
            api_key=os.getenv("AGENT_API_KEY") or None,
            model=os.getenv("AGENT_MODEL") or "claude-sonnet-5",
            auth_header=(os.getenv("AGENT_AUTH_HEADER") or "x-api-key").lower(),
            backend_url=os.getenv("AUREL_BACKEND_URL") or "http://localhost:4000",
            frontend_url=os.getenv("AUREL_FRONTEND_URL") or "http://localhost:3100",
            shopper_email=os.getenv("AGENT_SHOPPER_EMAIL") or "agent-shopper@aurel.local",
            shopper_password=os.getenv("AGENT_SHOPPER_PASSWORD") or "AgentShopper1!",
            admin_email=os.getenv("AGENT_ADMIN_EMAIL") or "admin@aurel.local",
            admin_password=os.getenv("AGENT_ADMIN_PASSWORD") or "Admin123!",
            host=os.getenv("AGENT_HOST") or "127.0.0.1",
            port=int(os.getenv("AGENT_PORT") or 8100),
            merchant_token=os.getenv("AGENT_MERCHANT_TOKEN") or None,
            chat_rate_limit_per_min=int(os.getenv("AGENT_CHAT_RATE_LIMIT_PER_MIN") or 60),
            max_tokens=int(os.getenv("AGENT_MAX_TOKENS") or 2048),
            request_timeout_s=float(os.getenv("AGENT_REQUEST_TIMEOUT_S") or 120.0),
            monitor_interval_s=int(os.getenv("AGENT_MONITOR_INTERVAL_S") or 300),
            retention_days=int(os.getenv("AGENT_RETENTION_DAYS") or 30),
            chat_turns_per_day=int(os.getenv("AGENT_CHAT_TURNS_PER_DAY") or 100),
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()


def build_anthropic_client(settings: Settings | None = None):
    """AsyncAnthropic trỏ tới gateway tương thích Anthropic Messages API.

    Hỗ trợ 2 kiểu auth phổ biến (tự chọn theo AGENT_AUTH_HEADER):

    - ``x-api-key`` (mặc định, chuẩn Anthropic): DeepSeek
      (``AGENT_BASE_URL=https://api.deepseek.com/anthropic``), z.ai, Bedrock/
      Vertex proxy, LiteLLM...
    - ``bearer`` (Authorization: Bearer): OpenRouter
      (``AGENT_BASE_URL=https://openrouter.ai/api/v1``) — endpoint /v1/messages
      có thật nhưng chỉ chấp nhận Bearer token.

    Không set AGENT_BASE_URL → dùng api.anthropic.com mặc định.
    """
    from anthropic import AsyncAnthropic

    s = settings or get_settings()
    kwargs: dict = {"timeout": 60.0}
    if s.api_key:
        if s.auth_header == "bearer":
            kwargs["auth_token"] = s.api_key  # SDK gửi Authorization: Bearer
        else:
            kwargs["api_key"] = s.api_key  # SDK gửi x-api-key
    if s.base_url:
        kwargs["base_url"] = s.base_url
    return AsyncAnthropic(**kwargs)


def build_shopping_config(settings: Settings | None = None):
    """ShoppingAgentConfig cho Aurel (định danh + domain notes đồng hồ)."""
    from shopping_agent import ShoppingAgentConfig

    s = settings or get_settings()
    return ShoppingAgentConfig(
        brand_name="Aurel & Co.",
        assistant_name="Concierge Aurel",
        brand_voice="warm, concise, plain about trade-offs; answers in Vietnamese unless the customer writes another language",
        model=s.model,
        max_tokens=s.max_tokens,
        request_timeout_s=s.request_timeout_s,
        domain_search_notes=(
            "Domain: đồng hồ cơ cao cấp. Filter dimensions: collection "
            "(Chronos, Meridian, ...) qua filters.category; material qua "
            "filters.attributes['material'] (Rose Gold, Titanium, ...); "
            "movement qua filters.attributes['movement'] (tourbillon, chrono, "
            "...); kích cỡ qua filters.attributes['size']; complication qua "
            "filters.attributes['complication']. Giá là USD/VND cố định "
            "theo tỷ lệ nội bộ, không mặc cả."
        ),
        enable_cart=True,
        enable_orders=True,
        enable_policies=True,
        enable_fulfillment=True,
    )


def build_merchant_config(settings: Settings | None = None):
    """MerchantAgentConfig cho Aurel."""
    from merchant_agent import MerchantAgentConfig

    s = settings or get_settings()
    return MerchantAgentConfig(
        brand_name="Aurel & Co.",
        model=s.model,
        max_tokens=s.max_tokens,
        request_timeout_s=s.request_timeout_s,
    )


__all__ = [
    "Settings",
    "get_settings",
    "build_anthropic_client",
    "build_shopping_config",
    "build_merchant_config",
    "VENDOR_DIR",
    "SHOPPING_SKILLS",
    "MERCHANT_SKILLS",
    "REPO_ROOT",
    "AGENT_DIR",
]
