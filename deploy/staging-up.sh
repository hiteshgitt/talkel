#!/usr/bin/env bash
# Staging on this machine, reachable from the internet for free (no card): Tailscale Funnel gives
# this machine a permanent HTTPS address (https://<host>.<tailnet>.ts.net) — "/" → web app,
# "/v1" → API — and a Cloudflare Worker keeps the address the app uses
# (https://talkel-staging.<subdomain>.workers.dev) pointing at it.
#
#   ./deploy/staging-up.sh      # start / repair staging (idempotent)
#
# One-time setup (done): Tailscale binaries in ~/talkel-staging/tailscale, logged in, Funnel enabled
# for the tailnet; Cloudflare credentials in ~/talkel-staging/cloudflare.env.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$HOME/talkel-staging"
TS="$STATE/tailscale"
SOCK="--socket=$TS/tailscaled.sock"
LAN_WEB="${LAN_WEB:-http://192.168.3.226:3100}"
mkdir -p "$STATE"

# 1. Tailscale (userspace networking: no root needed). It keeps its login in $TS/state.
if ! "$TS/tailscale" $SOCK status >/dev/null 2>&1; then
  nohup "$TS/tailscaled" --tun=userspace-networking --statedir="$TS/state" --socket="$TS/tailscaled.sock" --port=41641 >"$TS/tailscaled.log" 2>&1 &
  for _ in $(seq 1 30); do "$TS/tailscale" $SOCK status >/dev/null 2>&1 && break; sleep 1; done
fi
HOST="$("$TS/tailscale" $SOCK status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
FUNNEL_URL="https://$HOST"

# 2. Funnel routes (stored by tailscaled; re-applying is harmless).
timeout 30 "$TS/tailscale" $SOCK funnel --bg --set-path /v1 http://127.0.0.1:4810/v1 >/dev/null
timeout 30 "$TS/tailscale" $SOCK funnel --bg http://127.0.0.1:3100 >/dev/null

# 3. The permanent app address forwards to Funnel.
PUBLIC_URL="$("$ROOT/deploy/staging-worker/deploy.sh" "$FUNNEL_URL" "$FUNNEL_URL")"

set_var() { # set_var <file> <KEY> <value>
  if grep -q "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$3|" "$1"; else echo "$2=$3" >>"$1"; fi
}
set_var "$ROOT/apps/api/.env" APP_BASE_URL "$PUBLIC_URL"
set_var "$ROOT/apps/api/.env" WEB_BASE_URL "$PUBLIC_URL"
set_var "$ROOT/apps/api/.env" EXTRA_TRUSTED_ORIGINS "$LAN_WEB,$FUNNEL_URL"
set_var "$ROOT/apps/api/.env" TRUST_CLIENT_IP_HEADER true
set_var "$ROOT/apps/mobile/.env" EXPO_PUBLIC_API_URL "$PUBLIC_URL/v1"
set_var "$ROOT/apps/mobile/.env" EXPO_PUBLIC_WEB_URL "$PUBLIC_URL"

# 4. Retire the old quick tunnels.
pkill -f "cloudflared tunnel --no-autoupdate --url http://127.0.0.1:(4810|3100)" 2>/dev/null || true

echo "✔ Staging: $PUBLIC_URL (via $FUNNEL_URL)"
