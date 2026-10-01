# Deploying Talkel (Google Cloud Run)

| Piece | Where |
|---|---|
| API + analysis worker (one service, scales to zero) | Cloud Run `talkel-api`, region `asia-south1` (Mumbai) |
| Web app | Cloud Run `talkel-web` |
| Database | Supabase Postgres (transaction pooler for the app, session pooler for migrations) |
| Feedback queue | the database (`QUEUE_DRIVER=postgres`) — no Redis in production |
| Call recordings | Supabase Storage via its S3 API (private bucket, streamed through the API after an ownership check); Cloudflare R2 also supported |
| Call media relay | any TURN provider (`RTC_TURN_*`, e.g. metered.ca free plan); Cloudflare Realtime TURN also supported |
| Email | Resend |

## Fitting Cloud Run's free tier

Cloud Run's free tier covers request-based billing: an instance gets CPU only while requests are in flight and scales to
zero when idle. A live call does work between requests (audio in and out, the Gemini session), so:

- the phone holds `GET /v1/conversations/:id/hold` open for the whole call — while it is open the instance has CPU;
- the results screen long-polls `GET /v1/conversations/:id/feedback/wait` while the in-process worker prepares feedback;
- the feedback queue lives in Postgres (`QUEUE_DRIVER=postgres`), because a Redis queue polls constantly and would
  exceed a free Redis plan; claims use `FOR UPDATE SKIP LOCKED`, retries back off 20 s … 5 min, up to 6 attempts.

`--max-instances 1` because a live call is held in memory and its follow-up requests must reach the same process.
1 vCPU / 1 GiB stretches the free allowance (≈180,000 vCPU-seconds ≈ 50 hours of active time per month). Trade-offs: a
cold start of a few seconds after idle, and feedback for a call whose results screen was closed early is finished the
next time the app talks to the server. For an always-on deployment instead, use `--min-instances 1 --no-cpu-throttling`
and keep the defaults (Redis queue).

## Why TURN

Cloud Run accepts only HTTP(S)/WebSocket traffic — no inbound UDP — so the phone and the API can't exchange WebRTC media
directly. With `RTC_RELAY_ONLY=true` the API gathers only relayed candidates through Cloudflare TURN (TURN over TLS on
port 443, i.e. plain HTTPS-like egress), and the phone gets short-lived TURN credentials from `GET /v1/rtc/ice-servers`.
Without a TURN key (development) both sides use STUN and the API's UDP ports, as before.

## One-time setup

1. **GCP**: a project with billing; `gcloud auth login`.
2. **Supabase**: project (ideally region `ap-south-1`, Mumbai). Put both pooler URLs in `deploy/.env.production`, then:
   ```bash
   cd packages/db
   DATABASE_URL="<session pooler URL, port 5432>" npx prisma migrate deploy
   DATABASE_URL="<session pooler URL, port 5432>" node seed/seed.ts
   ```
3. **Supabase Storage**: create a **private** bucket `recordings`; Storage → S3 Configuration → new access key →
   `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (`S3_ENDPOINT=https://<ref>.supabase.co/storage/v1/s3`, `S3_REGION` = project region).
4. **TURN**: metered.ca (free plan) → TURN credentials → `RTC_TURN_URLS`, `RTC_TURN_USERNAME`, `RTC_TURN_CREDENTIAL`.
5. **Resend**: verify the sending domain; `EMAIL_FROM=Talkel <hello@your-domain>`.

`deploy/.env.production` is gitignored. Never commit it; rotate any key that was shared in chat before launch.

## Deploy

```bash
PROJECT_ID=<gcp-project> ./deploy/cloudrun.sh
```

Needs a GCP billing account (the free tier still applies). Builds both images with Cloud Build, deploys the API, builds the web app against the API URL, deploys it, then redeploys
the API with the final URLs (`APP_BASE_URL`, `WEB_BASE_URL` — used by sign-in links and allowed origins).

Mobile production builds: `EXPO_PUBLIC_API_URL=<api url>/v1`, `EXPO_PUBLIC_WEB_URL=<web url>` (an EAS `production`
profile env), then `eas build --profile production`.
