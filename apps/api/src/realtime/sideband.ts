import WebSocket from 'ws';

/**
 * Server-side "sideband" WebSocket attached to an existing WebRTC realtime call.
 * Media flows device ⇄ provider directly; this connection carries control and
 * observability only (session.update, response.create, transcripts, usage, errors).
 */
export interface SidebandConnection {
  send(event: Record<string, unknown>): void;
  onMessage(handler: (raw: unknown) => void): void;
  onClose(handler: (code: number, reason: string) => void): void;
  close(): void;
  readonly isOpen: boolean;
}

export interface SidebandConnectOptions {
  baseUrl: string; // https://api.openai.com/v1
  apiKey: string;
  callId: string;
  timeoutMs?: number;
}

export function sidebandUrl(baseUrl: string, callId: string): string {
  const wsBase = baseUrl.replace(/^http/, 'ws');
  return `${wsBase}/realtime?call_id=${encodeURIComponent(callId)}`;
}

export function connectSideband(opts: SidebandConnectOptions): Promise<SidebandConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(sidebandUrl(opts.baseUrl, opts.callId), {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      handshakeTimeout: opts.timeoutMs ?? 10_000,
    });

    const messageHandlers: Array<(raw: unknown) => void> = [];
    const closeHandlers: Array<(code: number, reason: string) => void> = [];

    ws.on('message', (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return; // provider only sends JSON; ignore anything else
      }
      for (const h of messageHandlers) h(parsed);
    });
    ws.on('close', (code, reason) => {
      for (const h of closeHandlers) h(code, reason.toString());
    });

    ws.once('open', () => {
      ws.off('error', reject);
      ws.on('error', () => {
        /* surfaced through 'close' */
      });
      resolve({
        send: (event) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event));
        },
        onMessage: (h) => messageHandlers.push(h),
        onClose: (h) => closeHandlers.push(h),
        close: () => ws.close(1000, 'call ended'),
        get isOpen() {
          return ws.readyState === WebSocket.OPEN;
        },
      });
    });
    ws.once('error', reject);
  });
}
