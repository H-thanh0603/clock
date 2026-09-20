#!/usr/bin/env bash
# Test cho scripts/backup-db.sh, restore-db.sh, offsite-backup.sh,
# check-migration-drift.sh.
#
# KHÔNG cần Docker/Postgres thật: chèn `docker` + `rclone` + `psql` giả vào
# PATH để mô phỏng DB/remote. Chạy: ./scripts/tests/run.sh
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

PASS=0
FAIL=0
FAILED_NAMES=()

ok()   { echo "  ✅ $1"; PASS=$((PASS + 1)); }
bad()  { echo "  ❌ $1"; FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); }
check() { # check <desc> <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (mong $2, nhận $3)"; fi
}

# ── Fake bin: docker / rclone ────────────────────────────────────────────
BIN="$SANDBOX/bin"
mkdir -p "$BIN"

# docker giả: ghi lại lệnh, mô phỏng psql tối thiểu cho drift check.
cat > "$BIN/docker" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
case "$*" in
  *"CREATE DATABASE"*)  exit 0;;
  *"DROP DATABASE"*)    exit 0;;
  *pg_dump*)            printf 'PGDUMP:%s\n' "${FAKE_DB_CONTENT:-data}"; exit "${FAKE_PGDUMP_EXIT:-0}";;
  *"DROP SCHEMA"*)      exit 0;;
  *"_prisma_migrations"*) printf '%s\n' "${FAKE_APPLIED:-}"; exit "${FAKE_APPLIED_EXIT:-0}";;
esac
exit 0
FAKE
chmod +x "$BIN/docker"

cat > "$BIN/rclone" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
REMOTE_DIR="${FAKE_REMOTE_DIR:?}"
case "$1" in
  copyto) name="$(basename "$3")"; cat "$2" > "$REMOTE_DIR/$name"; exit 0;;
  lsl)    name="$(basename "$2")"; [ -f "$REMOTE_DIR/$name" ] \
            && echo "$(stat -c %s "$REMOTE_DIR/$name") 2026-09-20 remote" || exit 0;;
  lsf)    ls -1 "$REMOTE_DIR" 2>/dev/null; exit 0;;
  delete) exit 0;;
esac
exit 0
FAKE
chmod +x "$BIN/rclone"

export PATH="$BIN:$PATH"
export FAKE_LOG="$SANDBOX/docker.log"

# psql giả trong PATH cho drift check (đọc _prisma_migrations qua docker).
cat > "$BIN/psql" <<'FAKE'
#!/usr/bin/env bash
exit 0
FAKE
chmod +x "$BIN/psql"

# ── Test 1: backup-db.sh tạo file + xoay vòng ───────────────────────────
echo "▶ backup-db.sh"
WS="$SANDBOX/backup"; mkdir -p "$WS/backups"; cd "$WS" || exit 1
for d in 20260101-020000 20260102-020000 20260103-020000 20260104-020000; do
  echo "old" | gzip > "backups/aurel-$d.sql.gz"
done
# 4 bản cũ + tạo bản mới rồi giữ 3 → tổng chỉ còn 3.
VERIFY=0 "$ROOT/scripts/backup-db.sh" "-f fake" 3 > "$SANDBOX/backup.out" 2>&1
rc=$?
check "chạy thành công (rc=0)" 0 "$rc"
count=$(ls -1 backups/aurel-*.sql.gz | wc -l)
check "xoay vòng còn đúng 3 bản" 3 "$count"
check "có file backup mới sinh" 1 "$(find backups -name "aurel-$(date +%Y%m%d)*.sql.gz" | wc -l)"
if gunzip -t "backups/$(ls -1t backups | head -1)" 2>/dev/null; then
  ok "file mới là gzip hợp lệ"
else
  bad "file mới hỏng gzip"
fi

# ── Test 2: backup-db.sh FAIL khi pg_dump lỗi (không ghi file rác) ──────
echo "▶ backup-db.sh khi pg_dump lỗi"
WS2="$SANDBOX/backup-fail"; mkdir -p "$WS2/backups"; cd "$WS2" || exit 1
export FAKE_PGDUMP_EXIT=1
VERIFY=0 "$ROOT/scripts/backup-db.sh" "-f fake" 3 > "$SANDBOX/backup-fail.out" 2>&1
rc=$?
unset FAKE_PGDUMP_EXIT
check "pg_dump lỗi → rc != 0" 1 "$([ "$rc" != "0" ] && echo 1 || echo 0)"
# Không được để lại file .sql.gz rỗng/hỏng đánh lừa người vận hành.
corrupt=$(find backups -name 'aurel-*.sql.gz' -size 0 2>/dev/null | wc -l)
check "không để lại file rỗng" 0 "$corrupt"

# ── Test 3: verify thất bại khi số bảng lệch ────────────────────────────
echo "▶ backup-db.sh verify lệch số bảng"
WS3="$SANDBOX/verify"; mkdir -p "$WS3/backups"; cd "$WS3" || exit 1
# docker giả: psql đếm bảng trả 2 giá trị khác nhau cho gốc vs restore.
# (verify chạy `psql -d <db> -tAc "SELECT count(*) FROM pg_tables ..."`).
cat > "$BIN/docker" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
case "$*" in
  *pg_dump*) printf 'PGDUMP\n'; exit 0;;
  *"-d "*'_verify_'*"pg_tables"*) echo 5; exit 0;;
  *"pg_tables"*) echo 9; exit 0;;
  *"CREATE DATABASE"*|*"DROP DATABASE"*) exit 0;;
  *"psql"*) exit 0;;
esac
exit 0
FAKE
chmod +x "$BIN/docker"
"$ROOT/scripts/backup-db.sh" "-f fake" 3 > "$SANDBOX/verify.out" 2>&1
rc=$?
check "lệch bảng → rc != 0" 1 "$([ "$rc" != "0" ] && echo 1 || echo 0)"
grep -q "Lệch số bảng" "$SANDBOX/verify.out" && ok "báo rõ lệch số bảng" || bad "không báo lệch bảng"

# khôi phục docker giả mặc định
cat > "$BIN/docker" <<'FAKE'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
case "$*" in
  *"CREATE DATABASE"*)  exit 0;;
  *"DROP DATABASE"*)    exit 0;;
  *pg_dump*)            printf 'PGDUMP:%s\n' "${FAKE_DB_CONTENT:-data}"; exit "${FAKE_PGDUMP_EXIT:-0}";;
  *"DROP SCHEMA"*)      exit 0;;
  *"_prisma_migrations"*) printf '%s\n' "${FAKE_APPLIED:-}"; exit "${FAKE_APPLIED_EXIT:-0}";;
esac
exit 0
FAKE
chmod +x "$BIN/docker"

# ── Test 4: restore-db.sh yêu cầu gõ DELETE ─────────────────────────────
echo "▶ restore-db.sh"
WS4="$SANDBOX/restore"; mkdir -p "$WS4"; cd "$WS4" || exit 1
: > "$FAKE_LOG"
"$ROOT/scripts/restore-db.sh" missing.sql.gz "-f fake" > "$SANDBOX/restore-missing.out" 2>&1
rc=$?
check "file không tồn tại → rc != 0" 1 "$([ "$rc" != "0" ] && echo 1 || echo 0)"
echo "data" | gzip > b.sql.gz
echo "KHONG" | "$ROOT/scripts/restore-db.sh" b.sql.gz "-f fake" > "$SANDBOX/restore-no.out" 2>&1
rc=$?
check "gõ sai xác nhận → hủy (rc != 0)" 1 "$([ "$rc" != "0" ] && echo 1 || echo 0)"
grep -q "Hủy" "$SANDBOX/restore-no.out" && ok "in 'Hủy' khi không xác nhận" || bad "thiếu thông báo hủy"
grep -q "DROP SCHEMA" "$FAKE_LOG" && bad "KHÔNG được xóa DB khi chưa xác nhận" || ok "chưa xác nhận thì không xóa DB"
echo "DELETE" | "$ROOT/scripts/restore-db.sh" b.sql.gz "-f fake" > "$SANDBOX/restore-ok.out" 2>&1
rc=$?
check "xác nhận DELETE → restore chạy (rc=0)" 0 "$rc"

# restore-db.sh đưa SQL xóa schema qua HEREDOC vào psql; docker giả ghi lại
# argv (không thấy nội dung heredoc), nên kiểm tra bằng cách cho psql giả đọc
# stdin. Ở đây kiểm chứng gián tiếp: script phải có bước DROP SCHEMA (source).
if grep -q 'DROP SCHEMA public CASCADE' "$ROOT/scripts/restore-db.sh"; then
  ok "restore có bước DROP SCHEMA"
else
  bad "restore thiếu DROP SCHEMA"
fi

# ── Test 5: offsite-backup.sh verify size + retention ───────────────────
echo "▶ offsite-backup.sh"
WS5="$SANDBOX/offsite"; mkdir -p "$WS5/backups" "$SANDBOX/remote"; cd "$WS5" || exit 1
export FAKE_REMOTE_DIR="$SANDBOX/remote"
echo "hello-offsite" | gzip > backups/aurel-20260920-020000.sql.gz
OFFSITE_REMOTE="fake:bucket" OFFSITE_KEEP=30 \
  "$ROOT/scripts/offsite-backup.sh" > "$SANDBOX/offsite.out" 2>&1
rc=$?
check "đẩy offsite thành công (rc=0)" 0 "$rc"
check "có file trên remote" 1 "$(ls -1 "$SANDBOX/remote" | wc -l)"
grep -q "verified" "$SANDBOX/offsite.out" && ok "báo verified" || bad "thiếu xác nhận verify"
grep -q "min-age 30d" "$FAKE_LOG" && ok "retention remote dùng OFFSITE_KEEP=30" || bad "retention sai"

# size lệch → rc != 0 (phát hiện đẩy nửa vời)
cat > "$BIN/rclone" <<'FAKE'
#!/usr/bin/env bash
case "$1" in
  copyto) echo "x" > "${FAKE_REMOTE_DIR:?}/$(basename "$3")"; exit 0;;
  lsl) echo "1 2026-09-20 remote"; exit 0;;
  delete) exit 0;;
  lsf) exit 0;;
esac
exit 0
FAKE
chmod +x "$BIN/rclone"
OFFSITE_REMOTE="fake:bucket" "$ROOT/scripts/offsite-backup.sh" > "$SANDBOX/offsize.out" 2>&1
rc=$?
check "size lệch → rc != 0" 1 "$([ "$rc" != "0" ] && echo 1 || echo 0)"
grep -q "SIZE LỆCH" "$SANDBOX/offsize.out" && ok "báo 'SIZE LỆCH'" || bad "không báo lệch size"

# khôi phục rclone giả
cat > "$BIN/rclone" <<'FAKE'
#!/usr/bin/env bash
case "$1" in
  copyto) echo "keep" > "${FAKE_REMOTE_DIR:?}/$(basename "$3")"; exit 0;;
  lsl)    echo "$(echo keep | wc -c) 2026-09-20 remote"; exit 0;;
  delete) exit 0;;
  lsf)    exit 0;;
esac
exit 0
FAKE
chmod +x "$BIN/rclone"

# ── Test 6: check-migration-drift.sh ────────────────────────────────────
echo "▶ check-migration-drift.sh"
# disk có "20260901000000_a" nhưng DB chưa apply → phải báo drift.
export FAKE_APPLIED=""
"$ROOT/scripts/check-migration-drift.sh" "-f fake" > "$SANDBOX/drift1.out" 2>&1
rc=$?
check "disk có, DB thiếu → rc=1" 1 "$rc"
grep -q "Chưa apply" "$SANDBOX/drift1.out" && ok "báo 'Chưa apply'" || bad "không báo migration thiếu"

# DB apply đủ đúng như disk → với fake docker đọc list thật từ disk.
APPLIED_LIST="$(find "$ROOT/backend/prisma/migrations" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | grep -E '^[0-9]{14}_' | sort)"
export FAKE_APPLIED="$APPLIED_LIST"
# migrate diff sẽ fail vì không có shadow DB thật → chấp nhận rc=1 nhưng KHÔNG
# được báo 2 loại lệch file-vs-DB (2 check đầu phải sạch).
"$ROOT/scripts/check-migration-drift.sh" "-f fake" > "$SANDBOX/drift2.out" 2>&1 || true
if grep -qE "Chưa apply|repo không còn" "$SANDBOX/drift2.out"; then
  bad "disk khớp DB nhưng vẫn báo lệch file"
else
  ok "disk khớp DB → không báo lệch file"
fi

# DB có migration repo không còn → phải báo.
export FAKE_APPLIED="20200101000000_deleted_migration"
"$ROOT/scripts/check-migration-drift.sh" "-f fake" > "$SANDBOX/drift3.out" 2>&1
rc=$?
check "DB thừa migration → rc=1" 1 "$rc"
grep -q "repo không còn" "$SANDBOX/drift3.out" && ok "báo 'repo không còn'" || bad "không báo migration thừa"

# schema.prisma vs migration: nếu có npx+prisma thì check 3 phải SẠCH (repo
# hiện tại đã đồng bộ). Không có npx → skip (đừng fail oan trên máy dev).
if command -v npx >/dev/null 2>&1 && [ -d "$ROOT/backend/node_modules" ]; then
  export FAKE_APPLIED="$APPLIED_LIST"
  "$ROOT/scripts/check-migration-drift.sh" "-f fake" > "$SANDBOX/drift4.out" 2>&1
  if grep -q "CHƯA có migration" "$SANDBOX/drift4.out"; then
    bad "repo tự báo lệch schema vs migration"
  else
    ok "schema.prisma đồng bộ với migration trên disk"
  fi
else
  ok "(skip check 3 — không có npx/prisma)"
fi

# không đọc được DB → rc=2 (không kiểm tra được).
export FAKE_APPLIED_EXIT=1
"$ROOT/scripts/check-migration-drift.sh" "-f fake" > /dev/null 2>&1
rc=$?
check "không đọc được DB → rc=2" 2 "$rc"
unset FAKE_APPLIED_EXIT FAKE_APPLIED

# ── Tổng kết ────────────────────────────────────────────────────────────
echo
echo "──────── $PASS pass, $FAIL fail ────────"
if [ "$FAIL" != "0" ]; then
  printf '  fail: %s\n' "${FAILED_NAMES[@]}"
  exit 1
fi
