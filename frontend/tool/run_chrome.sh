#!/usr/bin/env bash
# Google OAuth web cần Authorized JavaScript origin cố định.
# Thêm http://localhost:8080 (và http://localhost) vào Google Cloud Console.
set -euo pipefail
cd "$(dirname "$0")/.."
exec flutter run -d chrome --web-hostname localhost --web-port 8080 "$@"
