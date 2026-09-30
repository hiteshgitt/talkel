# Security & Privacy

**Status:** Proposed — pending approval.

## 1. Threat model (MVP)

| Asset | Threat | Control |
|---|---|---|
| Provider API key | Extracted from app → unlimited spend | The key exists **only on the server**. The device never receives a provider credential because SDP is proxied (VOICE-ARCHITECTURE §3). If we use the ephemeral-key fallback, keys are session-bound and expire in 60 s or less. |
| AI spend | Scripted abuse of free tier, bot sign-ups, never-ending calls | Verified email or Google before the first call. Per-user daily seconds quota. One active call per user. Server-side hard duration cap + heartbeat timeout. Per-IP and per-device rate limits on sign-up and create. Global daily spend circuit breaker (`GLOBAL_DAILY_COST_LIMIT`) that disables free-tier calls and alerts. |
| Conversation data (voice/transcripts) | Cross-user access (IDOR) | All queries scoped by `userId` in the repository layer (a `forUser(userId)` helper). Integration tests assert 404 on other users' ids for **every** `:id` route. |
| Hidden scenario params / prompts | Leaked to client, letting users game scenarios | Catalog DTOs are whitelist-mapped. Contract tests assert no `params`, `goals` or `promptTemplate` fields appear in public responses. |
| Admin panel | Privilege escalation | `RolesGuard` on every `/admin` route, admin role only via seed/DB, admin actions audit-logged. |
| Persona jailbreak via speech ("ignore your instructions…") | Harmful/off-policy output in voice | Safety layer always included. Provider moderation. Personas are constrained ("difficult" means disagreeable, never abusive). User-reported issue button after each call. Output transcripts are sampled into an offline moderation review. |
| Evaluation prompt injection (the transcript contains instructions) | Manipulated scores/feedback | Transcript passed as clearly delimited **data**. Structured output + Zod + grounding checks. Scores are not security-relevant. |
| Auth tokens | Theft | Mobile: `expo-secure-store` (Android Keystore). Web: httpOnly Secure cookies, CSRF protection for cookie-authenticated mutating routes. Rotating sessions, 30-day expiry, revocable server-side. |

## 2. Baseline controls

- HTTPS everywhere and HSTS on web. The WebSocket uses `wss` only.
- Passwords are hashed by Better Auth (scrypt/argon2 by default). Plaintext passwords are never stored or logged.
- Input validation: Zod at every boundary (HTTP, WS, provider events, LLM output, env).
- Security headers: `helmet` on the API, Next.js headers config on web. CORS allow-list from `CORS_ORIGINS`.
- Rate limiting: Redis-backed sliding window. Defaults: auth 10/min/IP, create-conversation 10/hour/user, general 120/min/user.
- Secrets live only in platform env stores. `.env*` is git-ignored. `gitleaks` runs in CI.
- Dependencies: Renovate/Dependabot, `pnpm audit` in CI, pinned lockfile.
- Logging: structured, with `userId`/`sessionId` correlation. **Transcript text, audio and tokens are never logged.** Sentry scrubs request bodies on conversation routes.
- **Local dev note:** this repo currently sits inside Apache's `DocumentRoot` (`/var/www/html`). A root `.htaccess` with `Require all denied` has been added so `.env` files and source are never served over HTTP. Moving the repo outside the web root is still preferred.

## 2a. Implementation notes (Milestone 1)

- **Secure by default:** a global `SessionGuard` requires a Better Auth session on every route. Routes opt out explicitly with `@Public()` (health, auth-config). Admin routes use `@Roles('admin')`. The admin role can only be granted with `apps/api/scripts/make-admin.ts`. Sign-up ignores a client-sent `role` (e2e-tested).
- **Email verification is required** before any session exists. Password-reset links revoke existing sessions.
- **Trusted origins:** the web origin and the `speakai://` app scheme. Requests from any other `Origin`, and redirects to foreign `callbackURL`s, are rejected (tested).
- **Rate limits per client IP:** Better Auth reads the IP only from an internal header (`x-speakai-client-ip`) that `main.ts` always overwrites with the socket address (or the forwarded address from the loopback Next.js proxy). A client can't spoof its way into a fresh rate-limit bucket (e2e-tested). Without this, Better Auth fell back to one global bucket.
- **Web cookies are first-party:** the browser talks only to the web origin, and Next.js rewrites `/v1/*` to the API. Cookies are `HttpOnly; SameSite=Lax`.
- **Mobile session storage:** SecureStore (Android Keystore). After email verification, Better Auth's Expo plugin passes the new session to the app inside the `speakai://` deep link (`?cookie=…`). The session therefore briefly appears in a URL on the device. This is the library's design; if it becomes a concern, drop `autoSignInAfterVerification` and have users sign in after verifying.
- **Voice calls** are held per owner. Another user's call id returns 404, so ids can't be probed.

## 2b. Call recordings (added 2026-09-30)

- **Opt-in, per call:** nothing is recorded until the user taps Record during a call. Starting a recording requires the privacy notice version that mentions recordings (`CONSENT_VERSION` 2026-10-01; existing users see a one-time "updated notice" screen).
- **What's recorded:** both voices, exactly as heard, mixed on the server (we're in the media path). Stored as Ogg Opus (~32 kbps, about 2.4 MB per 10 minutes), streamed to storage during the call.
- **Access:** only the owner. `GET /v1/conversations/:id/recording` is scoped to the session user, and another user's id returns 404. Responses are `Cache-Control: private, no-store`. Storage keys are validated (`<uuid>/<uuid>.ogg`), so paths can't be traversed.
- **Deletion:** users can delete a recording on its own, or with its conversation. Account deletion (M4) must also purge the recordings prefix.
- **Storage:** local disk (`RECORDINGS_DIR`, git-ignored, files mode 600) in development. **Before launch:** an S3-compatible bucket (e.g. Cloudflare R2) with server-side encryption and a lifecycle rule. The `RecordingStore` interface is already in place.

## 3. Privacy (PRD §52–53)

| Data | Default | Retention | User control |
|---|---|---|---|
| Live audio | **Not stored** by us. Streamed to the AI provider only. | — | — |
| Retained audio (opt-in, or the S3 fallback) | Off | `SESSION_ONLY` = deleted after analysis. `DAYS_30` = lifecycle rule. | Setting + per-session delete |
| Transcripts & analysis | Stored | Until the user deletes the session/account | Delete session, delete account, export |
| Usage records | Stored | With account. Anonymised daily roll-ups kept. | Deleted with account |

- **Provider processing:** the privacy notice must state that audio and transcripts are processed by the AI provider under its API data-usage terms. Under standard API terms, data is not used for training by default, but may be retained short-term for abuse monitoring. We will evaluate Zero Data Retention eligibility before public launch.
- **India DPDP Act 2023:** needs explicit, itemised consent at onboarding (voice processing, transcript storage), a grievance contact, erasure (implemented via DELETE endpoints) and breach-notification readiness. Legal review is required before public launch.
- **Minimum age:** set a minimum age in the terms (18+ recommended for MVP, to avoid the DPDP children's-data requirements).
- **Corporate (future):** managers see only aggregated progress, never transcripts, unless the employee explicitly shares them.
- **Admin access to transcripts:** off by default. A "break-glass" debug view requires a reason and is audit-logged.

## 4. Security test requirements (subset of PRD §69)

- Authorisation matrix test: each route × {anonymous, other user, owner, admin}.
- Quota and duration enforcement under a client that never sends end/heartbeat.
- Catalog DTO leakage test (hidden params).
- LLM output validation failure path (malformed JSON → retry → FAILED, never a crash).
- Account deletion removes all rows and objects (verified with DB and bucket inspection in an integration test).
