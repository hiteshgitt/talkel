/**
 * Full conversation lifecycle against the compiled server, a real Postgres, a fake Gemini Live
 * server and a headless WebRTC phone.
 */
import type { Catalog, ConversationDetail, ConversationList, CreateConversationResponse, Quota } from '@speakai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiProcess, startApi } from './support/api-process.js';
import { createFakePhone } from './support/fake-phone.js';
import { type FakeGemini, startFakeGemini } from './support/fake-gemini.js';
import { sql, verifiedUser } from './support/users.js';

let api: ApiProcess;
let gemini: FakeGemini;
let alice: string;
let bob: string;
let catalog: Catalog;

beforeAll(async () => {
  gemini = await startFakeGemini();
  api = await startApi({ GEMINI_API_KEY: 'fake-gemini-key', GEMINI_LIVE_URL: gemini.url, RTC_ICE_SERVERS: '' });
  alice = await verifiedUser(api, 'alice.conv@example.com');
  bob = await verifiedUser(api, 'bob.conv@example.com');
  catalog = (await (await get('/catalog', alice)).json()) as Catalog;
});
afterAll(async () => {
  api?.stop();
  await gemini?.close();
});

function get(path: string, cookie: string) {
  return fetch(`${api.base}${path}`, { headers: { Cookie: cookie } });
}
function post(path: string, cookie: string, body?: unknown) {
  return fetch(`${api.base}${path}`, {
    method: 'POST',
    headers: { Cookie: cookie, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const scenario = (slug: string) => catalog.scenarios.find((s) => s.slug === slug)!.id;
const persona = (slug: string) => catalog.personas.find((p) => p.slug === slug)!.id;
const until = async (cond: () => boolean | Promise<boolean>, ms = 8000) => {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > ms) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe('catalog', () => {
  it('lists the 5 MVP scenarios and 4 personas without any prompt or hidden data', async () => {
    expect(catalog.scenarios.map((s) => s.slug)).toEqual(['friendly-conversation', 'job-interview', 'client-meeting', 'debate', 'bargaining']);
    expect(catalog.personas.map((p) => p.slug)).toEqual(['maya', 'rohan', 'priya', 'arjun']);
    const raw = JSON.stringify(catalog);
    expect(raw).not.toMatch(/promptTemplate|promptFragment|floorPrice|params|voices/);
  });

  it('requires sign-in', async () => {
    expect((await fetch(`${api.base}/catalog`)).status).toBe(401);
  });
});

describe('a full conversation', () => {
  it('creates, connects over WebRTC, talks, uses tools, ends, and saves everything', async () => {
    const quotaBefore = (await (await get('/quota', alice)).json()) as Quota;
    expect(quotaBefore).toMatchObject({ dailyLimitSec: 600, usedTodaySec: 0, remainingSec: 600 });

    // 1. create
    const createdRes = await post('/conversations', alice, { scenarioId: scenario('bargaining'), personaId: persona('arjun'), durationSec: 120 });
    expect(createdRes.status).toBe(201);
    const created = (await createdRes.json()) as CreateConversationResponse;
    expect(created.brief.briefing).toMatch(/Negotiate!/);
    expect(JSON.stringify(created)).not.toMatch(/floor/i);
    expect(created.durationSec).toBe(120);

    // A second conversation can't start while one is set up and connectable.
    const phone = await createFakePhone();
    const connectRes = await post(`/conversations/${created.id}/connect`, alice, { sdpOffer: phone.offer });
    expect(connectRes.status).toBe(200);
    expect((await post('/conversations', alice, { scenarioId: scenario('debate'), personaId: persona('maya') })).status).toBe(409);

    // 2. connect: the gateway gave Gemini the scenario setup (instructions, voice, tools, turn-taking)
    const { sdpAnswer } = (await connectRes.json()) as { sdpAnswer: string };
    const setup = gemini.setups.at(-1)!;
    expect(JSON.stringify(setup.systemInstruction)).toContain('never go below');
    expect(setup.generationConfig).toMatchObject({ speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } } });
    expect(JSON.stringify(setup.tools)).toContain('record_offer');

    await phone.accept(sdpAnswer);
    await phone.waitForDataChannel();

    // 3. ready → the AI opens; its audio reaches the phone and the phone's mic reaches Gemini
    expect((await post(`/conversations/${created.id}/ready`, alice)).status).toBe(204);
    await until(() => phone.aiPackets() > 10);
    await until(() => gemini.audioMessages() > 10);
    expect(gemini.cues[0]).toMatch(/^\(Call system: the call has just connected/);

    // 4. the model tried to sell below the floor price: corrected server-side
    await until(() => gemini.toolResponses.length > 0);
    expect(gemini.toolResponses[0]).toMatchObject({ id: 'offer-1', name: 'record_offer', response: { ok: false } });

    // 5. end → everything persisted
    const endRes = await post(`/conversations/${created.id}/end`, alice);
    expect(endRes.status).toBe(200);
    const ended = (await endRes.json()) as ConversationDetail;
    expect(ended).toMatchObject({ status: 'ENDED', endReason: 'USER_ENDED', scenarioTitle: 'Bargaining', personaName: 'Arjun' });
    expect(ended.turns).toEqual([expect.objectContaining({ speaker: 'AI', text: 'Hello! Nice to meet you.' })]);
    expect(ended.goals.length).toBe(3);
    await phone.close();

    const [row] = await sql<{ status: string; offer: string; floor: string; events: string }>(
      `SELECT status, "scenarioState"->'values'->>'currentOffer' AS offer, "scenarioState"->'values'->>'floorPrice' AS floor,
              (SELECT string_agg(type, ',' ORDER BY id) FROM conversation_events e WHERE e."sessionId" = s.id) AS events
       FROM conversation_sessions s WHERE id = $1`,
      [created.id],
    );
    expect(row!.offer).toBe(row!.floor); // clamped to the floor, never below
    expect(row!.events).toBe('READY,TOOL_CALL,ENDED');

    // 6. the time counts against today's allowance
    const quotaAfter = (await (await get('/quota', alice)).json()) as Quota;
    expect(quotaAfter.usedTodaySec).toBeGreaterThan(0);
    expect(quotaAfter.remainingSec).toBe(600 - quotaAfter.usedTodaySec);

    // 7. history
    const list = (await (await get('/conversations', alice)).json()) as ConversationList;
    expect(list.items[0]).toMatchObject({ id: created.id, scenarioTitle: 'Bargaining', turnCount: 1, status: 'ENDED' });
  });
});

describe('ownership and limits', () => {
  it("hides other users' conversations (404) and lets owners delete theirs", async () => {
    const created = (await (await post('/conversations', alice, { scenarioId: scenario('debate'), personaId: persona('rohan') })).json()) as CreateConversationResponse;
    expect((await get(`/conversations/${created.id}`, bob)).status).toBe(404);
    expect((await post(`/conversations/${created.id}/connect`, bob, { sdpOffer: 'v=0' })).status).toBe(404);
    expect((await fetch(`${api.base}/conversations/${created.id}`, { method: 'DELETE', headers: { Cookie: bob } })).status).toBe(404);
    expect((await get('/conversations/not-a-uuid', alice)).status).toBe(404);

    expect((await fetch(`${api.base}/conversations/${created.id}`, { method: 'DELETE', headers: { Cookie: alice } })).status).toBe(204);
    expect((await get(`/conversations/${created.id}`, alice)).status).toBe(404);
  });

  it('refuses to start when today’s free time is used up, and caps duration to what is left', async () => {
    const [user] = await sql<{ id: string }>('SELECT id FROM users WHERE email = $1', ['bob.conv@example.com']);
    await sql(`INSERT INTO usage_records ("userId", kind, provider, model, "billableSeconds") VALUES ($1, 'REALTIME', 'gemini', 'm', 500)`, [user!.id]);

    const capped = (await (await post('/conversations', bob, { scenarioId: scenario('debate'), personaId: persona('maya'), durationSec: 600 })).json()) as CreateConversationResponse;
    expect(capped.durationSec).toBe(100);
    await post(`/conversations/${capped.id}/end`, bob);

    await sql(`INSERT INTO usage_records ("userId", kind, provider, model, "billableSeconds") VALUES ($1, 'REALTIME', 'gemini', 'm', 90)`, [user!.id]);
    const refused = await post('/conversations', bob, { scenarioId: scenario('debate'), personaId: persona('maya') });
    expect(refused.status).toBe(402);
    expect(await refused.json()).toMatchObject({ code: 'QUOTA_EXCEEDED' });
  });

  it('validates input', async () => {
    const bad = await post('/conversations', alice, { scenarioId: 'nope', personaId: persona('maya') });
    expect(bad.status).toBe(400);
    const unknown = await post('/conversations', alice, { scenarioId: '00000000-0000-4000-8000-000000000000', personaId: persona('maya') });
    expect(unknown.status).toBe(404);
  });
});
