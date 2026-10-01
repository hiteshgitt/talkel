import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const CloudflareResponse = z.object({
  iceServers: z.union([
    z.array(z.object({ urls: z.union([z.string(), z.array(z.string())]), username: z.string().optional(), credential: z.string().optional() })),
    z.object({ urls: z.union([z.string(), z.array(z.string())]), username: z.string().optional(), credential: z.string().optional() }),
  ]),
});

/** Short-lived TURN credentials are reused for this long (they are issued for twice as long). */
const CACHE_MS = 60 * 60_000;
const TTL_SEC = 2 * 60 * 60;

/**
 * ICE servers for calls. With TURN configured — a Cloudflare Realtime TURN key, or fixed credentials
 * from any provider — both sides relay media through TURN (production on Cloud Run, which can't
 * receive UDP); otherwise plain STUN (development).
 */
@Injectable()
export class IceServers {
  private readonly logger = new Logger(IceServers.name);
  private cache: { servers: IceServer[]; until: number } | null = null;

  /** Overridable in tests. */
  fetchImpl: typeof fetch = (input, init) => fetch(input, init);

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Everything the phone may use: STUN plus every TURN transport (UDP, TCP, TLS). */
  async forClient(): Promise<IceServer[]> {
    return (await this.turn()) ?? this.stun();
  }

  /**
   * The server's side: werift uses the first TURN URL only, so pick TURN over TLS on 443 — it gets
   * out of any environment that allows HTTPS egress.
   */
  async forServer(): Promise<IceServer[]> {
    const turn = await this.turn();
    if (!turn) return this.stun();
    const withCreds = turn.find((s) => s.username && s.credential);
    if (!withCreds) return this.stun();
    const urls = ([] as string[]).concat(withCreds.urls);
    const tls = urls.find((u) => u.startsWith('turns:') && u.includes(':443')) ?? urls.find((u) => u.startsWith('turns:')) ?? urls[0]!;
    return [{ urls: tls, username: withCreds.username, credential: withCreds.credential }];
  }

  get relayOnly(): boolean {
    return this.env.RTC_RELAY_ONLY && (this.cloudflare() || this.staticTurn() !== null);
  }

  private cloudflare(): boolean {
    return Boolean(this.env.TURN_KEY_ID && this.env.TURN_KEY_API_TOKEN);
  }

  /** Fixed credentials from any TURN provider (e.g. metered.ca's free plan). */
  private staticTurn(): IceServer[] | null {
    const { RTC_TURN_URLS: urls, RTC_TURN_USERNAME: username, RTC_TURN_CREDENTIAL: credential } = this.env;
    if (!urls || !username || !credential) return null;
    const list = urls.split(',').map((u) => u.trim()).filter(Boolean);
    return list.length ? [...this.stun(), { urls: list, username, credential }] : null;
  }

  private stun(): IceServer[] {
    return this.env.RTC_ICE_SERVERS.split(',')
      .map((u) => u.trim())
      .filter(Boolean)
      .map((urls) => ({ urls }));
  }

  private async turn(): Promise<IceServer[] | null> {
    const fixed = this.staticTurn();
    if (fixed && !this.cloudflare()) return fixed;
    const { TURN_KEY_ID: keyId, TURN_KEY_API_TOKEN: token } = this.env;
    if (!keyId || !token) return null;
    if (this.cache && this.cache.until > Date.now()) return this.cache.servers;
    try {
      const res = await this.fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_SEC }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = CloudflareResponse.parse(await res.json());
      const servers = Array.isArray(parsed.iceServers) ? parsed.iceServers : [parsed.iceServers];
      this.cache = { servers, until: Date.now() + CACHE_MS };
      return servers;
    } catch (err) {
      this.logger.error(`TURN credentials failed: ${(err as Error).message}`);
      return this.cache?.servers ?? null; // a recently expired cache beats nothing
    }
  }
}
