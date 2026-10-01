/**
 * Full conversation lifecycle against the compiled server, a real Postgres, a fake Gemini Live
 * server and a headless WebRTC phone.
 */
import { CONSENT_VERSION, MissionList, MistakeList, Progress } from '@speakai/contracts';
import type { Catalog, ConversationDetail, ConversationList, CreateConversationResponse, Quota } from '@speakai/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type ApiProcess, startApi, startWorker } from './support/api-process.js';
import { createFakePhone } from './support/fake-phone.js';
import { type FakeGemini, startFakeGemini } from './support/fake-gemini.js';
import { sql, verifiedUser } from './support/users.js';


let api: ApiProcess;
let gemini: FakeGemini;
let alice: string;
let bob: string;
let catalog: Catalog;
let worker: ReturnType<typeof startWorker>;

beforeAll(async () => {
  gemini = await startFakeGemini();
  const providerEnv = { GEMINI_API_KEY: 'fake-gemini-key', GEMINI_LIVE_URL: gemini.url, GEMINI_API_BASE: gemini.restBase, EVAL_MODELS: 'fake-eval-model' };
  api = await startApi({ ...providerEnv, RTC_ICE_SERVERS: '' });
  worker = startWorker(providerEnv);
  alice = await verifiedUser(api, 'alice.conv@example.com');
  bob = await verifiedUser(api, 'bob.conv@example.com');
  catalog = (await (await get('/catalog', alice)).json()) as Catalog;
});
afterAll(async () => {
  worker?.stop();
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
    // Free plan: the partner is random; the setup must use that partner's voice.
    const voiceOf: Record<string, string> = { maya: 'Kore', rohan: 'Puck', priya: 'Aoede', arjun: 'Charon' };
    expect(setup.generationConfig).toMatchObject({
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceOf[created.persona.slug] } } },
    });
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

    // 5. recording: needs the current privacy notice, then captures both voices
    const denied = await post(`/conversations/${created.id}/recording`, alice, { on: true });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect((await post('/me/consent', alice, { consentVersion: CONSENT_VERSION })).status).toBe(200);
    const rec = await post(`/conversations/${created.id}/recording`, alice, { on: true });
    expect(await rec.json()).toEqual({ recording: true });
    await until(() => phone.controls.some((c) => c.type === 'recording' && c.on === true));
    // Ask the fake AI to speak again so there is audio in the recording.
    const before = phone.aiPackets();
    await new Promise((r) => setTimeout(r, 1500));
    expect(phone.aiPackets()).toBeGreaterThanOrEqual(before);
    expect((await get(`/conversations/${created.id}/recording`, alice)).status).toBe(409); // still live

    // 6. end → everything persisted
    const endRes = await post(`/conversations/${created.id}/end`, alice);
    expect(endRes.status).toBe(200);
    const ended = (await endRes.json()) as ConversationDetail;
    expect(ended).toMatchObject({ status: 'ENDED', endReason: 'USER_ENDED', scenarioTitle: 'Bargaining', personaName: created.persona.name });
    expect(ended.turns[0]).toEqual(expect.objectContaining({ speaker: 'AI', text: 'Hello! Nice to meet you.' }));
    expect(ended.turns.some((t) => t.speaker === 'USER')).toBe(true);
    expect(ended.goals.length).toBe(3);
    expect(ended.recording).toMatchObject({ inProgress: false });
    expect(ended.recording!.durationMs).toBeGreaterThan(1000);
    await phone.close();

    // The recording is a valid Ogg Opus file, only for its owner, and seekable.
    const audio = await get(`/conversations/${created.id}/recording`, alice);
    expect(audio.status).toBe(200);
    expect(audio.headers.get('content-type')).toBe('audio/ogg');
    const bytes = Buffer.from(await audio.arrayBuffer());
    expect(bytes.toString('ascii', 0, 4)).toBe('OggS');
    expect(bytes.toString('ascii', 28, 36)).toBe('OpusHead');
    expect(bytes.length).toBe(ended.recording!.bytes);
    expect((await get(`/conversations/${created.id}/recording`, bob)).status).toBe(404);
    const part = await fetch(`${api.base}/conversations/${created.id}/recording`, { headers: { Cookie: alice, Range: 'bytes=10-19' } });
    expect(part.status).toBe(206);
    expect(Buffer.from(await part.arrayBuffer())).toEqual(bytes.subarray(10, 20));

    const [row] = await sql<{ status: string; offer: string; floor: string; events: string }>(
      `SELECT status, "scenarioState"->'values'->>'currentOffer' AS offer, "scenarioState"->'values'->>'floorPrice' AS floor,
              (SELECT string_agg(type, ',' ORDER BY id) FROM conversation_events e WHERE e."sessionId" = s.id) AS events
       FROM conversation_sessions s WHERE id = $1`,
      [created.id],
    );
    expect(row!.offer).toBe(row!.floor); // clamped to the floor, never below
    expect(row!.events).toBe('READY,TOOL_CALL,RECORDING_ON,ENDED');

    // 6. the time counts against today's allowance
    const quotaAfter = (await (await get('/quota', alice)).json()) as Quota;
    expect(quotaAfter.usedTodaySec).toBeGreaterThan(0);
    expect(quotaAfter.remainingSec).toBe(600 - quotaAfter.usedTodaySec);

    // 7. history
    const list = (await (await get('/conversations', alice)).json()) as ConversationList;
    expect(list.items[0]).toMatchObject({ id: created.id, scenarioTitle: 'Bargaining', scenarioSlug: 'bargaining', status: 'ENDED' });

    // 8. after-call feedback: queued, analysed by the worker, grounded and saved
    let detail: ConversationDetail | null = null;
    await until(async () => {
      detail = (await (await get(`/conversations/${created.id}`, alice)).json()) as ConversationDetail;
      return detail.analysisStatus === 'COMPLETED' || detail.analysisStatus === 'FAILED';
    }, 20_000);
    const d = detail as unknown as ConversationDetail;
    expect(d.analysisStatus).toBe('COMPLETED');
    const f = d.feedback!;
    // Overall comes from the bands (3,4,4,3,4), not from the model.
    expect(f.overallScore).toBe(70);
    const listed = (await (await get('/conversations', alice)).json()) as ConversationList;
    expect(listed.items[0]).toMatchObject({ id: created.id, overallScore: 70 });
    expect(f.skills.grammar).toEqual({ band: 3, score: 60, rationale: 'Some tense errors.' });
    // Invented corrections are dropped (one quotes the AI, one quotes words the learner never said);
    // the genuine one is kept.
    expect(f.grammarErrors).toEqual([expect.objectContaining({ original: 'too costly', corrected: 'too expensive', category: 'WORD_CHOICE' })]);
    // Same grounding for "say it more naturally" and conversation moments.
    expect(f.phrasing).toEqual([expect.objectContaining({ original: 'I can give you one thousand rupees only' })]);
    expect(f.conversationMoments).toEqual([expect.objectContaining({ kind: 'ABRUPT_TONE', youSaid: 'this jacket is too costly' })]);
    expect(f.fluency.userWords).toBe(14);
    // Unknown goal ids are ignored; the real one is recorded.
    expect(d.goals.find((g) => g.id === 'made_counter_offer')?.achieved).toBe(true);
    expect(f.recommendations).toEqual([{ type: 'SCENARIO', scenarioSlug: 'debate', title: 'Try a debate', reason: 'r' }]);
    // The evaluation saw the transcript as numbered learner lines.
    expect(gemini.evaluations.at(-1)).toContain('LEARNER: Hi, this jacket is too costly');
    const [profile] = await sql<{ analysedCount: number }>(
      `SELECT "analysedCount" FROM learning_profiles lp JOIN users u ON u.id = lp."userId" WHERE u.email = $1`,
      ['alice.conv@example.com'],
    );
    expect(profile?.analysedCount).toBe(1);
    const progress = Progress.parse(await (await get('/progress', alice)).json());
    expect(progress.analysedConversations).toBe(1);
    expect(progress.skills.grammar).toBe(60); // band 3 → 60, the same scale as a conversation's feedback
    expect(progress.skills.clarity).toBe(80);
    expect(progress.history).toHaveLength(1);
    expect(progress.history[0]).toMatchObject({ overall: expect.any(Number), mistakes: 1 });
    expect(progress.streak).toMatchObject({ current: 1, practisedToday: true });
    expect(progress.calendar).toHaveLength(28);
    expect(progress.calendar.at(-1)!.seconds).toBeGreaterThan(0);
    expect(progress.confidence.map((i) => i.key)).toContain('RESPONSE_SPEED');
    expect(progress.commonMistakes[0]).toMatchObject({ trend: null }); // nothing to compare with yet

    const category = progress.commonMistakes[0]!.category;
    const mistakes = MistakeList.parse(await (await get(`/progress/mistakes/${category}`, alice)).json());
    expect(mistakes.items[0]).toMatchObject({ original: 'too costly', conversationId: progress.history[0]!.conversationId });
    expect((await get(`/progress/mistakes/${category}`, bob)).status).toBe(200);
    expect(MistakeList.parse(await (await get(`/progress/mistakes/${category}`, bob)).json()).items).toHaveLength(0); // only your own
    expect((await get('/progress/mistakes/NOPE', alice)).status).toBe(404);
  });
});

describe('partner & accent by plan', () => {
  it('free plan: partner and accent are random even if one is requested', async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const res = await post('/conversations', alice, { scenarioId: scenario('debate'), personaId: persona('priya'), accent: 'BRITISH' });
      const c = (await res.json()) as CreateConversationResponse;
      seen.add(c.persona.slug);
      await post(`/conversations/${c.id}/end`, alice);
    }
    expect(seen.size).toBeGreaterThan(1); // ignored the requested partner
  });

  it('pro plan: the chosen partner, voice gender and accent are honoured', async () => {
    await sql(`UPDATE users SET plan = 'PRO' WHERE email = $1`, ['alice.conv@example.com']);
    const chosen = (await (await post('/conversations', alice, { scenarioId: scenario('debate'), personaId: persona('priya'), accent: 'BRITISH' })).json()) as CreateConversationResponse;
    expect(chosen).toMatchObject({ persona: { slug: 'priya' }, accent: 'BRITISH' });
    await post(`/conversations/${chosen.id}/end`, alice);

    const male = (await (await post('/conversations', alice, { scenarioId: scenario('debate'), voice: 'MALE' })).json()) as CreateConversationResponse;
    expect(male.persona.gender).toBe('MALE');
    await post(`/conversations/${male.id}/end`, alice);
    await sql(`UPDATE users SET plan = 'FREE' WHERE email = $1`, ['alice.conv@example.com']);
  });
});

describe('recordings', () => {
  it('can be deleted by the owner, and go with the conversation', async () => {
    const [row] = await sql<{ id: string }>(
      `SELECT id FROM conversation_sessions WHERE "recordingKey" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1`,
    );
    expect((await fetch(`${api.base}/conversations/${row!.id}/recording`, { method: 'DELETE', headers: { Cookie: bob } })).status).toBe(404);
    expect((await fetch(`${api.base}/conversations/${row!.id}/recording`, { method: 'DELETE', headers: { Cookie: alice } })).status).toBe(204);
    expect((await get(`/conversations/${row!.id}/recording`, alice)).status).toBe(404);
    const detail = (await (await get(`/conversations/${row!.id}`, alice)).json()) as ConversationDetail;
    expect(detail.recording).toBeNull();
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

describe('missions', () => {
  it('lists missions separately from practice, without prompts, secrets or outcome rules', async () => {
    expect(catalog.scenarios.some((s) => s.slug.startsWith('mission-'))).toBe(false);
    const res = await get('/missions', alice);
    const { missions } = MissionList.parse(await res.json());
    expect(missions.map((m) => m.slug)).toEqual([
      'mission-get-the-job',
      'mission-negotiate-raise',
      'mission-angry-customer',
      'mission-hotel-problem',
      'mission-win-the-debate',
      'mission-bargain',
    ]);
    expect(missions[1]).toMatchObject({ group: 'career', progress: { unlockedLevel: 1, passedLevels: [], attempts: 0 } });
    expect(missions[1]!.objectives[0]).toBe('Make your case with concrete results');
    expect(JSON.stringify(missions)).not.toMatch(/ceiling|acceptable|concession|floorPrice|SUCCESS|promptTemplate/);
  });

  it('plays a level, judges the outcome and unlocks the next level', async () => {
    const { missions } = MissionList.parse(await (await get('/missions', alice)).json());
    const bargain = missions.find((m) => m.slug === 'mission-bargain')!;

    const locked = await post('/conversations', alice, { scenarioId: bargain.id, missionLevel: 2 });
    expect(locked.status).toBe(403);
    expect(await locked.json()).toMatchObject({ code: 'MISSION_LEVEL_LOCKED' });

    const created = (await (await post('/conversations', alice, { scenarioId: bargain.id, missionLevel: 1, durationSec: 60 })).json()) as CreateConversationResponse;
    expect(created.mission).toEqual({ level: 1, objectives: bargain.objectives, aiCharacter: bargain.aiCharacter });

    const phone = await createFakePhone();
    const { sdpAnswer } = (await (await post(`/conversations/${created.id}/connect`, alice, { sdpOffer: phone.offer })).json()) as { sdpAnswer: string };
    // The pressure level reaches the AI's instructions.
    expect(JSON.stringify(gemini.setups.at(-1)!.systemInstruction)).toContain('Mission difficulty 1 of 5');
    await phone.accept(sdpAnswer);
    await phone.waitForDataChannel();
    await post(`/conversations/${created.id}/ready`, alice);
    await until(() => gemini.toolResponses.some((t) => t.id === 'offer-1'));
    await new Promise((r) => setTimeout(r, 500));
    await post(`/conversations/${created.id}/end`, alice);
    await phone.close();

    let detail: ConversationDetail | null = null;
    await until(async () => {
      detail = (await (await get(`/conversations/${created.id}`, alice)).json()) as ConversationDetail;
      return detail.analysisStatus === 'COMPLETED' || detail.analysisStatus === 'FAILED';
    }, 20_000);
    const d = detail as unknown as ConversationDetail;
    expect(d.missionId).toBe(bargain.id);
    expect(d.missionLevel).toBe(1);
    // The evaluator got the outcome rule with the seller's secret minimum; the user never sees it.
    expect(gemini.evaluations.at(-1)).toMatch(/MISSION \(level 1 of 5, \\"Comfortable\\"\)/);
    expect(gemini.evaluations.at(-1)).toContain('secret minimum');
    expect(d.feedback!.mission).toMatchObject({
      level: 1,
      result: 'SUCCESS',
      headline: 'Bought for ₹1,450 (asked ₹2,500)',
      passed: true,
      objectivesAchieved: 1,
      objectivesTotal: 4,
      missionScore: 50, // (overall 70 + objectives 25) / 2 = 47.5 → 50
      skills: [{ key: 'persuasion', band: 4, score: 80, rationale: 'Gave a reason.' }], // non-mission skill dropped
    });

    const after = MissionList.parse(await (await get('/missions', alice)).json()).missions.find((m) => m.slug === 'mission-bargain')!;
    expect(after.progress).toEqual({ unlockedLevel: 2, passedLevels: [1], bestScores: { '1': 50 }, attempts: 1 });
    const listed = (await (await get('/conversations', alice)).json()) as ConversationList;
    expect(listed.items[0]).toMatchObject({ id: created.id, missionLevel: 1 });
    const next = await post('/conversations', alice, { scenarioId: bargain.id, missionLevel: 2 });
    expect(next.status).toBe(201);
    await post(`/conversations/${((await next.json()) as CreateConversationResponse).id}/end`, alice);
  });
});

