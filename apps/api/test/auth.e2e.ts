/**
 * Accounts, sessions and ownership against a real (test) Postgres and the compiled server.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { type ApiProcess, startApi, TEST_DATABASE_URL, WEB_ORIGIN } from './support/api-process.js';

let api: ApiProcess;

beforeAll(async () => {
  api = await startApi();
});
afterAll(() => api?.stop());

const json = { 'Content-Type': 'application/json', Origin: WEB_ORIGIN };

async function signUp(email: string, password = 'correct-horse-9', extra: Record<string, unknown> = {}) {
  return fetch(`${api.base}/auth/sign-up/email`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ email, password, name: email.split('@')[0], ...extra }),
  });
}

/** The server logs emails when SMTP is off; pull the newest verification link for this address. */
async function verificationLink(email: string): Promise<string> {
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
async function verifiedUser(email: string): Promise<string> {
  expect((await signUp(email)).status).toBe(200);
  const res = await fetch(await verificationLink(email), { redirect: 'manual' });
  expect(res.status).toBe(302);
  const cookie = res.headers.getSetCookie().find((c) => c.includes('session_token'));
  expect(cookie).toBeDefined();
  return cookie!.split(';')[0]!;
}

async function setRole(email: string, role: 'user' | 'admin'): Promise<void> {
  const db = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();
  await db.query('UPDATE users SET role = $1 WHERE email = $2', [role, email]);
  await db.end();
}

const me = (cookie?: string) => fetch(`${api.base}/me`, { headers: cookie ? { Cookie: cookie } : {} });

describe('sign-up and email verification', () => {
  it('does not create a session before the email is verified', async () => {
    const res = await signUp('unverified@example.com');
    expect(res.status).toBe(200);
    expect(((await res.json()) as { token: unknown }).token).toBeNull();

    const signIn = await fetch(`${api.base}/auth/sign-in/email`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ email: 'unverified@example.com', password: 'correct-horse-9' }),
    });
    expect(signIn.status).toBe(403);
    expect(await signIn.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
  });

  it('verifies, signs in, and returns the profile with defaults', async () => {
    const cookie = await verifiedUser('alice@example.com');
    const res = await me(cookie);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      user: { email: 'alice@example.com', emailVerified: true, role: 'user' },
      profile: { displayName: 'alice', goals: [], onboardedAt: null, timezone: 'Asia/Kolkata' },
      settings: { feedbackLanguage: 'en', defaultDifficulty: 'INTERMEDIATE', liveCorrection: false },
      onboarded: false,
    });
  });

  it('ignores a client-supplied role (no self-promotion to admin)', async () => {
    const res = await signUp('mallory@example.com', 'correct-horse-9', { role: 'admin' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { role: string } }).user.role).toBe('user');
  });

  it('rate-limits per client and never trusts a client-sent IP header', async () => {
    // Spoofing the internal header must not give each request a fresh rate-limit bucket.
    const attempt = (i: number) =>
      fetch(`${api.base}/auth/sign-in/email`, {
        method: 'POST',
        headers: { ...json, 'x-speakai-client-ip': `10.0.0.${i}` },
        body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password-1' }),
      });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await attempt(i)).status);
    expect(statuses).toContain(429);
    expect(api.output()).not.toContain('could not determine a client IP');
  });

  it('rejects weak passwords and untrusted origins', async () => {
    expect((await signUp('weak@example.com', 'short')).status).toBe(400);
    const res = await fetch(`${api.base}/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
      body: JSON.stringify({ email: 'x@example.com', password: 'correct-horse-9', name: 'x' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('/v1/me', () => {
  it('requires a session', async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect((await me('better-auth.session_token=forged.value')).status).toBe(401);
  });

  it('completes onboarding only with the current consent version', async () => {
    const cookie = await verifiedUser('bob@example.com');
    const post = (body: unknown) =>
      fetch(`${api.base}/me/onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(body),
      });

    const base = { level: 'ADVANCED', goals: ['job_interviews'], feedbackLanguage: 'hi' };
    expect((await post({ ...base, consentVersion: '1999-01-01' })).status).toBe(400);

    const ok = await post({ ...base, consentVersion: '2026-09-30', displayName: 'Bobby' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({
      onboarded: true,
      profile: { selfReportedLevel: 'ADVANCED', goals: ['job_interviews'], displayName: 'Bobby' },
      settings: { feedbackLanguage: 'hi', defaultDifficulty: 'ADVANCED' },
    });
  });

  it('updates settings and rejects unknown fields', async () => {
    const cookie = await verifiedUser('carol@example.com');
    const patch = (body: unknown) =>
      fetch(`${api.base}/me/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify(body),
      });
    const ok = await patch({ liveCorrection: true, preferredVoiceGender: 'FEMALE' });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ settings: { liveCorrection: true, preferredVoiceGender: 'FEMALE' } });
    expect((await patch({ role: 'admin' })).status).toBe(400);
  });
});

describe('/v1/admin', () => {
  it('is forbidden to regular users and open to admins', async () => {
    const cookie = await verifiedUser('erin@example.com');
    const asUser = await fetch(`${api.base}/admin/stats`, { headers: { Cookie: cookie } });
    expect(asUser.status).toBe(403);
    expect((await fetch(`${api.base}/admin/stats`)).status).toBe(401);

    await setRole('erin@example.com', 'admin');
    const asAdmin = await fetch(`${api.base}/admin/stats`, { headers: { Cookie: cookie } });
    expect(asAdmin.status).toBe(200);
    const stats = (await asAdmin.json()) as Record<string, number>;
    expect(stats.users).toBeGreaterThanOrEqual(1);
    expect(Object.keys(stats).sort()).toEqual(['onboardedUsers', 'signupsLast7Days', 'users', 'verifiedUsers']);
  });
});

describe('voice routes', () => {
  it('require a session or the dev token', async () => {
    const res = await fetch(`${api.base}/poc/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdpOffer: 'v=0', voice: 'female' }),
    });
    expect(res.status).toBe(401);
  });

  it("hide other users' calls (404, not 403)", async () => {
    const cookie = await verifiedUser('dave@example.com');
    const res = await fetch(`${api.base}/poc/calls/call_someone-elses/transcript`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(404);
  });
});
