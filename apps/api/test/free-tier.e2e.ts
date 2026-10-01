/**
 * The Cloud Run free-tier setup: no separate worker and no Redis queue. The API runs the analysis
 * worker in-process on the database queue; the phone holds a request open during the call and the
 * results screen long-polls for the feedback.
 */
import type { Catalog, ConversationDetail, CreateConversationResponse } from '@speakai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiProcess, startApi } from './support/api-process.js';
import { createFakePhone } from './support/fake-phone.js';
import { type FakeGemini, startFakeGemini } from './support/fake-gemini.js';
import { sql, verifiedUser } from './support/users.js';

let api: ApiProcess;
let gemini: FakeGemini;
let user: string;

beforeAll(async () => {
  gemini = await startFakeGemini();
  api = await startApi({
    GEMINI_API_KEY: 'fake-gemini-key',
    GEMINI_LIVE_URL: gemini.url,
    GEMINI_API_BASE: gemini.restBase,
    EVAL_MODELS: 'fake-eval-model',
    RTC_ICE_SERVERS: '',
    RUN_WORKER_IN_API: 'true',
    QUEUE_DRIVER: 'postgres',
    REDIS_URL: 'redis://127.0.0.1:1', // nothing may use Redis in this mode
  });
  user = await verifiedUser(api, 'free.tier@example.com');
});
afterAll(async () => {
  api?.stop();
  await gemini?.close();
});

const get = (path: string) => fetch(`${api.base}${path}`, { headers: { Cookie: user } });
const post = (path: string, body?: unknown) =>
  fetch(`${api.base}${path}`, {
    method: 'POST',
    headers: { Cookie: user, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('free-tier mode (database queue, in-process worker, held requests)', () => {
  it('runs a call with the hold request open, then delivers feedback through the long-poll', async () => {
    const catalog = (await (await get('/catalog')).json()) as Catalog;
    const scenarioId = catalog.scenarios.find((s) => s.slug === 'bargaining')!.id;
    const created = (await (await post('/conversations', { scenarioId, durationSec: 60 })).json()) as CreateConversationResponse;

    const phone = await createFakePhone();
    const { sdpAnswer } = (await (await post(`/conversations/${created.id}/connect`, { sdpOffer: phone.offer })).json()) as { sdpAnswer: string };
    await phone.accept(sdpAnswer);
    await phone.waitForDataChannel();

    // The phone holds this request for the whole call.
    let holdEnded = false;
    const hold = get(`/conversations/${created.id}/hold`).then(async (r) => {
      expect(r.status).toBe(200);
      const text = await r.text();
      holdEnded = true;
      return text;
    });

    const cues = gemini.cues.length;
    await post(`/conversations/${created.id}/ready`);
    for (let i = 0; i < 100 && gemini.cues.length === cues; i++) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 700));
    expect(holdEnded).toBe(false); // still held while the call is live

    await post(`/conversations/${created.id}/end`);
    await phone.close();
    expect(await hold).toMatch(/^live\n[\s\S]*ended\n$/); // released when the call ends

    // Queued in the database, not in Redis.
    const [row] = await sql<{ analysisNextAt: Date | null }>('SELECT "analysisNextAt" FROM conversation_sessions WHERE id = $1', [created.id]);
    expect(row).toBeDefined();

    // The results screen long-polls until the in-process worker has finished.
    const waited = (await (await get(`/conversations/${created.id}/feedback/wait`)).json()) as { analysisStatus: string };
    expect(waited.analysisStatus).toBe('COMPLETED');
    const detail = (await (await get(`/conversations/${created.id}`)).json()) as ConversationDetail;
    expect(detail.feedback?.overallScore).toBe(70);
    const [done] = await sql<{ analysisNextAt: Date | null; analysisAttempts: number }>(
      'SELECT "analysisNextAt", "analysisAttempts" FROM conversation_sessions WHERE id = $1',
      [created.id],
    );
    expect(done).toEqual({ analysisNextAt: null, analysisAttempts: 1 });
  });

  it('only the owner can hold or wait on a conversation', async () => {
    const other = await verifiedUser(api, 'free.tier.other@example.com');
    const [row] = await sql<{ id: string }>('SELECT s.id FROM conversation_sessions s JOIN users u ON u.id = s."userId" WHERE u.email = $1 LIMIT 1', ['free.tier@example.com']);
    expect((await fetch(`${api.base}/conversations/${row!.id}/hold`, { headers: { Cookie: other } })).status).toBe(404);
    expect((await fetch(`${api.base}/conversations/${row!.id}/feedback/wait`, { headers: { Cookie: other } })).status).toBe(404);
  });
});
