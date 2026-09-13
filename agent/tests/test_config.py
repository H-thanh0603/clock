# Copyright 2026 — Aurel & Co. đồ án clock
# SPDX-License-Identifier: MIT
"""Test provider abstraction: 2 kiểu auth (x-api-key vs bearer), base_url,
cấu hình đọc từ env.
"""

from __future__ import annotations

from aurel_agents.config import Settings, build_anthropic_client


def test_x_api_key_default():
    """Mặc định: SDK gửi header x-api-key (chuẩn Anthropic, DeepSeek, z.ai...)."""
    s = Settings(api_key="sk-test", base_url="https://api.deepseek.com/anthropic")
    client = build_anthropic_client(s)
    assert client.api_key == "sk-test"
    assert client.auth_token is None
    assert str(client.base_url).startswith("https://api.deepseek.com/anthropic")
    # header thật SDK sẽ build cho request
    from anthropic._models import FinalRequestOptions

    headers = client._build_headers(FinalRequestOptions(method="POST", url="/x"))
    assert headers["x-api-key"] == "sk-test"
    assert "authorization" not in headers


def test_bearer_for_openrouter():
    """AGENT_AUTH_HEADER=bearer → SDK gửi Authorization: Bearer (OpenRouter)."""
    s = Settings(
        api_key="sk-or-test",
        base_url="https://openrouter.ai/api/v1",
        auth_header="bearer",
    )
    client = build_anthropic_client(s)
    assert client.auth_token == "sk-or-test"
    assert str(client.base_url).startswith("https://openrouter.ai/api/v1")
    from anthropic._models import FinalRequestOptions

    headers = client._build_headers(FinalRequestOptions(method="POST", url="/x"))
    assert headers["authorization"] == "Bearer sk-or-test"
    assert "x-api-key" not in headers


def test_no_key_no_base_url():
    """Không key → client vẫn tạo được (health OK, chat mới 503)."""
    client = build_anthropic_client(Settings())
    assert client.api_key is None
