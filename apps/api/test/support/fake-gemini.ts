import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type WebSocket, WebSocketServer } from 'ws';

export interface FakeGemini {
  url: string;
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

  const server: Server = createServer((_, res) => res.writeHead(404).end());
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
