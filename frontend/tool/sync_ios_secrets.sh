#!/usr/bin/env bash
# Sync Google secrets from project-root `.env` into `ios/Flutter/Secrets.xcconfig`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
OUT="$ROOT/ios/Flutter/Secrets.xcconfig"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from .env.example first." >&2
  exit 1
fi

get_env() {
  local key="$1"
  # shellcheck disable=SC2002
  grep -E "^${key}=" "$ENV_FILE" | head -n1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//'
}

MAPS_API_KEY="$(get_env MAPS_API_KEY)"
GOOGLE_IOS_CLIENT_ID="$(get_env GOOGLE_IOS_CLIENT_ID)"
GOOGLE_SERVER_CLIENT_ID="$(get_env GOOGLE_SERVER_CLIENT_ID)"
GOOGLE_IOS_URL_SCHEME="$(get_env GOOGLE_IOS_URL_SCHEME)"

cat > "$OUT" <<EOF
// Auto-generated from .env by tool/sync_ios_secrets.sh — do not commit.
GMS_API_KEY=${MAPS_API_KEY}
GID_CLIENT_ID=${GOOGLE_IOS_CLIENT_ID}
GID_SERVER_CLIENT_ID=${GOOGLE_SERVER_CLIENT_ID}
GID_URL_SCHEME=${GOOGLE_IOS_URL_SCHEME}
EOF

echo "Wrote $OUT"
