#!/usr/bin/env bash
# Kiểm tra env nguy hiểm trước deploy / CI — Phase 5 harden.
# Usage:
#   ./scripts/security-env-check.sh          # đọc backend/.env nếu có
#   ./scripts/security-env-check.sh --ci     # chỉ dùng env process (CI)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CI_MODE=0
if [[ "${1:-}" == "--ci" ]]; then
  CI_MODE=1
fi

if [[ "$CI_MODE" -eq 0 && -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

FAIL=0
warn() { echo "WARN: $*" >&2; }
fail() { echo "FAIL: $*" >&2; FAIL=1; }

# Trong CI: chỉ kiểm tra mẫu nguy hiểm nếu biến được set (không bắt buộc có .env).
check_secret() {
  local name="$1"
  local val="${!name:-}"
  local bad_patterns="$2"
  if [[ -z "$val" ]]; then
    if [[ "$CI_MODE" -eq 1 ]]; then
      return 0
    fi
    warn "$name chưa set (dev OK; prod bắt buộc)"
    return 0
  fi
  if echo "$val" | grep -Eiq "$bad_patterns"; then
    fail "$name đang dùng giá trị placeholder/không an toàn"
  fi
}

check_secret JWT_SECRET "dev-jwt-secret|change-me|changeme|secret123"
check_secret INTERNAL_SERVICE_TOKEN "dev-internal-token|change-me|changeme"
check_secret GOOGLE_CLIENT_SECRET "your-|placeholder|replace|paste|hướng dẫn|huong dan"
check_secret GOOGLE_TOKEN_ENCRYPTION_KEY "replace|change-me|changeme|your-"

if [[ "${NODE_ENV:-}" == "production" ]]; then
  [[ -n "${JWT_SECRET:-}" ]] || fail "production: JWT_SECRET bắt buộc"
  [[ -n "${INTERNAL_SERVICE_TOKEN:-}" ]] || fail "production: INTERNAL_SERVICE_TOKEN bắt buộc"
  if [[ "${CORS_ORIGINS:-}" == "*" ]]; then
    fail "production: CORS_ORIGINS không được là *"
  fi
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo "security-env-check: FAILED" >&2
  exit 1
fi
echo "security-env-check: OK"
