#!/usr/bin/env bash
# Backup Postgres (custom format) — Phase 5.
# Usage:
#   ./scripts/backup-postgres.sh
#   DATABASE_URL=postgresql://mt:mt@localhost:15432/manage_teams ./scripts/backup-postgres.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

URL="${DATABASE_URL:-${POSTGRES_URL:-}}"
if [[ -z "$URL" ]]; then
  echo "ERROR: DATABASE_URL hoặc POSTGRES_URL chưa set" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ERROR: cần cài pg_dump (PostgreSQL client tools)" >&2
  exit 1
fi

OUT_DIR="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
OUT_FILE="$OUT_DIR/manage_teams_${STAMP}.dump"

echo "Backing up → $OUT_FILE"
pg_dump "$URL" --format=custom --no-owner --no-acl --file="$OUT_FILE"
ls -lh "$OUT_FILE"
echo "OK"
