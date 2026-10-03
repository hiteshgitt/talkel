import { GeminiSetupError } from './gemini-live.js';

export interface LiveTokenOptions {
  apiKey: string;
  /** REST base, e.g. https://generativelanguage.googleapis.com/v1beta */
  baseUrl: string;
  /** The full BidiGenerateContentSetup. Locked into the token: whatever the phone sends can't change it. */
  setup: Record<string, unknown>;
  /** The connection must open before this… */
  connectBy: Date;
  /** …and is cut off after this (call length plus a margin). */
  expiresAt: Date;
  fetchImpl?: typeof fetch;
}

/** Creates a single-use Gemini Live token for one phone connection. Returns its name (the token itself). */
export async function createLiveToken(opts: LiveTokenOptions): Promise<string> {
  const res = await (opts.fetchImpl ?? fetch)(`${opts.baseUrl}/auth_tokens`, {
    method: 'POST',
    headers: { 'x-goog-api-key': opts.apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      uses: 1,
      expireTime: opts.expiresAt.toISOString(),
      newSessionExpireTime: opts.connectBy.toISOString(),
      bidiGenerateContentSetup: opts.setup,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { name?: unknown; error?: { message?: string } };
  if (!res.ok || typeof body.name !== 'string') {
    throw new GeminiSetupError(`Gemini token request failed (${res.status}): ${body.error?.message ?? 'no token'}`, null);
  }
  return body.name;
}

/** Ephemeral tokens only work on the "constrained" variant of the Live endpoint. */
export function liveSocketUrl(liveUrl: string, token: string): string {
  const base = liveUrl.endsWith('.BidiGenerateContent') ? `${liveUrl}Constrained` : liveUrl;
  return `${base}?access_token=${encodeURIComponent(token)}`;
}
