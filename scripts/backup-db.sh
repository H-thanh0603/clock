#!/usr/bin/env bash
# Backup Postgres ra file timestamp + xoay vòng giữ N bản mới nhất.
# Dùng được cho cả dev (compose thường) lẫn prod (compose prod).
#   ./scripts/backup-db.sh                    # backup 1 lần, giữ 7 bản
#   ./scripts/backup-db.sh "-f docker-compose.prod.yml --env-file .env.prod" 30
set -euo pipefail

COMPOSE_ARGS="${1:--f docker-compose.yml}"
KEEP="${2:-7}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DIR="backups"
mkdir -p "$DIR"
FILE="$DIR/aurel-$STAMP.sql.gz"

# shellcheck disable=SC2086
docker compose $COMPOSE_ARGS exec -T db \
  pg_dump -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-aurel}" \
  | gzip > "$FILE"

echo "Đã backup: $FILE ($(du -h "$FILE" | cut -f1))"

# Xoay vòng: chỉ giữ KEEP bản mới nhất.
ls -1t "$DIR"/aurel-*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "Giữ $KEEP bản mới nhất trong $DIR/"

echo "Khôi phục khi cần:"
echo "  gunzip -c $FILE | docker compose $COMPOSE_ARGS exec -T db psql -U ${POSTGRES_USER:-postgres} ${POSTGRES_DB:-aurel}"
