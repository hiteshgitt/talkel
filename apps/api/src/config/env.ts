import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4810),
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
  OPENAI_API_KEY: optionalSecret,
  OPENAI_BASE_URL: z.url().default('https://api.openai.com/v1'),
  REALTIME_MODEL: z.string().min(1).default('gpt-realtime-2.1'),
  REALTIME_TRANSCRIBE_MODEL: z.string().min(1).default('gpt-transcribe'),
  POC_DEV_TOKEN: z.string().min(16, 'POC_DEV_TOKEN must be at least 16 characters'),
  POC_MAX_SESSION_SECONDS: z.coerce.number().int().min(90).max(3600).default(300),
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
