import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { PocConnectRequest, PocConnectResponse, PocTranscriptResponse } from '@speakai/contracts';
import { ProblemException } from '../common/problem.js';
import { ENV, type Env } from '../config/env.js';
import { GeminiCallSession } from '../gemini/gemini-call-session.js';
import { connectGeminiLive, GeminiSetupError, type LiveSession } from '../gemini/gemini-live.js';
import { WebRtcEndpoint } from '../media/webrtc-endpoint.js';
import { OpenAICallsClient, ProviderError } from '../realtime/openai-calls.client.js';
import { connectSideband } from '../realtime/sideband.js';
import { CallSession } from './call-session.js';
import {
  buildGeminiSetup,
  buildInstructions,
  buildGreetingCue,
  buildSessionConfig,
  pickOpening,
  POC_PERSONAS,
  WRAP_UP_CUE,
  WRAP_UP_NOTE,
} from './friendly-scenario.js';
import { JsonlCallLog } from './jsonl-call-log.js';
import type { LiveCall } from './live-call.js';

const MAX_CONCURRENT_CALLS = 3; // POC cost guard
const MAX_RETAINED_ENDED = 50; // keep recent transcripts in memory (no DB in M0)
const RECENT_OPENINGS_TO_AVOID = 6; // per server for now; per user once conversations are stored (M2)

@Injectable()
export class PocCallsService implements OnApplicationShutdown {
  private readonly logger = new Logger(PocCallsService.name);
  private readonly calls = new Map<string, LiveCall>();
  private readonly openai: OpenAICallsClient | null;
  private readonly recentSituations: string[] = [];

  constructor(@Inject(ENV) private readonly env: Env) {
    this.openai = env.OPENAI_API_KEY
      ? new OpenAICallsClient({ apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL })
      : null;
    const configured = env.REALTIME_PROVIDER === 'gemini' ? Boolean(env.GEMINI_API_KEY) : Boolean(this.openai);
    this.logger.log(`realtime provider: ${env.REALTIME_PROVIDER}${configured ? '' : ' (NOT CONFIGURED — connect returns 503)'}`);
  }

  async connect(req: PocConnectRequest): Promise<PocConnectResponse> {
    if (this.activeCount() >= MAX_CONCURRENT_CALLS) {
      throw new ProblemException(HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_ACTIVE_CALLS', 'Too many active calls');
    }
    const { call, sdpAnswer } =
      this.env.REALTIME_PROVIDER === 'gemini' ? await this.connectGemini(req) : await this.connectOpenAI(req);

    this.calls.set(call.callId, call);
    call.start();
    this.logger.log(`call ${call.callId} connected (provider=${this.env.REALTIME_PROVIDER}, voice=${req.voice})`);
    return { callId: call.callId, sdpAnswer, maxDurationSec: this.env.POC_MAX_SESSION_SECONDS };
  }

  markReady(callId: string): void {
    this.get(callId).markMediaReady();
  }

  async end(callId: string): Promise<PocTranscriptResponse> {
    const call = this.get(callId);
    await call.end('USER_ENDED');
    return call.snapshot();
  }

  transcript(callId: string): PocTranscriptResponse {
    return this.get(callId).snapshot();
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.calls.values()].map((c) => c.end('ERROR')));
  }

  // ───────────── Gemini Live: phone ⇄ our WebRTC gateway ⇄ Gemini (WebSocket) ─────────────

  private async connectGemini(req: PocConnectRequest): Promise<{ call: LiveCall; sdpAnswer: string }> {
    const apiKey = this.env.GEMINI_API_KEY;
    if (!apiKey) throw notConfigured();
    const persona = POC_PERSONAS[req.voice];
    const callId = `call_${randomUUID()}`;

    // Open the AI session and the media endpoint in parallel; clean up whichever succeeded if the other fails.
    const [liveResult, mediaResult] = await Promise.allSettled([
      connectGeminiLive({
        apiKey,
        url: this.env.GEMINI_LIVE_URL,
        setup: buildGeminiSetup({ model: this.env.GEMINI_LIVE_MODEL, persona }),
      }),
      WebRtcEndpoint.answer(req.sdpOffer, {
        iceServers: iceServers(this.env.RTC_ICE_SERVERS),
        udpPortRange: this.env.RTC_UDP_PORT_RANGE,
      }),
    ]);

    if (liveResult.status === 'rejected' || mediaResult.status === 'rejected') {
      if (liveResult.status === 'fulfilled') liveResult.value.close();
      if (mediaResult.status === 'fulfilled') await mediaResult.value.endpoint.close();
      if (mediaResult.status === 'rejected') {
        this.logger.warn(`WebRTC answer failed: ${(mediaResult.reason as Error).message}`);
        throw new ProblemException(HttpStatus.BAD_REQUEST, 'INVALID_OFFER', 'Could not accept the call offer');
      }
      throw this.geminiProblem(liveResult.status === 'rejected' ? liveResult.reason : null);
    }

    const live: LiveSession = liveResult.value;
    const { endpoint, sdpAnswer } = mediaResult.value;
    const opening = this.nextOpening();
    this.logger.log(`call ${callId} opening: ${opening.when} · ${opening.situation} · ${opening.style}`);
    const call = new GeminiCallSession({
      callId,
      media: endpoint,
      live,
      log: new JsonlCallLog(this.env.CALL_LOG_DIR, callId),
      maxDurationMs: this.env.POC_MAX_SESSION_SECONDS * 1000,
      greetingCue: buildGreetingCue(opening),
      wrapUpCue: WRAP_UP_CUE,
      onEnded: (c) => this.onCallEnded(c),
      onError: (m) => this.logger.warn(m),
    });
    return { call, sdpAnswer };
  }

  private geminiProblem(err: unknown): ProblemException {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`Gemini Live setup failed: ${message}`);
    // 1008 policy / quota-style closes are billing or key problems, not transient.
    if (err instanceof GeminiSetupError && /quota|billing|exhausted|permission|api key/i.test(message)) {
      return new ProblemException(HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_QUOTA_EXHAUSTED', 'The AI voice service is unavailable right now');
    }
    return new ProblemException(HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_UNAVAILABLE', 'The AI voice service could not start the call');
  }

  // ───────────── OpenAI Realtime: phone ⇄ OpenAI (WebRTC) + server sideband ─────────────

  private async connectOpenAI(req: PocConnectRequest): Promise<{ call: LiveCall; sdpAnswer: string }> {
    const client = this.openai;
    const apiKey = this.env.OPENAI_API_KEY;
    if (!client || !apiKey) throw notConfigured();

    const persona = POC_PERSONAS[req.voice];
    const session = buildSessionConfig({
      model: this.env.REALTIME_MODEL,
      transcribeModel: this.env.REALTIME_TRANSCRIBE_MODEL,
      persona,
    });

    let created: { callId: string; sdpAnswer: string };
    try {
      created = await client.createCall(req.sdpOffer, session, hashId('poc-dev-user'));
    } catch (err) {
      throw this.openaiProblem(err);
    }

    let sideband;
    try {
      sideband = await connectSideband({ baseUrl: this.env.OPENAI_BASE_URL, apiKey, callId: created.callId });
    } catch (err) {
      // Without control we can't enforce limits — refuse the call rather than let it run unsupervised.
      await client.hangup(created.callId).catch(() => undefined);
      this.logger.error(`sideband connect failed for ${created.callId}: ${(err as Error).message}`);
      throw new ProblemException(HttpStatus.BAD_GATEWAY, 'SIDEBAND_FAILED', 'Could not attach call control');
    }

    const call = new CallSession({
      callId: created.callId,
      sideband,
      hangup: (id) => client.hangup(id),
      log: new JsonlCallLog(this.env.CALL_LOG_DIR, created.callId),
      maxDurationMs: this.env.POC_MAX_SESSION_SECONDS * 1000,
      wrapUpInstructions: buildInstructions(persona, WRAP_UP_NOTE),
      greetingCue: buildGreetingCue(this.nextOpening()),
      onEnded: (c) => this.onCallEnded(c),
      onError: (m) => this.logger.warn(m),
    });
    return { call, sdpAnswer: created.sdpAnswer };
  }

  private openaiProblem(err: unknown): ProblemException {
    if (err instanceof ProviderError) {
      this.logger.error(err.message);
      if (err.isQuotaExhausted) {
        // Billing problem on our side: don't invite retries, and make it easy to alert on.
        return new ProblemException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'PROVIDER_QUOTA_EXHAUSTED',
          'The AI voice service is unavailable right now',
        );
      }
      return new ProblemException(
        err.retryable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY,
        'PROVIDER_UNAVAILABLE',
        'The AI voice service could not start the call',
      );
    }
    throw err;
  }

  // ───────────── shared ─────────────

  private nextOpening() {
    const opening = pickOpening(Math.random, new Date(), { avoid: this.recentSituations });
    this.recentSituations.push(opening.situation);
    if (this.recentSituations.length > RECENT_OPENINGS_TO_AVOID) this.recentSituations.shift();
    return opening;
  }

  private onCallEnded(c: LiveCall): void {
    const s = c.snapshot();
    const media = c instanceof GeminiCallSession ? ` media=${JSON.stringify(c.mediaStats())}` : '';
    this.logger.log(
      `call ${c.callId} ended: ${s.endReason} after ${s.durationMs} ms, ${s.turns.length} turns, usage=${JSON.stringify(c.usage)}${media}`,
    );
    this.pruneEnded();
  }

  private get(callId: string): LiveCall {
    const call = this.calls.get(callId);
    if (!call) throw new ProblemException(HttpStatus.NOT_FOUND, 'CALL_NOT_FOUND', 'Call not found');
    return call;
  }

  private activeCount(): number {
    let n = 0;
    for (const c of this.calls.values()) if (!c.isEnded) n++;
    return n;
  }

  private pruneEnded(): void {
    const ended = [...this.calls.values()].filter((c) => c.isEnded);
    for (const c of ended.slice(0, Math.max(0, ended.length - MAX_RETAINED_ENDED))) this.calls.delete(c.callId);
  }
}

function notConfigured(): ProblemException {
  return new ProblemException(HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_NOT_CONFIGURED', 'AI provider is not configured');
}

function iceServers(csv: string): Array<{ urls: string }> {
  return csv
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
    .map((urls) => ({ urls }));
}

/** Providers ask for a stable, non-identifying end-user id for abuse monitoring. */
function hashId(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 32);
}
