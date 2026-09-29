import { describe, expect, it, vi } from 'vitest';
import { OpenAICallsClient, parseCallId, ProviderError } from './openai-calls.client.js';

describe('parseCallId', () => {
  it.each([
    ['/v1/realtime/calls/rtc_abc123', 'rtc_abc123'],
    ['https://api.openai.com/v1/realtime/calls/rtc_abc123', 'rtc_abc123'],
    ['/v1/realtime/calls/rtc_abc123?x=1', 'rtc_abc123'],
    [null, null],
    ['', null],
    ['/v1/realtime/calls/<script>', null],
  ])('%s → %s', (input, expected) => {
    expect(parseCallId(input)).toBe(expected);
  });
});

describe('OpenAICallsClient.createCall', () => {
  const sdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n';

  it('posts multipart sdp + session with bearer auth and returns the call id and SDP answer', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response('v=0\r\nanswer', { status: 201, headers: { Location: '/v1/realtime/calls/rtc_1' } }),
    );
    const client = new OpenAICallsClient({ apiKey: 'sk-test', baseUrl: 'https://example.test/v1', fetchImpl });

    const result = await client.createCall(sdp, { type: 'realtime' }, 'hashed');

    expect(result).toEqual({ callId: 'rtc_1', sdpAnswer: 'v=0\r\nanswer' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://example.test/v1/realtime/calls');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect((init?.headers as Record<string, string>)['OpenAI-Safety-Identifier']).toBe('hashed');
    const form = init?.body as FormData;
    expect(form.get('sdp')).toBe(sdp);
    expect(JSON.parse(form.get('session') as string)).toEqual({ type: 'realtime' });
  });

  it('marks 5xx/429 as retryable and 4xx as not', async () => {
    const mk = (status: number) =>
      new OpenAICallsClient({
        apiKey: 'k',
        baseUrl: 'https://x.test/v1',
        fetchImpl: async () => new Response('nope', { status }),
      });

    await expect(mk(503).createCall(sdp, {})).rejects.toMatchObject({ retryable: true, status: 503 });
    await expect(mk(429).createCall(sdp, {})).rejects.toMatchObject({ retryable: true });
    await expect(mk(401).createCall(sdp, {})).rejects.toMatchObject({ retryable: false, status: 401 });
  });

  it('rejects a success response without a call id', async () => {
    const client = new OpenAICallsClient({
      apiKey: 'k',
      baseUrl: 'https://x.test/v1',
      fetchImpl: async () => new Response('v=0', { status: 201 }),
    });
    await expect(client.createCall(sdp, {})).rejects.toBeInstanceOf(ProviderError);
  });

  it('treats hangup of an already-gone call (404) as success', async () => {
    const client = new OpenAICallsClient({
      apiKey: 'k',
      baseUrl: 'https://x.test/v1',
      fetchImpl: async () => new Response('', { status: 404 }),
    });
    await expect(client.hangup('rtc_1')).resolves.toBeUndefined();
  });
});
