#!/usr/bin/env bash
# Uploads the staging Worker: deploy.sh <api-origin> <web-origin>. Also sets its keep-awake cron (every 10 min).
# Credentials come from ~/talkel-staging/cloudflare.env (outside the repo).
set -euo pipefail
source "$HOME/talkel-staging/cloudflare.env"
DIR="$(cd "$(dirname "$0")" && pwd)"
META="$(mktemp)"
cat >"$META" <<JSON
{"main_module":"worker.js","compatibility_date":"2026-09-01",
 "bindings":[{"type":"plain_text","name":"API_ORIGIN","text":"$1"},{"type":"plain_text","name":"WEB_ORIGIN","text":"$2"}]}
JSON
api="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/$WORKER_NAME"
curl -sf -X PUT "$api" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F "metadata=@$META;type=application/json" -F "worker.js=@$DIR/worker.js;type=application/javascript+module" >/dev/null
curl -sf -X PUT "$api/schedules" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" -d '[{"cron":"*/10 * * * *"}]' >/dev/null
curl -sf -X POST "$api/subdomain" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json" -d '{"enabled":true}' >/dev/null
sub="$(curl -sf "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/subdomain" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["subdomain"])')"
rm -f "$META"
echo "https://$WORKER_NAME.$sub.workers.dev"
