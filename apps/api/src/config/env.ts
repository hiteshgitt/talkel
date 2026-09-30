import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4810),

  // ── Core (M1) ──
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  /** Public base URL of this API, as phones/browsers reach it (used in email links and OAuth redirects). */
  APP_BASE_URL: z.url(),
  /** Web app origin (sign-in pages, dashboard). Trusted for auth requests. */
  WEB_BASE_URL: z.url(),
  /** Mobile deep-link scheme (app.json "scheme"). Trusted for auth callbacks. */
  MOBILE_SCHEME: z.string().regex(/^[a-z][a-z0-9+.-]*$/).default('speakai'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters (openssl rand -hex 32)'),
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  /** e.g. smtp://localhost:1027 (Mailpit in dev). Empty: emails are written to the log instead. */
  SMTP_URL: optionalSecret,
  EMAIL_FROM: z.string().min(3).default('SpeakAI <no-reply@speakai.local>'),
  /**
   * gemini: phone ⇄ our WebRTC gateway ⇄ Gemini Live (WebSocket).
   * openai: phone ⇄ OpenAI Realtime (WebRTC) directly, with our server on the sideband.
   */
  REALTIME_PROVIDER: z.enum(['gemini', 'openai']).default('gemini'),
  GEMINI_API_KEY: optionalSecret,
  GEMINI_LIVE_MODEL: z.string().min(1).default('gemini-3.8-live'),
  GEMINI_LIVE_URL: z
    .url()
    .default('wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'),
  /** Comma-separated STUN/TURN URLs for the server-side WebRTC endpoint (gemini mode). */
  RTC_ICE_SERVERS: z.string().default('stun:stun.l.google.com:19302'),
  /** UDP port range for call media (gemini mode), so a firewall rule can be precise. "min-max". */
  RTC_UDP_PORT_RANGE: z
    .string()
    .regex(/^\d{4,5}-\d{4,5}$/, 'RTC_UDP_PORT_RANGE must look like 40000-40099')
    .default('40000-40099')
    .transform((v) => v.split('-').map(Number) as [number, number])
    .refine(([min, max]) => min < max && max <= 65535, 'RTC_UDP_PORT_RANGE: min must be < max <= 65535'),
  OPENAI_API_KEY: optionalSecret,
  OPENAI_BASE_URL: z.url().default('https://api.openai.com/v1'),
  REALTIME_MODEL: z.string().min(1).default('gpt-realtime-2.1'),
  REALTIME_TRANSCRIBE_MODEL: z.string().min(1).default('gpt-transcribe'),
  /**
   * Optional static token for headless test scripts (scripts/spike-call.ts) on the voice routes.
   * Real users authenticate with a Better Auth session.
   */
  POC_DEV_TOKEN: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined))
    .refine((v) => v === undefined || v.length >= 16, 'POC_DEV_TOKEN must be at least 16 characters'),
  POC_MAX_SESSION_SECONDS: z.coerce.number().int().min(90).max(3600).default(300),
  /** Free conversation time per user per local day (PRD decision: 10 minutes). */
  FREE_DAILY_SECONDS: z.coerce.number().int().min(60).default(600),
  /** Hard cap on any single conversation, whatever the user asks for. */
  CONVERSATION_MAX_SECONDS: z.coerce.number().int().min(60).max(3600).default(1800),
  CALL_LOG_DIR: z.string().min(1).default('./logs/calls'),
});

export type Env = z.infer<typeof EnvSchema>;

export const ENV = Symbol('ENV');

/**
 * Overlays the app's own .env (if present) on top of the inherited environment.
 *
 * The .env file deliberately WINS over inherited variables: generic names like OPENAI_API_KEY /
 * OPENAI_BASE_URL are often exported globally by other tools in a developer's shell, and silently
 * using those would send our traffic (and key) to the wrong endpoint. In deployed environments
 * there is no .env file, so platform-provided variables are used unchanged.
 */
export function withDotEnv(base: NodeJS.ProcessEnv, dotEnvPath: string): NodeJS.ProcessEnv {
  if (!existsSync(dotEnvPath)) return base;
  return { ...base, ...parseEnv(readFileSync(dotEnvPath, 'utf8')) };
}

/** Parses the environment; throws with every problem listed so boot fails loudly. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
