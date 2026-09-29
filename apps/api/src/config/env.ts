import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined)),
  OPENAI_BASE_URL: z.url().default('https://api.openai.com/v1'),
  REALTIME_MODEL: z.string().min(1).default('gpt-realtime-2.1'),
  REALTIME_TRANSCRIBE_MODEL: z.string().min(1).default('gpt-4o-transcribe'),
  POC_DEV_TOKEN: z.string().min(16, 'POC_DEV_TOKEN must be at least 16 characters'),
  POC_MAX_SESSION_SECONDS: z.coerce.number().int().min(90).max(3600).default(300),
  CALL_LOG_DIR: z.string().min(1).default('./logs/calls'),
});

export type Env = z.infer<typeof EnvSchema>;

export const ENV = Symbol('ENV');

/** Parses process.env; throws with every problem listed so boot fails loudly. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
