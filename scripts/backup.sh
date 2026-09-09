#!/usr/bin/env bash
# Snapshot the SQLite database safely (SQLite's online backup API — WAL-safe,
# works while the app is running) and keep the newest 30 copies.
#
#   scripts/backup.sh [db-path] [backup-dir]
#
# Defaults match docker-compose.prod.yml (DB_DATA_DIR=./data). Schedule it with
# cron or launchd, e.g. nightly:
#   0 4 * * * /path/to/LT-SuperDogs/scripts/backup.sh /path/to/data/superdogs.db /path/to/backups
set -euo pipefail

DB="${1:-./data/superdogs.db}"
OUT="${2:-./backups}"
KEEP=30

[ -f "$DB" ] || { echo "no database at $DB" >&2; exit 1; }
mkdir -p "$OUT"
STAMP=$(date +%Y%m%d-%H%M%S)
DEST="$OUT/superdogs-$STAMP.db"

python3 - "$DB" "$DEST" <<'PY'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1])
dst = sqlite3.connect(sys.argv[2])
with dst:
    src.backup(dst)
dst.close(); src.close()
PY

# Prune: newest $KEEP stay
ls -1t "$OUT"/superdogs-*.db 2>/dev/null | tail -n +$((KEEP + 1)) | while read -r old; do rm -f "$old"; done
echo "backup written: $DEST ($(du -h "$DEST" | cut -f1))"
