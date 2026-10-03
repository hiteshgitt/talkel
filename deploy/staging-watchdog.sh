#!/usr/bin/env bash
# Keeps staging up (run from cron every 5 minutes and at boot; see docs/DEPLOY.md):
# restarts the API, worker or web app if they stopped, and Tailscale Funnel (re-pointing the
# permanent Worker address) if staging isn't reachable from the internet. Databases restart via Docker.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATE="$HOME/talkel-staging"
mkdir -p "$STATE"
exec 9>"$STATE/watchdog.lock"
flock -n 9 || exit 0 # a previous run is still busy
# nvm isn't written for strict mode (set -u) and cron has no .nvmrc in its working directory.
set +u
source "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
nvm use --silent 24 >/dev/null 2>&1
set -u
log() { echo "$(date '+%F %T') $*"; }

if ! curl -sf -m 10 http://127.0.0.1:4810/v1/health >/dev/null; then
  log "API down — restarting"
  pkill -f "^node dist/main.js" 2>/dev/null || true
  (cd "$ROOT/apps/api" && nohup node dist/main.js >"$STATE/api.log" 2>&1 &)
fi
if ! pgrep -f "^node dist/worker.js" >/dev/null; then
  log "worker down — restarting"
  (cd "$ROOT/apps/api" && nohup node dist/worker.js >"$STATE/worker.log" 2>&1 &)
fi
if ! curl -sf -m 10 -o /dev/null http://127.0.0.1:3100/sign-in; then
  log "web down — restarting"
  pkill -f "next start -p 3100" 2>/dev/null || true
  (cd "$ROOT/apps/web" && nohup npx next start -p 3100 -H 0.0.0.0 >"$STATE/web.log" 2>&1 &)
fi

sleep 5
TS="$HOME/talkel-staging/tailscale"
if ! "$TS/tailscale" --socket="$TS/tailscaled.sock" status >/dev/null 2>&1; then
  log "tailscale down — restarting staging"
  "$ROOT/deploy/staging-up.sh" >>"$STATE/staging-up.log" 2>&1 || log "staging-up failed"
fi
PUBLIC_URL="$(grep '^APP_BASE_URL=' "$ROOT/apps/api/.env" | cut -d= -f2-)"
if ! curl -sf -m 15 "$PUBLIC_URL/v1/health" >/dev/null; then
  sleep 20 # one retry: don't restart over a blip
  if ! curl -sf -m 15 "$PUBLIC_URL/v1/health" >/dev/null; then
    log "staging unreachable at $PUBLIC_URL — repairing"
    "$ROOT/deploy/staging-up.sh" >>"$STATE/staging-up.log" 2>&1 || log "staging-up failed"
  fi
fi
