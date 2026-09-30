import { describe, expect, it } from 'vitest';
import { bandToScore, groundErrors, overallScore, quotedIn, smoothedBandToScore } from './grounding.js';
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

  it('fails fast on a non-retryable error', async () => {
    const { generateStructured, EvaluationProviderError } = await import('./gemini-text.js');
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { message: 'bad schema' } }), { status: 400 })) as unknown as typeof fetch;
    await expect(
      generateStructured({ apiKey: 'k', baseUrl: 'https://x.test', models: ['m'], fetchImpl, sleep: async () => undefined }, { system: '', user: '' }, {}),
    ).rejects.toBeInstanceOf(EvaluationProviderError);
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
});
