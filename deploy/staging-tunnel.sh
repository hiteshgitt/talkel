#!/usr/bin/env bash
# Staging on this machine, reachable from the internet through free Cloudflare quick tunnels
# (no account, no card). The tunnel addresses are random and change on every restart, so this
# script starts both tunnels, writes the new URLs into the API and app settings, and restarts the
# API, worker and Metro.
#
#   ./deploy/staging-tunnel.sh          # start / restart staging
#   ./deploy/staging-tunnel.sh stop     # stop the tunnels (the local services keep running)
#
# Calls from outside your Wi-Fi also need TURN credentials (RTC_TURN_* in apps/api/.env).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$HOME/talkel-staging"
CLOUDFLARED="${CLOUDFLARED:-$HOME/bin/cloudflared}"
LAN_WEB="${LAN_WEB:-http://192.168.3.226:3100}"
mkdir -p "$STATE"

pkill -f "cloudflared tunnel --no-autoupdate --url http://127.0.0.1:(4810|3100)" 2>/dev/null || true
[[ "${1:-}" == "stop" ]] && { echo "tunnels stopped"; exit 0; }

start_tunnel() { # start_tunnel <port> <name> → prints the public URL
  nohup "$CLOUDFLARED" tunnel --no-autoupdate --url "http://127.0.0.1:$1" >"$STATE/tunnel-$2.log" 2>&1 &
  for _ in $(seq 1 60); do
    url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$STATE/tunnel-$2.log" | head -1 || true)"
    [[ -n "$url" ]] && { echo "$url"; return; }
    sleep 1
  done
  echo "tunnel $2 did not start; see $STATE/tunnel-$2.log" >&2
  exit 1
}

API_URL="$(start_tunnel 4810 api)"
WEB_URL="$(start_tunnel 3100 web)"

set_var() { # set_var <file> <KEY> <value>
  if grep -q "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$3|" "$1"; else echo "$2=$3" >>"$1"; fi
}
set_var "$ROOT/apps/api/.env" APP_BASE_URL "$API_URL"
set_var "$ROOT/apps/api/.env" WEB_BASE_URL "$WEB_URL"
set_var "$ROOT/apps/api/.env" EXTRA_TRUSTED_ORIGINS "$LAN_WEB"
set_var "$ROOT/apps/mobile/.env" EXPO_PUBLIC_API_URL "$API_URL/v1"
set_var "$ROOT/apps/mobile/.env" EXPO_PUBLIC_WEB_URL "$WEB_URL"

# Restart the API + worker (new URLs) and Metro (the app bundles EXPO_PUBLIC_* at build time).
source "$HOME/.nvm/nvm.sh" >/dev/null && nvm use >/dev/null
pkill -f "^node dist/main.js" 2>/dev/null || true
pkill -f "^node dist/worker.js" 2>/dev/null || true
(cd "$ROOT/apps/api" && nohup node dist/main.js >"$STATE/api.log" 2>&1 & nohup node dist/worker.js >"$STATE/worker.log" 2>&1 &)
pkill -f "expo start --dev-client --port 8081" 2>/dev/null || true
(cd "$ROOT/apps/mobile" && nohup npx expo start --dev-client --port 8081 --host lan --clear >"$STATE/metro.log" 2>&1 &)

echo "Waiting for DNS of the new tunnel names…"
for _ in $(seq 1 60); do curl -sf -m 5 "$API_URL/v1/health" >/dev/null && break; sleep 5; done
echo
echo "✔ Staging API: $API_URL/v1"
echo "✔ Staging web: $WEB_URL"
echo "Reopen the Talkel app on your phone (Metro restarted with the new API address)."
