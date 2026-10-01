import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type WebSocket, WebSocketServer } from 'ws';

/** The fake's mission verdict, returned when the evaluation prompt has a MISSION section. */
export const FAKE_MISSION = {
  result: 'SUCCESS',
  headline: 'Bought for ₹1,450 (asked ₹2,500)',
  reason: 'You bargained politely and stayed on budget.',
  skills: [
    { key: 'persuasion', band: 4, rationale: 'Gave a reason.' },
    { key: 'empathy', band: 5, rationale: 'Not a skill of this mission — must be dropped.' },
  ],
};

/** The fake's comparison for replays ("try that answer again"). */
export const FAKE_REPLAY = {
  first: { band: 2, comment: 'Too blunt.' },
  second: { band: 4, comment: 'Polite and clear.' },
  improved: 'You gave a reason this time.',
  stillToWork: 'Make a counter-offer.',
  betterAnswer: 'It’s lovely, but it’s a bit over my budget — would you take ₹1,200?',
};

/** What the fake evaluation model "says". Two corrections are invalid on purpose (grounding must drop them). */
export const FAKE_EVALUATION = {
  summary: 'Good start.',
  strengths: ['Polite'],
  focusAreas: ['Past tense'],
  skills: {
    grammar: { band: 3, rationale: 'Some tense errors.' },
    vocabulary: { band: 4, rationale: 'Good words.' },
    fluency: { band: 4, rationale: 'Steady.' },
    conversation: { band: 3, rationale: 'Short answers.' },
    clarity: { band: 4, rationale: 'Clear.' },
  },
  grammarErrors: [
    { turnSeq: 0, original: 'Hello! Nice', corrected: 'Hello, nice', category: 'OTHER', explanation: 'x', severity: 'LOW' },
    { turnSeq: 1, original: 'I have went to Goa', corrected: 'I went to Goa', category: 'VERB_TENSE', explanation: 'invented', severity: 'HIGH' },
    { turnSeq: 1, original: 'too costly', corrected: 'too expensive', category: 'WORD_CHOICE', explanation: 'More natural.', severity: 'LOW' },
  ],
  phrasing: [
    { turnSeq: 1, original: 'I can give you one thousand rupees only', better: 'I can only give you a thousand rupees', why: 'Word order.' },
    { turnSeq: 1, original: 'I am doing job', better: 'I work', why: 'invented' },
  ],
  vocabulary: [{ kind: 'UPGRADE', term: 'good', alternatives: ['great'], example: null }],
  conversationSkills: { askedQuestions: false, elaborated: false, disagreedPolitely: null, clarified: null, notes: 'n' },
  conversationMoments: [
    { turnSeq: 1, kind: 'ABRUPT_TONE', youSaid: 'this jacket is too costly', better: 'It’s a lovely jacket, but it’s a bit over my budget.', why: 'Softer.' },
    { turnSeq: 1, kind: 'TOO_SHORT', youSaid: 'Yes.', better: 'Yes, I’d like that.', why: 'invented' },
  ],
  translationPatterns: [],
  goalsAchieved: ['made_counter_offer', 'not_a_real_goal'],
  mission: null as null | Record<string, unknown>,
  recommendations: [{ type: 'SCENARIO', scenarioSlug: 'debate', title: 'Try a debate', reason: 'r' }],
};

export interface FakeGemini {
  url: string;
  restBase: string;
  evaluations: string[];
  setups: Array<Record<string, unknown>>;
  cues: string[];
  toolResponses: Array<{ id: string; name: string; response: Record<string, unknown> }>;
  audioMessages(): number;
  close(): Promise<void>;
}

/**
 * Minimal Gemini Live (BidiGenerateContent) stand-in: acknowledges setup, answers the opening cue
 * with a spoken greeting (PCM audio + transcript), and for negotiations tries a below-floor offer.
 */
export async function startFakeGemini(): Promise<FakeGemini> {
  const setups: Array<Record<string, unknown>> = [];
  const cues: string[] = [];
  const toolResponses: FakeGemini['toolResponses'] = [];
  let audio = 0;

  // REST side: the after-call evaluation (generateContent with structured output).
  const evaluations: string[] = [];
  const server: Server = createServer((req, res) => {
    const m = req.url?.match(/^\/v1beta\/models\/([^/:]+):generateContent$/);
    if (req.method !== 'POST' || !m || req.headers['x-goog-api-key'] !== 'fake-gemini-key') {
      res.writeHead(404).end();
      return;
    }
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      evaluations.push(body);
      const evaluation = body.includes('SECOND ANSWER (replay)')
        ? FAKE_REPLAY
        : { ...FAKE_EVALUATION, mission: body.includes('MISSION (level') ? FAKE_MISSION : null };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(evaluation) }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 300 } }));
    });
  });
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws: WebSocket, req) => {
    if (req.headers['x-goog-api-key'] !== 'fake-gemini-key') {
      ws.close(1008, 'API key not valid');
      return;
    }
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as Record<string, any>;
      if (msg.setup) {
        setups.push(msg.setup);
        ws.send(JSON.stringify({ setupComplete: {} }));
      } else if (msg.realtimeInput) {
        audio++;
      } else if (msg.toolResponse) {
        toolResponses.push(...msg.toolResponse.functionResponses);
      } else if (msg.clientContent) {
        const text: string = msg.clientContent.turns?.[0]?.parts?.[0]?.text ?? '';
        cues.push(text);
        if (!msg.clientContent.turnComplete) return; // e.g. the wrap-up note
        const pcm = Buffer.alloc(24000 * 2 * 0.4); // 400 ms of 24 kHz audio
        for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(6000 * Math.sin(i / 8)), i * 2);
        ws.send(JSON.stringify({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: pcm.toString('base64') } }] } } }));
        ws.send(JSON.stringify({ serverContent: { outputTranscription: { text: 'Hello! Nice to meet you.' } } }));
        ws.send(JSON.stringify({ serverContent: { turnComplete: true } }));
        ws.send(
          JSON.stringify({
            serverContent: { inputTranscription: { text: 'Hi, this jacket is too costly, I can give you one thousand rupees only.' } },
          }),
        );
        const tools = (setups.at(-1)?.tools as Array<{ functionDeclarations: Array<{ name: string }> }> | undefined) ?? [];
        if (tools.some((t) => t.functionDeclarations.some((d) => d.name === 'record_offer'))) {
          ws.send(JSON.stringify({ toolCall: { functionCalls: [{ id: 'offer-1', name: 'record_offer', args: { price: 10 } }] } }));
        }
        ws.send(JSON.stringify({ serverContent: { turnComplete: true }, usageMetadata: { promptTokenCount: 1200, responseTokenCount: 90, responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 90 }] } }));
      }
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}/ws`,
    restBase: `http://127.0.0.1:${port}/v1beta`,
    evaluations,
    setups,
    cues,
    toolResponses,
    audioMessages: () => audio,
    close: async () => {
      for (const c of wss.clients) c.terminate();
      wss.close();
      server.close();
    },
  };
}
