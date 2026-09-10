#!/usr/bin/env bash
# Khôi phục Postgres từ file backup .sql.gz của backup-db.sh.
#
# MẶC ĐỊNH LÀ GÕ SẠCH DB RỒI RESTORE — chỉ chạy khi chắc chắn!
# Nên restore thử vào DB/dev container trước khi đụng prod.
#
#   ./scripts/restore-db.sh backups/aurel-20260907-020000.sql.gz
#   ./scripts/restore-db.sh backups/aurel-20260907-020000.sql.gz "-f docker-compose.prod.yml --env-file .env.prod"
#
# Sau restore: nếu schema backup cũ hơn code thì chạy migrate deploy ngay.
set -euo pipefail

FILE="${1:?Cần đường dẫn file backup .sql.gz (vd backups/aurel-...sql.gz)}"
COMPOSE_ARGS="${2:--f docker-compose.yml}"

[ -f "$FILE" ] || { echo "Không thấy file: $FILE" >&2; exit 1; }

echo "⚠️  Sẽ XÓA dữ liệu hiện tại trong DB và restore từ:"
echo "    $FILE"
read -r -p "Nhập DELETE để xác nhận: " CONFIRM
[ "$CONFIRM" = "DELETE" ] || { echo "Hủy."; exit 1; }

# shellcheck disable=SC2086
docker compose $COMPOSE_ARGS exec -T db psql -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-aurel}" <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
SQL

# shellcheck disable=SC2086
gunzip -c "$FILE" | docker compose $COMPOSE_ARGS exec -T db \
  psql -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-aurel}"

echo "✅ Restore xong. Kiểm tra đếm đơn/user,"
echo "   rồi nếu schema backup cũ hơn code: npx prisma migrate deploy"
