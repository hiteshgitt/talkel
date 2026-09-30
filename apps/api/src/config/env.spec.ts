import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEnv, withDotEnv } from './env.js';

describe('withDotEnv', () => {
  it('lets the app .env override globally exported provider variables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'speakai-env-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'OPENAI_API_KEY=sk-app\nOPENAI_BASE_URL=https://api.openai.com/v1\n');

    const merged = withDotEnv(
      { OPENAI_API_KEY: 'sk-other-tool', OPENAI_BASE_URL: 'https://some-router.example/v1', PATH: '/bin' },
      file,
    );

    expect(merged.OPENAI_API_KEY).toBe('sk-app');
    expect(merged.OPENAI_BASE_URL).toBe('https://api.openai.com/v1');
    expect(merged.PATH).toBe('/bin');
  });

  it('uses the inherited environment unchanged when there is no .env (deployed)', () => {
    const base = { OPENAI_API_KEY: 'sk-platform' };
    expect(withDotEnv(base, '/nonexistent/.env')).toBe(base);
  });
});

describe('loadEnv', () => {
  it('applies defaults and rejects a short dev token', () => {
    const required = {
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      APP_BASE_URL: 'http://localhost:4810',
      WEB_BASE_URL: 'http://localhost:3100',
      BETTER_AUTH_SECRET: 's'.repeat(32),
    };
    const env = loadEnv(required);
    expect(env).toMatchObject({
      PORT: 4810,
      REALTIME_PROVIDER: 'gemini',
      GEMINI_LIVE_MODEL: 'gemini-3.8-live',
      REALTIME_MODEL: 'gpt-realtime-2.1',
      REALTIME_TRANSCRIBE_MODEL: 'gpt-transcribe',
    });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.POC_DEV_TOKEN).toBeUndefined();
    expect(() => loadEnv({ ...required, POC_DEV_TOKEN: 'short' })).toThrow(/POC_DEV_TOKEN/);
    expect(() => loadEnv({ ...required, BETTER_AUTH_SECRET: 'too-short' })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });
});
