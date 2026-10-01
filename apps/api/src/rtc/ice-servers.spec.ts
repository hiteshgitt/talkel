import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { IceServers } from './ice-servers.js';

const base = { RTC_ICE_SERVERS: 'stun:stun.l.google.com:19302', RTC_RELAY_ONLY: false } as unknown as Env;
const CLOUDFLARE = {
  iceServers: [
    { urls: ['stun:stun.cloudflare.com:3478'] },
    {
      urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:3478?transport=tcp', 'turns:turn.cloudflare.com:443?transport=tcp'],
      username: 'u',
      credential: 'c',
    },
  ],
};

describe('IceServers', () => {
  it('uses plain STUN without a TURN key (development)', async () => {
    const ice = new IceServers(base);
    expect(await ice.forClient()).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
    expect(await ice.forServer()).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
    expect(ice.relayOnly).toBe(false);
  });

  it('with a Cloudflare TURN key: all servers for the phone, TURN over TLS 443 for the server, cached', async () => {
    let calls = 0;
    const ice = new IceServers({ ...base, TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'tok', RTC_RELAY_ONLY: true } as Env);
    ice.fetchImpl = (async (url: string, init: RequestInit) => {
      calls++;
      expect(url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/key/credentials/generate-ice-servers');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      return new Response(JSON.stringify(CLOUDFLARE), { status: 201 });
    }) as unknown as typeof fetch;
    expect(await ice.forClient()).toEqual(CLOUDFLARE.iceServers);
    expect(await ice.forServer()).toEqual([{ urls: 'turns:turn.cloudflare.com:443?transport=tcp', username: 'u', credential: 'c' }]);
    expect(ice.relayOnly).toBe(true);
    expect(calls).toBe(1);
  });

  it('falls back to STUN when Cloudflare fails', async () => {
    const ice = new IceServers({ ...base, TURN_KEY_ID: 'key', TURN_KEY_API_TOKEN: 'tok' } as Env);
    ice.fetchImpl = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    expect(await ice.forClient()).toEqual([{ urls: 'stun:stun.l.google.com:19302' }]);
  });

  it('works with any TURN provider\'s fixed credentials (e.g. metered.ca)', async () => {
    const ice = new IceServers({
      ...base,
      RTC_RELAY_ONLY: true,
      RTC_TURN_URLS: 'turn:global.relay.metered.ca:80, turns:global.relay.metered.ca:443?transport=tcp',
      RTC_TURN_USERNAME: 'mu',
      RTC_TURN_CREDENTIAL: 'mc',
    } as Env);
    const turn = { urls: ['turn:global.relay.metered.ca:80', 'turns:global.relay.metered.ca:443?transport=tcp'], username: 'mu', credential: 'mc' };
    expect(await ice.forClient()).toEqual([{ urls: 'stun:stun.l.google.com:19302' }, turn]);
    expect(await ice.forServer()).toEqual([{ urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: 'mu', credential: 'mc' }]);
    expect(ice.relayOnly).toBe(true);
  });
});

