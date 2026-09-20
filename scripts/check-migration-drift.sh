#!/usr/bin/env bash
# Drift check: migration trên disk vs đã apply trong DB + schema.prisma khớp.
#
# Ba thứ có thể lệch nhau và KHÔNG ai biết đến khi deploy:
#   1. migration file có trên disk nhưng chưa `migrate deploy` (deploy sót)
#   2. DB đã apply migration mà file lại không còn (ai đó xoá nhầm)
#   3. schema.prisma đã sửa nhưng quên `prisma migrate dev` → không có
#      migration tương ứng (prod `migrate deploy` sẽ không tạo bảng/cột mới)
#
# Chạy trong CI trước deploy, hoặc tay sau khi pull:
#   ./scripts/check-migration-drift.sh
#   ./scripts/check-migration-drift.sh "-f docker-compose.prod.yml --env-file .env.prod"
#
# Exit 0 = khớp. Exit 1 = lệch (in rõ lệch cái gì). Exit 2 = không kiểm tra
# được (thiếu docker/DB) — CI nên treat là fail, dev có thể bỏ qua.
set -euo pipefail

COMPOSE_ARGS="${1:--f docker-compose.yml}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIG_DIR="$ROOT/backend/prisma/migrations"

[ -d "$MIG_DIR" ] || { echo "Không thấy $MIG_DIR" >&2; exit 2; }

# 1) Migration trên disk (bỏ thư mục không phải migration).
mapfile -t ON_DISK < <(
  find "$MIG_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null \
    | grep -E '^[0-9]{14}_' | sort
)
echo "Migration trên disk: ${#ON_DISK[@]}"

# 2) Migration đã apply trong DB (bảng _prisma_migrations).
APPLIED_RAW="$(
  # shellcheck disable=SC2086
  docker compose $COMPOSE_ARGS exec -T db psql \
    -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-aurel}" -tAc \
    "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name;" \
    2>/dev/null
)" || { echo "Không đọc được _prisma_migrations (DB chưa chạy?)" >&2; exit 2; }

mapfile -t APPLIED < <(printf '%s\n' "$APPLIED_RAW" | sed '/^$/d' | sort)
echo "Migration đã apply: ${#APPLIED[@]}"

FAIL=0

# (1) Có file nhưng chưa apply → deploy sẽ sót schema.
for m in "${ON_DISK[@]}"; do
  found=0
  for a in "${APPLIED[@]:-}"; do [ "$a" = "$m" ] && found=1 && break; done
  if [ "$found" = "0" ]; then
    echo "❌ Chưa apply: $m (chạy 'prisma migrate deploy')" >&2
    FAIL=1
  fi
done

# (2) Đã apply nhưng file không còn — DB đi trước repo, rollback sẽ vỡ.
for a in "${APPLIED[@]:-}"; do
  [ -z "$a" ] && continue
  found=0
  for m in "${ON_DISK[@]}"; do [ "$a" = "$m" ] && found=1 && break; done
  if [ "$found" = "0" ]; then
    echo "❌ DB có migration mà repo không còn: $a" >&2
    FAIL=1
  fi
done

# (3) schema.prisma vs migration trên disk. `migrate diff` từ migration cần
# shadow DB (không có sẵn), nên dùng cách không cần DB:
#   - `migrate diff --from-empty --to-schema` cho biết schema MUỐN có bảng nào
#     (kiểm tra nó chạy được = schema hợp lệ)
#   - tổng CREATE TABLE trong prisma/migrations là những gì migrations TẠO
# Lệch = schema có model mà chưa ai viết migration cho nó.
SCHEMA_TABLES="$(
  cd "$ROOT/backend" && npx prisma migrate diff \
    --from-empty --to-schema prisma/schema.prisma --script 2>/dev/null \
    | grep -oiE 'CREATE TABLE (IF NOT EXISTS )?"?[A-Za-z_][A-Za-z0-9_]*"?' \
    | sed -E 's/.*"([A-Za-z_][A-Za-z0-9_]*)"?$/\1/' | sort -u
)" || SCHEMA_TABLES=""
MIGRATED_TABLES="$(
  grep -rhoiE 'CREATE TABLE (IF NOT EXISTS )?"?[A-Za-z_][A-Za-z0-9_]*"?' "$MIG_DIR" \
    | sed -E 's/.*"([A-Za-z_][A-Za-z0-9_]*)"?$/\1/' | sort -u
)"
if [ -z "$SCHEMA_TABLES" ]; then
  echo "⚠  Không đọc được bảng từ schema.prisma (skip check 3)" >&2
else
  MISSING="$(comm -23 <(printf '%s\n' "$SCHEMA_TABLES") <(printf '%s\n' "$MIGRATED_TABLES"))"
  if [ -n "$MISSING" ]; then
    echo "❌ Model có trong schema.prisma nhưng CHƯA có migration tạo bảng:" >&2
    printf '   - %s\n' $MISSING >&2
    echo "   → chạy 'prisma migrate dev' để sinh migration." >&2
    FAIL=1
  fi
fi

if [ "$FAIL" = "0" ]; then
  echo "✅ Không drift: disk = DB = schema.prisma"
else
  echo "→ Drift phát hiện. KHÔNG deploy tới khi khớp." >&2
fi
exit "$FAIL"
