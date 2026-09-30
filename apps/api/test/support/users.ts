import pg from 'pg';
import { expect } from 'vitest';
import { type ApiProcess, TEST_DATABASE_URL, WEB_ORIGIN } from './api-process.js';

const json = { 'Content-Type': 'application/json', Origin: WEB_ORIGIN };

export function signUp(api: ApiProcess, email: string, password = 'correct-horse-9', extra: Record<string, unknown> = {}) {
  return fetch(`${api.base}/auth/sign-up/email`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, password, name: email.split('@')[0], ...extra }),
  });
}

/** The server logs emails when SMTP is off; pull the newest verification link for this address. */
export async function verificationLink(api: ApiProcess, email: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const out = api.output();
    const at = out.lastIndexOf(`email to ${email}:`);
    const match = at >= 0 ? out.slice(at).match(/https?:\/\/\S*verify-email\S*/) : null;
    if (match) return match[0];
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`no verification email for ${email}. Server output tail:\n${api.output().slice(-1500)}`);
}

/** Signs up, verifies, and returns the session cookie. */
export async function verifiedUser(api: ApiProcess, email: string): Promise<string> {
  expect((await signUp(api, email)).status).toBe(200);
  const res = await fetch(await verificationLink(api, email), { redirect: 'manual' });
  expect(res.status).toBe(302);
  const cookie = res.headers.getSetCookie().find((c) => c.includes('session_token'));
  expect(cookie).toBeDefined();
  return cookie!.split(';')[0]!;
}

export async function sql<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const db = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  try {
    return (await db.query<T>(text, params)).rows;
  } finally {
    await db.end();
  }
}

export async function setRole(email: string, role: 'user' | 'admin'): Promise<void> {
  await sql('UPDATE users SET role = $1 WHERE email = $2', [role, email]);
}
