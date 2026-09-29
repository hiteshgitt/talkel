/**
 * Boots the compiled API (dist/main.js) against a fake OpenAI Realtime server and drives
 * the full POC call lifecycle over HTTP. Needs `nest build` first (the test:e2e script does it).
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocketServer, type WebSocket } from 'ws';

const TOKEN = 'e2e-dev-token-0123456789';

interface FakeOpenAI {
  url: string;
  createCalls: Array<{ auth: string | undefined; body: string }>;
  hangups: string[];
  sidebandMessages: unknown[];
  close(): Promise<void>;
}

async function startFakeOpenAI(): Promise<FakeOpenAI> {
  const state = { createCalls: [] as FakeOpenAI['createCalls'], hangups: [] as string[], sidebandMessages: [] as unknown[] };
  let seq = 0;

  const server: Server = createServer(async (req, res) => {
    const body = await readBody(req);
    if (req.method === 'POST' && req.url === '/v1/realtime/calls') {
      state.createCalls.push({ auth: req.headers.authorization, body });
      seq += 1;
      res.writeHead(201, { 'Content-Type': 'application/sdp', Location: `/v1/realtime/calls/rtc_fake${seq}` });
      res.end('v=0\r\no=- fake answer\r\n');
      return;
    }
    const hangup = req.url?.match(/^\/v1\/realtime\/calls\/([^/]+)\/hangup$/);
    if (req.method === 'POST' && hangup) {
      state.hangups.push(hangup[1]!);
      res.writeHead(200).end();
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws: WebSocket, req) => {
    if (req.headers.authorization !== 'Bearer sk-fake' || !req.url?.includes('call_id=rtc_fake')) {
      ws.close(4001, 'unauthorized');
      return;
    }
    ws.send(JSON.stringify({ type: 'session.created', session: {} }));
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as { type: string };
      state.sidebandMessages.push(msg);
      if (msg.type === 'response.create') {
        // Simulate: AI greets, user replies (transcript arrives late), AI replies and is interrupted.
        const events = [
          { type: 'response.output_item.added', response_id: 'r1', item: { id: 'a1', type: 'message', role: 'assistant' } },
          { type: 'response.output_audio_transcript.done', item_id: 'a1', transcript: 'Hey! How was your weekend?' },
          { type: 'response.done', response: { id: 'r1', status: 'completed', usage: { output_token_details: { audio_tokens: 40 } } } },
          { type: 'input_audio_buffer.speech_started', item_id: 'u1', audio_start_ms: 1000 },
          { type: 'input_audio_buffer.speech_stopped', item_id: 'u1', audio_end_ms: 2500 },
          { type: 'response.output_item.added', response_id: 'r2', item: { id: 'a2', type: 'message', role: 'assistant' } },
          { type: 'conversation.item.input_audio_transcription.completed', item_id: 'u1', transcript: 'Um, it was good. I go to trek.' },
          { type: 'response.output_audio_transcript.delta', item_id: 'a2', delta: 'Oh nice, where did' },
          { type: 'input_audio_buffer.speech_started', item_id: 'u2', audio_start_ms: 4000 },
          { type: 'response.done', response: { id: 'r2', status: 'cancelled', usage: null } },
          { type: 'conversation.item.input_audio_transcription.completed', item_id: 'u2', transcript: 'Sorry, one more thing' },
        ];
        for (const e of events) ws.send(JSON.stringify(e));
      }
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    ...state,
    close: async () => {
      for (const c of wss.clients) c.terminate();
      wss.close();
      server.close();
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

async function startApi(env: Record<string, string>): Promise<{ base: string; proc: ChildProcess }> {
  const port = String(20000 + Math.floor(Math.random() * 20000));
  const proc = spawn(process.execPath, ['dist/main.js'], {
    cwd: join(import.meta.dirname, '..'),
    // Never read apps/api/.env here: it may hold a real key/base URL, and these tests must only
    // ever talk to the fake provider.
    env: { PATH: process.env.PATH ?? '', PORT: port, POC_DEV_TOKEN: TOKEN, DOTENV_PATH: '/nonexistent/.env', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout?.on('data', (d: Buffer) => (output += d.toString()));
  proc.stderr?.on('data', (d: Buffer) => (output += d.toString()));
  const base = `http://127.0.0.1:${port}/v1`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) return { base, proc };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error(`API did not start:\n${output}`);
}

const post = (url: string, body?: unknown, token: string | null = TOKEN) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('POC call lifecycle (fake OpenAI)', () => {
  let fake: FakeOpenAI;
  let api: { base: string; proc: ChildProcess };

  beforeAll(async () => {
    fake = await startFakeOpenAI();
    api = await startApi({
      OPENAI_API_KEY: 'sk-fake',
      OPENAI_BASE_URL: fake.url,
      CALL_LOG_DIR: mkdtempSync(join(tmpdir(), 'speakai-calllogs-')),
    });
  });

  afterAll(async () => {
    api?.proc.kill();
    await fake?.close();
  });

  it('rejects requests without the dev token', async () => {
    const res = await post(`${api.base}/poc/connect`, { sdpOffer: 'v=0', voice: 'female' }, null);
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect(await res.json()).toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('validates the body', async () => {
    const res = await post(`${api.base}/poc/connect`, { sdpOffer: '', voice: 'robot' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('connects, greets on ready, builds an ordered transcript, and hangs up on end', async () => {
    const connectRes = await post(`${api.base}/poc/connect`, { sdpOffer: 'v=0\r\noffer\r\n', voice: 'female' });
    expect(connectRes.status).toBe(201);
    const connect = (await connectRes.json()) as { callId: string; sdpAnswer: string; maxDurationSec: number };
    expect(connect.callId).toMatch(/^rtc_fake/);
    expect(connect.sdpAnswer.startsWith('v=0')).toBe(true);

    // Server-side key and config were used for the provider call; the device only ever saw the SDP answer.
    const created = fake.createCalls.at(-1)!;
    expect(created.auth).toBe('Bearer sk-fake');
    expect(created.body).toContain('name="session"');
    expect(created.body).toContain('"voice":"marin"');
    expect(created.body).toContain('semantic_vad');

    expect((await post(`${api.base}/poc/calls/${connect.callId}/ready`)).status).toBe(204);
    await new Promise((r) => setTimeout(r, 300)); // let the fake stream its events
    expect(fake.sidebandMessages).toContainEqual({ type: 'response.create' });

    const endRes = await post(`${api.base}/poc/calls/${connect.callId}/end`);
    expect(endRes.status).toBe(200);
    const ended = (await endRes.json()) as { status: string; endReason: string; turns: Array<Record<string, unknown>> };
    expect(ended).toMatchObject({ status: 'ENDED', endReason: 'USER_ENDED' });
    expect(ended.turns.map((t) => [t.speaker, t.text, t.interrupted])).toEqual([
      ['AI', 'Hey! How was your weekend?', false],
      ['USER', 'Um, it was good. I go to trek.', false],
      ['AI', 'Oh nice, where did', true],
      ['USER', 'Sorry, one more thing', false],
    ]);
    expect(fake.hangups).toContain(connect.callId);

    const tx = await fetch(`${api.base}/poc/calls/${connect.callId}/transcript`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(tx.status).toBe(200);
  });

  it('returns 404 for unknown calls', async () => {
    const res = await post(`${api.base}/poc/calls/rtc_nope/end`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: 'CALL_NOT_FOUND' });
  });
});

describe('POC without a provider key', () => {
  it('boots and returns 503 PROVIDER_NOT_CONFIGURED', async () => {
    const api = await startApi({});
    try {
      const res = await post(`${api.base}/poc/connect`, { sdpOffer: 'v=0', voice: 'male' });
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
    } finally {
      api.proc.kill();
    }
  });
});
