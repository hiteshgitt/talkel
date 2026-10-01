#!/usr/bin/env bash
# Deploys Talkel to Google Cloud Run: the API (+ in-process worker) and the web app.
#
#   PROJECT_ID=my-gcp-project ./deploy/cloudrun.sh            # region defaults to asia-south1 (Mumbai)
#
# Needs: gcloud (logged in: `gcloud auth login`), deploy/.env.production (gitignored; see docs/DEPLOY.md).
# Images are built by Cloud Build, so no local Docker is needed.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?set PROJECT_ID}"
REGION="${REGION:-asia-south1}"
REPO="${REPO:-talkel}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/deploy/.env.production"
TAG="$(git -C "$ROOT" rev-parse --short HEAD)"
REGISTRY="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO"

[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE" >&2; exit 1; }
for key in DATABASE_URL BETTER_AUTH_SECRET GEMINI_API_KEY RESEND_API_KEY EMAIL_FROM S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY RTC_TURN_URLS RTC_TURN_USERNAME RTC_TURN_CREDENTIAL; do
  grep -q "^$key=." "$ENV_FILE" || { echo "deploy/.env.production is missing $key" >&2; exit 1; }
done

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com >/dev/null
gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create "$REPO" --repository-format docker --location "$REGION" >/dev/null

# Cloud Run env vars from the .env file (YAML, quoted), plus fixed production values.
env_yaml() { # env_yaml KEY=value ... (explicit values override the file)
  local out; out="$(mktemp)"
  local skip="DIRECT_URL|CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID"
  for kv in "$@"; do skip+="|${kv%%=*}"; done
  grep -E '^[A-Z0-9_]+=' "$ENV_FILE" | grep -vE "^($skip)=" | while IFS= read -r line; do
    printf '%s: %s\n' "${line%%=*}" "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${line#*=}")"
  done >"$out"
  for kv in "$@"; do printf '%s: %s\n' "${kv%%=*}" "$(python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "${kv#*=}")" >>"$out"; done
  echo "$out"
}

build() { # build <dockerfile> <image> [--build-arg ...]
  local file="$1" image="$2"; shift 2
  local cfg; cfg="$(mktemp --suffix .yaml)"
  local args=""; for a in "$@"; do args+="\"$a\", "; done
  cat >"$cfg" <<YAML
steps:
  - name: gcr.io/cloud-builders/docker
    args: ["build", "-f", "$file", ${args} "-t", "$image", "."]
images: ["$image"]
options: { machineType: E2_HIGHCPU_8 }
timeout: 1800s
YAML
  gcloud builds submit "$ROOT" --config "$cfg"
}

echo "▶ API image"
API_IMAGE="$REGISTRY/api:$TAG"
build deploy/api.Dockerfile "$API_IMAGE"

API_URL="$(gcloud run services describe talkel-api --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)"
WEB_URL="$(gcloud run services describe talkel-web --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)"

# Free-tier friendly: scales to zero; CPU only while requests run (the phone holds one open during a
# call; the results screen long-polls while feedback is prepared). One instance max, because a live
# call is held in memory and every request for it must reach the same process.
deploy_api() {
  gcloud run deploy talkel-api --image "$API_IMAGE" --region "$REGION" --allow-unauthenticated \
    --min-instances 0 --max-instances 1 --cpu 1 --memory 1Gi \
    --timeout 3600 --concurrency 80 --session-affinity --port 8080 \
    --env-vars-file "$(env_yaml "APP_BASE_URL=${API_URL:-https://placeholder.invalid}" "WEB_BASE_URL=${WEB_URL:-https://placeholder.invalid}" "QUEUE_DRIVER=postgres" "RUN_WORKER_IN_API=true" "RTC_RELAY_ONLY=true")"
  API_URL="$(gcloud run services describe talkel-api --region "$REGION" --format 'value(status.url)')"
}
echo "▶ API deploy"
deploy_api

echo "▶ Web image (API at $API_URL)"
WEB_IMAGE="$REGISTRY/web:$TAG"
build deploy/web.Dockerfile "$WEB_IMAGE" "--build-arg" "API_INTERNAL_URL=$API_URL" "--build-arg" "NEXT_PUBLIC_WEB_URL=${WEB_URL:-}"
gcloud run deploy talkel-web --image "$WEB_IMAGE" --region "$REGION" --allow-unauthenticated \
  --min-instances 0 --max-instances 4 --cpu 1 --memory 512Mi --port 8080
WEB_URL="$(gcloud run services describe talkel-web --region "$REGION" --format 'value(status.url)')"

echo "▶ API: final URLs"
deploy_api

echo
echo "✔ API: $API_URL"
echo "✔ Web: $WEB_URL"
echo "Mobile production build: set EXPO_PUBLIC_API_URL=$API_URL/v1 and EXPO_PUBLIC_WEB_URL=$WEB_URL"
