import WebSocket from 'ws';
import { type GeminiEvent, normalizeGeminiMessage } from './gemini-events.js';

/** Server-held Gemini Live session (BidiGenerateContent over WebSocket). */
export interface LiveSession {
  /** 20 ms (or longer) chunk of 16 kHz PCM16 mono from the user. */
  sendUserAudio(pcm16k: Buffer): void;
  /**
   * Adds a text turn to the conversation. Used for out-of-band cues (e.g. "the call just
   * connected — greet the user"), since Gemini Live does not allow config changes mid-session.
   */
  sendCue(text: string, turnComplete: boolean): void;
  onEvent(handler: (e: GeminiEvent, raw: unknown) => void): void;
  onClose(handler: (code: number, reason: string) => void): void;
  close(): void;
}

export interface GeminiLiveOptions {
  apiKey: string;
  url: string;
  setup: Record<string, unknown>;
  timeoutMs?: number;
}

export class GeminiSetupError extends Error {
  constructor(
    message: string,
    readonly closeCode: number | null,
  ) {
    super(message);
    this.name = 'GeminiSetupError';
  }
}

/** Opens the socket, sends `setup`, and resolves once the server confirms `setupComplete`. */
export function connectGeminiLive(opts: GeminiLiveOptions): Promise<LiveSession> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(opts.url, {
      headers: { 'x-goog-api-key': opts.apiKey },
      handshakeTimeout: opts.timeoutMs ?? 10_000,
    });
    const eventHandlers: Array<(e: GeminiEvent, raw: unknown) => void> = [];
    const closeHandlers: Array<(code: number, reason: string) => void> = [];
    let ready = false;

    const timer = setTimeout(() => {
      if (ready) return;
      ws.terminate();
      reject(new GeminiSetupError('Gemini Live setup timed out', null));
    }, opts.timeoutMs ?? 10_000);

    const session: LiveSession = {
      sendUserAudio: (pcm) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: pcm.toString('base64') } } }));
      },
      sendCue: (text, turnComplete) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete } }));
      },
      onEvent: (h) => eventHandlers.push(h),
      onClose: (h) => closeHandlers.push(h),
      close: () => ws.close(1000, 'call ended'),
    };

    ws.on('open', () => ws.send(JSON.stringify({ setup: opts.setup })));

    ws.on('message', (data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        return;
      }
      for (const e of normalizeGeminiMessage(raw)) {
        if (e.type === 'setup_complete' && !ready) {
          ready = true;
          clearTimeout(timer);
          resolve(session);
        }
        for (const h of eventHandlers) h(e, raw);
      }
    });

    ws.on('close', (code, reasonBuf) => {
      const reason = reasonBuf.toString();
      clearTimeout(timer);
      // Gemini reports setup problems (bad model, bad field) as a close frame with a reason.
      if (!ready) reject(new GeminiSetupError(`Gemini Live closed during setup (${code}): ${reason}`, code));
      for (const h of closeHandlers) h(code, reason);
    });

    ws.on('error', (err) => {
      if (!ready) {
        clearTimeout(timer);
        reject(new GeminiSetupError(`Gemini Live connection error: ${err.message}`, null));
      }
    });
  });
}
