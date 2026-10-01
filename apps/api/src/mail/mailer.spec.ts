import { describe, expect, it } from 'vitest';
import { ResendMailer } from './mailer.js';

describe('ResendMailer', () => {
  it('posts the message to the Resend API with the key and sender', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: 'x' }), { status: 200 });
    }) as unknown as typeof fetch;
    await new ResendMailer('re_test', 'Talkel <hello@talkel.app>', fetchImpl).send({ to: 'a@b.c', subject: 'Hi', text: 't', html: '<p>t</p>' });
    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ from: 'Talkel <hello@talkel.app>', to: ['a@b.c'], subject: 'Hi', text: 't', html: '<p>t</p>' });
  });

  it('throws on an API error so the caller can report it', async () => {
    const fetchImpl = (async () => new Response('{"message":"domain not verified"}', { status: 403 })) as unknown as typeof fetch;
    await expect(new ResendMailer('re_test', 'x@y.z', fetchImpl).send({ to: 'a@b.c', subject: 's', text: 't', html: 'h' })).rejects.toThrow(/403/);
  });
});
