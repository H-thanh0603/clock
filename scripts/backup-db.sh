#!/usr/bin/env bash
# Backup Postgres ra file timestamp + xoay vòng giữ N bản mới nhất.
# Dùng được cho cả dev (compose thường) lẫn prod (compose prod).
#
# Backup CHƯA KIỂM TRA = CHƯA CÓ BACKUP: mặc định script restore thử
# file vừa backup vào DB scratch (aurel_verify) rồi đếm bảng khớp.
#   ./scripts/backup-db.sh                    # backup + verify, giữ 7 bản
#   ./scripts/backup-db.sh "-f docker-compose.prod.yml --env-file .env.prod" 30
#   VERIFY=0 ./scripts/backup-db.sh            # bỏ verify (chỉ khi gấp)
set -euo pipefail

COMPOSE_ARGS="${1:--f docker-compose.yml}"
KEEP="${2:-7}"
VERIFY="${VERIFY:-1}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DIR="backups"
mkdir -p "$DIR"
FILE="$DIR/aurel-$STAMP.sql.gz"

# shellcheck disable=SC2086
docker compose $COMPOSE_ARGS exec -T db \
  pg_dump -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-aurel}" \
  | gzip > "$FILE"

echo "Đã backup: $FILE ($(du -h "$FILE" | cut -f1))"

# ── Verify: backup chưa restore thử thì chưa có backup. ──────────────
if [ "$VERIFY" = "1" ]; then
  VERIFY_DB="${POSTGRES_DB:-aurel}_verify_$$"
  # shellcheck disable=SC2086
  trap 'docker compose '"$COMPOSE_ARGS"' exec -T db psql -U "${POSTGRES_USER:-postgres}" -c "DROP DATABASE IF EXISTS \"'"$VERIFY_DB"'\";" >/dev/null 2>&1 || true' EXIT
  # shellcheck disable=SC2086
  docker compose $COMPOSE_ARGS exec -T db \
    psql -U "${POSTGRES_USER:-postgres}" -c "CREATE DATABASE \"$VERIFY_DB\";" >/dev/null
  # shellcheck disable=SC2086
  gunzip -c "$FILE" | docker compose $COMPOSE_ARGS exec -T db \
    psql -U "${POSTGRES_USER:-postgres}" -d "$VERIFY_DB" -v ON_ERROR_STOP=1 >/dev/null \
    && echo "✅ Verify OK: restore thử $FILE vào $VERIFY_DB thành công" \
    || { echo "❌ VERIFY THẤT BẠI: backup $FILE KHÔNG restore được!"; exit 1; }
  # So sánh số bảng gốc vs bản restore.
  # shellcheck disable=SC2086
  count_tables() {
    docker compose $COMPOSE_ARGS exec -T db psql -U "${POSTGRES_USER:-postgres}" -d "$1" -tAc \
      "SELECT count(*) FROM pg_tables WHERE schemaname='public';"
  }
  ORIG=$(count_tables "${POSTGRES_DB:-aurel}")
  RESTORED=$(count_tables "$VERIFY_DB")
  [ "$ORIG" = "$RESTORED" ] \
    && echo "✅ Bảng khớp: $RESTORED/$ORIG" \
    || { echo "❌ Lệch số bảng: restore $RESTORED vs gốc $ORIG"; exit 1; }
fi

# Xoay vòng: chỉ giữ KEEP bản mới nhất.
ls -1t "$DIR"/aurel-*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
echo "Giữ $KEEP bản mới nhất trong $DIR/"

echo "Khôi phục khi cần:"
echo "  ./scripts/restore-db.sh $FILE${COMPOSE_ARGS:+ \"$COMPOSE_ARGS\"}"
