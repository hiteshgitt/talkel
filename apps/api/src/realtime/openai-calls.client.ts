/**
 * Thin client for OpenAI Realtime WebRTC call control (REST side).
 *
 * - createCall: "unified interface" — the server posts the device's SDP offer plus the
 *   session config, so the device never holds a provider credential and the config
 *   cannot be tampered with. The call id comes back in the Location header.
 * - hangup: server-side termination (time limit, user end, cost guard).
 *
 * The WebSocket "sideband" for the same call lives in sideband.ts.
 */

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface CreateCallResult {
  callId: string;
  sdpAnswer: string;
}

export interface OpenAICallsClientOptions {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class OpenAICallsClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: OpenAICallsClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async createCall(sdpOffer: string, session: object, safetyIdentifier?: string): Promise<CreateCallResult> {
    const form = new FormData();
    form.set('sdp', sdpOffer);
    form.set('session', JSON.stringify(session));

    const res = await this.request('/realtime/calls', {
      method: 'POST',
      body: form,
      headers: safetyIdentifier ? { 'OpenAI-Safety-Identifier': safetyIdentifier } : {},
    });
    const body = await res.text();
    if (!res.ok) {
      throw new ProviderError(
        `createCall failed (${res.status}): ${truncate(body)}`,
        res.status,
        res.status === 429 || res.status >= 500,
      );
    }

    const callId = parseCallId(res.headers.get('location'));
    if (!callId) {
      throw new ProviderError('createCall succeeded but no call id in Location header', res.status, false);
    }
    if (!body.startsWith('v=')) {
      throw new ProviderError('createCall returned a body that is not an SDP answer', res.status, false);
    }
    return { callId, sdpAnswer: body };
  }

  async hangup(callId: string): Promise<void> {
    const res = await this.request(`/realtime/calls/${encodeURIComponent(callId)}/hangup`, { method: 'POST' });
    // 404 = call already gone; treat as success (hangup is idempotent from our side).
    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      throw new ProviderError(`hangup failed (${res.status}): ${truncate(body)}`, res.status, res.status >= 500);
    }
  }

  private async request(path: string, init: RequestInit & { headers?: Record<string, string> }): Promise<Response> {
    try {
      return await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${this.opts.apiKey}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new ProviderError(`network error calling ${path}: ${(err as Error).message}`, null, true);
    }
  }
}

/** Location is e.g. "/v1/realtime/calls/rtc_abc123" (absolute or relative); the id is the last segment. */
export function parseCallId(location: string | null): string | null {
  if (!location) return null;
  const path = location.split('?')[0] ?? '';
  const last = path.split('/').filter(Boolean).pop();
  return last && /^[A-Za-z0-9_-]+$/.test(last) ? last : null;
}

function truncate(s: string, max = 500): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
