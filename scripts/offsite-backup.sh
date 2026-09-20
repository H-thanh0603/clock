#!/usr/bin/env bash
# Đẩy backup mới nhất ra offsite (rclone remote) — chạy sau db-backup 02:00.
# Backup cùng ổ đĩa với DB thì mất ổ là mất cả hai: script này là lớp 2.
#
#   1. Cài rclone + cấu hình remote 1 lần: rclone config (đặt tên remote, vd "b2")
#   2. Điền OFFSITE_REMOTE="b2:aurel-backups" vào .env.prod
#      (và tuỳ chọn OFFSITE_KEEP=30 — số ngày giữ bản trên remote)
#   3. Cron trên VPS (sau giờ backup 02:00):
#        0 3 * * * /opt/clock/scripts/offsite-backup.sh
#
# Compose prod có sidecar `db-offsite` làm đúng việc này (khuyến nghị, không
# phụ thuộc crontab). Script này dùng cho máy không chạy compose / chạy tay.
#
# Không cấu hình remote = bỏ qua êm (exit 0) — không làm fail cron.
set -euo pipefail

REMOTE="${OFFSITE_REMOTE:-}"
KEEP_DAYS="${OFFSITE_KEEP:-30}"
if [ -f .env.prod ]; then
  _read_env() { grep -E "^$1=" .env.prod | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' ' || true; }
  [ -n "$REMOTE" ] || REMOTE=$(_read_env OFFSITE_REMOTE)
  KEEP_DAYS=$([ -n "${OFFSITE_KEEP:-}" ] && echo "$KEEP_DAYS" || _read_env OFFSITE_KEEP)
fi
KEEP_DAYS=${KEEP_DAYS:-30}

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

# Verify: size remote phải khớp local — đẩy nửa vời là backup hỏng.
# `lsl` in "<size> <date> <time> <name>" → lấy cột 1.
REMOTE_SIZE=$(rclone lsl "$REMOTE/$(basename "$LATEST")" 2>/dev/null | awk 'NR==1{print $1}')
LOCAL_SIZE=$(stat -c %s "$LATEST" 2>/dev/null || stat -f %z "$LATEST")
if [ -z "$REMOTE_SIZE" ] || [ "$REMOTE_SIZE" != "$LOCAL_SIZE" ]; then
  echo "SIZE LỆCH remote=$REMOTE_SIZE local=$LOCAL_SIZE — KIỂM TRA BACKUP OFFSITE!" >&2
  exit 1
fi
echo "Offsite OK + verified: $LATEST ($LOCAL_SIZE bytes) -> $REMOTE/"

# Giữ vòng đời remote dài hơn local (local 14 bản ~2 tuần, remote $KEEP_DAYS
# ngày) — bảo vệ khi dữ liệu hỏng âm thầm đã lan vào cả bản local.
rclone delete "$REMOTE/" --min-age "${KEEP_DAYS}d" 2>/dev/null || true
rclone lsf "$REMOTE/" | head -20
