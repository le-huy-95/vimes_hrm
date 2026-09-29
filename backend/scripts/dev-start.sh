#!/usr/bin/env bash
# Khởi động các service backend (dev) sau khi đã sửa .env (Postgres :15432, Redis :16379).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a
# shellcheck disable=SC1091
source "$ROOT/.env"
set +a

ports=(3200 3202 3203 3204 3206 3207)
echo "Stopping listeners on ${ports[*]} ..."
for p in "${ports[@]}"; do
  pids=$(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -n "${pids}" ]]; then
    kill ${pids} 2>/dev/null || true
    sleep 0.3
    kill -9 ${pids} 2>/dev/null || true
  fi
done
sleep 1

start_one() {
  local name="$1" port="$2" dir="$3"
  (
    cd "$ROOT/$dir"
    PORT="$port" node --import tsx/esm src/index.ts >"/tmp/mt-${name}.log" 2>&1 &
    echo $! >"/tmp/mt-${name}.pid"
  )
  echo "started ${name} :${port} (pid $(cat /tmp/mt-${name}.pid))"
}

start_one gateway 3200 apps/api-gateway
start_one identity 3202 apps/identity-service
start_one core 3203 apps/core-service
start_one chat 3204 apps/chat-service
start_one worker 3206 apps/worker-service
start_one sync 3207 apps/google-sync-service

sleep 2
echo "--- health ---"
curl -sS "http://localhost:3200/health" || true
echo
curl -sS "http://localhost:3204/health" || true
echo
curl -sS "http://localhost:3207/health" || true
echo
echo "Logs: /tmp/mt-*.log"
