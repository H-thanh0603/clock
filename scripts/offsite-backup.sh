#!/usr/bin/env bash
# Đẩy backup mới nhất ra offsite (rclone remote) — chạy sau db-backup 02:00.
# Backup cùng ổ đĩa với DB thì mất ổ là mất cả hai: script này là lớp 2.
#
#   1. Cài rclone + cấu hình remote 1 lần: rclone config (đặt tên remote, vd "b2")
#   2. Điền OFFSITE_REMOTE="b2:aurel-backups" vào .env.prod
#   3. Cron trên VPS (sau giờ backup 02:00):
#        0 3 * * * /opt/clock/scripts/offsite-backup.sh
#
# Không cấu hình remote = bỏ qua êm (exit 0) — không làm fail cron.
set -euo pipefail

REMOTE="${OFFSITE_REMOTE:-}"
if [ -z "$REMOTE" ] && [ -f .env.prod ]; then
  REMOTE=$(grep -E '^OFFSITE_REMOTE=' .env.prod | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' ' || true)
fi

if [ -z "$REMOTE" ]; then
  echo "OFFSITE_REMOTE chưa đặt — bỏ qua offsite (backup local vẫn giữ nguyên)."
  exit 0
fi
if ! command -v rclone >/dev/null 2>&1; then
  echo "Chưa cài rclone — cài rồi chạy lại (backup local vẫn an toàn)." >&2
  exit 1
fi

LATEST=$(ls -1t backups/aurel-*.sql.gz 2>/dev/null | head -1 || true)
if [ -z "$LATEST" ]; then
  echo "Không có file backup nào trong backups/." >&2
  exit 1
fi

rclone copyto "$LATEST" "$REMOTE/$(basename "$LATEST")" --progress=false
echo "Offsite OK: $LATEST -> $REMOTE/"
rclone lsf "$REMOTE/" | head -20
