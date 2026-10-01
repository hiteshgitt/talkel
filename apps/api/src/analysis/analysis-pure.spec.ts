import { describe, expect, it } from 'vitest';
import { bandToScore, groundErrors, groundQuoted, overallScore, quotedIn, smoothedBandToScore } from './grounding.js';
import { computeFluency, countFillers } from './metrics.js';

describe('countFillers', () => {
  it('counts real fillers but not the same words used normally', () => {
    expect(countFillers(['Um, it was, uh, good. Actually I basically liked it, you know.'])).toEqual({
      um: 1,
      uh: 1,
      actually: 1,
      basically: 1,
      'you know': 1,
    });
    // "like" as a verb/preposition, "you know what", "I mean it" — not fillers
    expect(countFillers(['I like tea. It looks like rain. You know what I did? I mean it seriously'])).toEqual({});
    expect(countFillers(['It was, like, really big'])).toEqual({ like: 1 });
  });
});

describe('computeFluency', () => {
  it('computes pace, variety and latency from turns and live timing', () => {
    const turns = [
      { seq: 1, text: 'Yesterday I go to office and I am agree with my manager.' }, // 12 words
      { seq: 3, text: 'Um, it was good.' }, // 4 words
      { seq: 5, text: '[inaudible]' },
    ];
    const f = computeFluency(turns, { userSpeakingMs: 12_000, responseLatenciesMs: [800, 1200, 6500] });
    expect(f).toMatchObject({ userTurns: 2, userWords: 16, wordsPerMinute: 80, latencyP50Ms: 1200, latencyP90Ms: 6500, longPauseCount: 1 });
    expect(f.fillerCounts).toEqual({ um: 1 });
    expect(f.fillersPerMinute).toBe(5);
    expect(f.typeTokenRatio).toBeGreaterThan(0.8);
  });

  it('reports no rates when there was too little speech to measure', () => {
    const f = computeFluency([{ seq: 1, text: 'Hi' }], { userSpeakingMs: 800, responseLatenciesMs: [] });
    expect(f.wordsPerMinute).toBeNull();
    expect(f.fillersPerMinute).toBeNull();
    expect(f.latencyP50Ms).toBeNull();
  });
});

describe('grounding', () => {
  const said = new Map([
    [1, 'Yesterday I go to office.'],
    [3, 'I am agree with you'],
  ]);

  it('keeps corrections that quote the user, fixes the turn if the model picked the wrong one', () => {
    const { kept, dropped } = groundErrors(
      [
        { turnSeq: 1, original: 'I go to office', corrected: 'I went to the office' },
        { turnSeq: 1, original: 'I am agree', corrected: 'I agree' }, // actually in turn 3
        { turnSeq: 3, original: 'I have went there', corrected: 'I have gone there' }, // never said → hallucinated
        { turnSeq: 3, original: 'with you', corrected: 'With you.' }, // no real change
      ],
      said,
    );
    expect(kept).toEqual([
      { turnSeq: 1, original: 'I go to office', corrected: 'I went to the office' },
      { turnSeq: 3, original: 'I am agree', corrected: 'I agree' },
    ]);
    expect(dropped).toBe(2);
  });

  it('grounds other quoted feedback (phrasing, conversation moments) the same way', () => {
    const moments = [
      { turnSeq: 3, youSaid: 'I am agree with you', better: 'I agree — and I would add…' },
      { turnSeq: 3, youSaid: 'Fine.', better: 'Sounds good to me!' }, // never said
    ];
    const { kept, dropped } = groundQuoted(moments, said, (m) => m.youSaid, (m) => m.better);
    expect(kept.map((m) => m.youSaid)).toEqual(['I am agree with you']);
    expect(dropped).toBe(1);
  });

  it('ignores case, punctuation and curly quotes when matching', () => {
    expect(quotedIn('i DON’T know', "Well, I don't know.")).toBe(true);
    expect(quotedIn('', 'anything')).toBe(false);
  });

  it('maps bands to coarse scores and weights the overall', () => {
    expect([1, 2, 3, 4, 5].map(bandToScore)).toEqual([20, 40, 60, 80, 95]);
    expect([1, 3, 3.5, 5].map(smoothedBandToScore)).toEqual([20, 60, 70, 95]);
    expect(overallScore({ grammar: 3, vocabulary: 3, fluency: 3, conversation: 3, clarity: 3 })).toBe(60);
    expect(overallScore({ grammar: 5, vocabulary: 4, fluency: 4, conversation: 5, clarity: 5 }) % 5).toBe(0);
  });
});

describe('generateStructured', () => {
  it('falls back to the next model when one is overloaded, and skips thought parts', async () => {
    const { generateStructured } = await import('./gemini-text.js');
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      if (url.includes('model-a')) return new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 });
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: '{"ok":true}' }] } }],
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const r = await generateStructured(
      { apiKey: 'k', baseUrl: 'https://x.test/v1beta', models: ['model-a', 'model-b'], fetchImpl, sleep: async () => undefined },
      { system: 's', user: 'u' },
      {},
    );
    expect(r).toEqual({ text: '{"ok":true}', model: 'model-b', usage: { inputTokens: 100, outputTokens: 20 } });
    expect(calls.map((c) => c.split('/models/')[1])).toEqual(['model-a:generateContent', 'model-b:generateContent']);
  });

  it('skips a retired model and keeps retrying overloaded ones (the fallback must not end on it)', async () => {
    const { generateStructured } = await import('./gemini-text.js');
    const calls: string[] = [];
    let busy = 2;
    const fetchImpl = (async (url: string) => {
      const model = url.split('/models/')[1]!.split(':')[0]!;
      calls.push(model);
      if (model === 'retired') return new Response(JSON.stringify({ error: { message: 'no longer available to new users' } }), { status: 404 });
      if (busy-- > 0) return new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await generateStructured(
      { apiKey: 'k', baseUrl: 'https://x.test', models: ['busy', 'retired'], fetchImpl, sleep: async () => undefined },
      { system: '', user: '' },
      {},
    );
    expect(r.model).toBe('busy');
    expect(calls).toEqual(['busy', 'retired', 'busy', 'busy']);
  });

  it('fails without retrying when no model is usable, or on an auth error', async () => {
    const { generateStructured, EvaluationProviderError } = await import('./gemini-text.js');
    const reply = (status: number) => (async () => new Response(JSON.stringify({ error: { message: 'x' } }), { status })) as unknown as typeof fetch;
    const run = (status: number) =>
      generateStructured({ apiKey: 'k', baseUrl: 'https://x.test', models: ['a', 'b'], fetchImpl: reply(status), sleep: async () => undefined }, { system: '', user: '' }, {});
    for (const status of [400, 403]) {
      const err = await run(status).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(EvaluationProviderError);
      expect((err as InstanceType<typeof EvaluationProviderError>).retryable).toBe(false);
    }
  });
});

describe('evaluation prompt', () => {
  it('numbers learner lines, states measured facts and the feedback language', async () => {
    const { buildEvaluationPrompt, evaluationJsonSchema } = await import('./evaluation.js');
    const f = computeFluency([{ seq: 1, text: 'I go to office' }], { userSpeakingMs: 20_000, responseLatenciesMs: [900] });
    const p = buildEvaluationPrompt({
      scenario: { title: 'Bargaining', kind: 'negotiation', userRole: 'Customer', objective: 'Negotiate', briefing: 'Buy a jacket', slug: 'bargaining' },
      goals: [{ id: 'made_counter_offer', description: 'Made a counter-offer' }],
      level: 'INTERMEDIATE',
      feedbackLanguage: 'hi',
      turns: [
        { seq: 0, speaker: 'AI', text: 'Hello!' },
        { seq: 1, speaker: 'USER', text: 'I go to office' },
      ],
      fluency: f,
      availableScenarios: [{ slug: 'debate', title: 'Debate' }],
    });
    expect(p.user).toContain('[1] LEARNER: I go to office');
    expect(p.user).toContain('[0] AI: Hello!');
    expect(p.user).toContain('- made_counter_offer: Made a counter-offer');
    expect(p.system).toContain('Hindi');
    expect(JSON.stringify(evaluationJsonSchema)).toContain('grammarErrors');
  });

  it('sends Gemini a schema without size limits (they make large schemas fail with "invalid argument")', async () => {
    const { evaluationJsonSchema } = await import('./evaluation.js');
    const json = JSON.stringify(evaluationJsonSchema);
    for (const k of ['maxItems', 'maxLength', 'minLength', 'maximum']) expect(json).not.toContain(`"${k}"`);
    expect(json).toContain('"enum"'); // shape and allowed values are still constrained
  });

  it('clamps over-long answers to the limits instead of failing them', async () => {
    const { clampEvaluation, EvaluationOutput } = await import('./evaluation.js');
    const skill = { band: 3, rationale: 'r' };
    const error = { turnSeq: 1, original: 'a', corrected: 'b', category: 'OTHER', explanation: 'x'.repeat(1000), severity: 'LOW' };
    const raw = {
      summary: 's',
      strengths: ['a', 'b', 'c', 'd', 'e'],
      focusAreas: [],
      skills: { grammar: skill, vocabulary: skill, fluency: skill, conversation: skill, clarity: skill },
      grammarErrors: Array.from({ length: 30 }, () => error),
      phrasing: [],
      vocabulary: [],
      conversationSkills: { askedQuestions: true, elaborated: true, disagreedPolitely: null, clarified: null, notes: '' },
      conversationMoments: [],
      translationPatterns: [],
      goalsAchieved: [],
      memory: [],
      mission: null,
      recommendations: [],
    };
    expect(EvaluationOutput.safeParse(raw).success).toBe(false);
    const out = EvaluationOutput.parse(clampEvaluation(raw));
    expect(out.grammarErrors).toHaveLength(20);
    expect(out.strengths).toHaveLength(3);
    expect(out.grammarErrors[0]!.explanation.length).toBeLessThanOrEqual(400);
    expect(out.grammarErrors[0]!.explanation.endsWith('…')).toBe(true);
  });
});
