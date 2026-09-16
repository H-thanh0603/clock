#!/usr/bin/env bash
# Chạy fuzz adversarial cho model/gateway hiện tại (tốn token THẬT).
# Xem docs/MODEL-CHANGE-CHECKLIST.md — chạy tay trước mỗi lần đổi model.
set -euo pipefail
cd "$(dirname "$0")/.."

# Đọc agent/.env nếu có (không commit file này).
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "${AGENT_API_KEY:-}" ]; then
  echo "❌ Thiếu AGENT_API_KEY — điền vào agent/.env (copy từ .env.example) rồi chạy lại." >&2
  echo "   Fuzz gọi LLM thật nên không có key là không chạy được (cố ý)." >&2
  exit 2
fi

echo "▶ Fuzz model ${AGENT_MODEL:-<mặc định>} qua ${AGENT_BASE_URL:-api.anthropic.com} ..."
source .venv/bin/activate 2>/dev/null || true
python -m pytest -m fuzz -q
echo "✅ Fuzz xong — ghi kết quả vào docs/MODEL-CHANGE-CHECKLIST.md"
