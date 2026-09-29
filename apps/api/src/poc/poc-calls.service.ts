import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { PocConnectRequest, PocConnectResponse, PocTranscriptResponse } from '@speakai/contracts';
import { ProblemException } from '../common/problem.js';
import { ENV, type Env } from '../config/env.js';
import { OpenAICallsClient, ProviderError } from '../realtime/openai-calls.client.js';
import { connectSideband } from '../realtime/sideband.js';
import { CallSession } from './call-session.js';
import { buildInstructions, buildSessionConfig, POC_PERSONAS, WRAP_UP_NOTE } from './friendly-scenario.js';
import { JsonlCallLog } from './jsonl-call-log.js';

const MAX_CONCURRENT_CALLS = 3; // POC cost guard
const MAX_RETAINED_ENDED = 50; // keep recent transcripts in memory (no DB in M0)

@Injectable()
export class PocCallsService implements OnApplicationShutdown {
  private readonly logger = new Logger(PocCallsService.name);
  private readonly calls = new Map<string, CallSession>();
  private readonly client: OpenAICallsClient | null;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.client = env.OPENAI_API_KEY
      ? new OpenAICallsClient({ apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL })
      : null;
    if (!this.client) this.logger.warn('OPENAI_API_KEY not set — /v1/poc/connect will return 503');
  }

  async connect(req: PocConnectRequest): Promise<PocConnectResponse> {
    const client = this.client;
    const apiKey = this.env.OPENAI_API_KEY;
    if (!client || !apiKey) {
      throw new ProblemException(HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_NOT_CONFIGURED', 'AI provider is not configured');
    }
    if (this.activeCount() >= MAX_CONCURRENT_CALLS) {
      throw new ProblemException(HttpStatus.TOO_MANY_REQUESTS, 'TOO_MANY_ACTIVE_CALLS', 'Too many active calls');
    }

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
      throw this.providerProblem(err);
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
      onEnded: (c) => {
        const s = c.snapshot();
        this.logger.log(
          `call ${c.callId} ended: ${s.endReason} after ${s.durationMs} ms, ${s.turns.length} turns, usage=${JSON.stringify(c.usage)}`,
        );
        this.pruneEnded();
      },
      onError: (m) => this.logger.warn(m),
    });
    this.calls.set(created.callId, call);
    call.start();
    this.logger.log(`call ${created.callId} connected (voice=${req.voice}, persona=${persona.name})`);

    return { callId: created.callId, sdpAnswer: created.sdpAnswer, maxDurationSec: this.env.POC_MAX_SESSION_SECONDS };
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

  private get(callId: string): CallSession {
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

  private providerProblem(err: unknown): ProblemException {
    if (err instanceof ProviderError) {
      this.logger.error(err.message);
      return new ProblemException(
        err.retryable ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY,
        'PROVIDER_UNAVAILABLE',
        'The AI voice service could not start the call',
      );
    }
    throw err;
  }
}

/** Providers ask for a stable, non-identifying end-user id for abuse monitoring. */
function hashId(id: string): string {
  return createHash('sha256').update(id).digest('hex').slice(0, 32);
}
