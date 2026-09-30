import { type ChildProcess, spawn } from 'node:child_process';
import { join } from 'node:path';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://speakai:speakai_dev@localhost:5436/speakai_test';
export const DEV_TOKEN = 'e2e-dev-token-0123456789';
export const WEB_ORIGIN = 'http://web.e2e.test';
/** Separate Redis database so tests never mix with development jobs. */
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6381/5';

export interface ApiProcess {
  base: string;
  origin: string;
  proc: ChildProcess;
  /** Everything the server has printed so far (emails are logged when SMTP_URL is empty). */
  output(): string;
  stop(): void;
}

/**
 * Boots the compiled API (dist/main.js) with a controlled environment. The developer's own
 * apps/api/.env is never read (DOTENV_PATH points nowhere), so tests can't reach real providers.
 */
export async function startApi(env: Record<string, string> = {}): Promise<ApiProcess> {
  const port = String(20000 + Math.floor(Math.random() * 20000));
  const origin = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, ['dist/main.js'], {
    cwd: join(import.meta.dirname, '..', '..'),
    env: {
      PATH: process.env.PATH ?? '',
      DOTENV_PATH: '/nonexistent/.env',
      PORT: port,
      DATABASE_URL: TEST_DATABASE_URL,
      APP_BASE_URL: origin,
      WEB_BASE_URL: WEB_ORIGIN,
      BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
      POC_DEV_TOKEN: DEV_TOKEN,
      SMTP_URL: '',
      REDIS_URL: TEST_REDIS_URL,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout?.on('data', (d: Buffer) => (output += d.toString()));
  proc.stderr?.on('data', (d: Buffer) => (output += d.toString()));

  const base = `${origin}/v1`;
  for (let i = 0; i < 150; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) {
        return { base, origin, proc, output: () => output, stop: () => proc.kill() };
      }
    } catch {
      /* not up yet */
    }
    if (proc.exitCode !== null) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error(`API did not start:\n${output}`);
}

/** Starts the queue worker (dist/worker.js) with the same kind of controlled environment. */
export function startWorker(env: Record<string, string> = {}): { stop(): void; output(): string } {
  const proc = spawn(process.execPath, ['dist/worker.js'], {
    cwd: join(import.meta.dirname, '..', '..'),
    env: {
      PATH: process.env.PATH ?? '',
      DOTENV_PATH: '/nonexistent/.env',
      DATABASE_URL: TEST_DATABASE_URL,
      APP_BASE_URL: 'http://127.0.0.1:1',
      WEB_BASE_URL: WEB_ORIGIN,
      BETTER_AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-e2e-secret',
      REDIS_URL: TEST_REDIS_URL,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout?.on('data', (d: Buffer) => (output += d.toString()));
  proc.stderr?.on('data', (d: Buffer) => (output += d.toString()));
  return { stop: () => proc.kill(), output: () => output };
}
