import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import {
  Accent,
  CONSENT_VERSION,
  type ConnectRequest,
  type ConnectResponse,
  type ConversationDetail,
  type ConversationList,
  type CreateConversationRequest,
  type CreateConversationResponse,
  AnalysisStatus as AnalysisStatusSchema,
  EndReason as EndReasonSchema,
  Feedback,
  FeedbackLanguage,
  EnglishLevel,
  LearningGoal,
  SessionStatus as SessionStatusSchema,
  VoiceGender,
} from '@speakai/contracts';
import type { Prisma, PrismaClient } from '@speakai/db';
import { z } from 'zod';
import { ProblemException } from '../common/problem.js';
import { ENV, type Env } from '../config/env.js';
import { PRISMA } from '../db/prisma.module.js';
import { type PreparedConversation, prepareConversation } from '../engine/engine.js';
import { renderTemplate } from '../engine/scenario-kinds.js';
import { handleToolCall } from '../engine/tools.js';
import { connectGeminiLive, GeminiSetupError, type LiveSession } from '../gemini/gemini-live.js';
import { buildGeminiSetup } from '../gemini/gemini-setup.js';
import { WebRtcEndpoint } from '../media/webrtc-endpoint.js';
import { JsonlCallLog } from '../common/jsonl-call-log.js';
import { CallRecorder } from '../recording/call-recorder.js';
import { RECORDING_STORE, recordingKey, type RecordingStore } from '../recording/recording-store.js';
import { LiveConversation, type LiveSnapshot, type LiveStatus } from './live-conversation.js';
import { AnalysisQueue } from '../analysis/analysis-queue.js';
import { LearningProfileService } from '../analysis/learning-profile.service.js';
import { QuotaService } from './quota.service.js';
import { entitlementsFor } from '../users/users.service.js';

const MIN_REMAINING_TO_START_SEC = 30;
const CONNECT_WINDOW_MS = 5 * 60_000; // time to read the brief before starting
const RECENT_SITUATIONS = 6;
const ACTIVE_STATUSES = ['CREATED', 'CONNECTING', 'ACTIVE', 'RECONNECTING'] as const;

const StoredState = z.object({
  values: z.record(z.string(), z.union([z.string(), z.number()])),
  hidden: z.array(z.string()),
});
const StoredGoals = z.array(z.object({ id: z.string(), description: z.string() }));
const PersonaVoices = z.object({ gemini: z.string(), openai: z.string().optional() });

interface Pending {
  userId: string;
  prepared: PreparedConversation;
  voiceName: string;
  expiresAt: number;
}

interface Running {
  userId: string;
  convo: LiveConversation;
  values: Record<string, string | number>;
  goalIds: string[];
}

@Injectable()
export class ConversationsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ConversationsService.name);
  private readonly pending = new Map<string, Pending>();
  private readonly running = new Map<string, Running>();
  /** Serialises DB writes per session (periodic flushes vs. the final write). */
  private readonly writeChains = new Map<string, Promise<void>>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    @Inject(RECORDING_STORE) private readonly recordings: RecordingStore,
    private readonly quota: QuotaService,
    private readonly analysisQueue: AnalysisQueue,
    private readonly profiles: LearningProfileService,
  ) {}

  // ───────────── lifecycle ─────────────

  async create(userId: string, req: CreateConversationRequest): Promise<CreateConversationResponse> {
    const [scenario, personas, user] = await Promise.all([
      this.prisma.scenario.findFirst({
        where: { id: req.scenarioId, isActive: true, publishedVersionId: { not: null } },
        include: { publishedVersion: true },
      }),
      this.prisma.persona.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true, settings: true } }),
    ]);
    if (!scenario?.publishedVersion) throw problem(HttpStatus.NOT_FOUND, 'SCENARIO_NOT_FOUND', 'Scenario not found');

    // Free plan: partner and accent are random. Pro: the user may choose (server-enforced).
    const { choosePartner, chooseAccent } = entitlementsFor(user.plan);
    let persona = choosePartner && req.personaId ? personas.find((p) => p.id === req.personaId) : undefined;
    if (choosePartner && req.personaId && !persona) throw problem(HttpStatus.NOT_FOUND, 'PERSONA_NOT_FOUND', 'Conversation partner not found');
    if (!persona) {
      const gender = choosePartner && (req.voice === 'FEMALE' || req.voice === 'MALE') ? req.voice : null;
      const pool = gender ? personas.filter((p) => p.gender === gender) : personas;
      persona = pickRandom(pool.length ? pool : personas);
    }
    if (!persona) throw problem(HttpStatus.SERVICE_UNAVAILABLE, 'NO_PERSONAS', 'No conversation partners are available');
    const accent = chooseAccent && req.accent && req.accent !== 'RANDOM' ? req.accent : pickRandom(Accent.options)!;

    await this.ensureNoActiveConversation(userId);

    const quota = await this.quota.forUser(userId);
    if (quota.remainingSec < MIN_REMAINING_TO_START_SEC) {
      throw problem(HttpStatus.PAYMENT_REQUIRED, 'QUOTA_EXCEEDED', 'You’ve used today’s free practice time');
    }

    const settings = user.settings;
    const difficulty = req.difficulty ?? EnglishLevel.catch('INTERMEDIATE').parse(settings?.defaultDifficulty);
    const liveCorrection = req.liveCorrection ?? settings?.liveCorrection ?? false;
    const durationSec = Math.min(
      req.durationSec ?? settings?.defaultDurationSec ?? 600,
      this.env.CONVERSATION_MAX_SECONDS,
      quota.remainingSec,
    );
    const version = scenario.publishedVersion;
    const learnerGoals = (user.profile?.goals ?? []).filter((g): g is LearningGoal => LearningGoal.safeParse(g).success);

    const prepared = prepareConversation({
      scenario: version,
      persona: { id: persona.id, version: persona.version, name: persona.name, promptFragment: persona.promptFragment },
      difficulty,
      accent,
      liveCorrection,
      learnerGoals,
      learnerWeakSpots: await this.profiles.weakSpots(userId),
      timeZone: user.profile?.timezone ?? 'Asia/Kolkata',
      recentSituations: version.kind === 'casual' ? await this.recentSituations(userId) : [],
    });

    const session = await this.prisma.conversationSession.create({
      data: {
        userId,
        scenarioVersionId: version.id,
        personaId: persona.id,
        difficulty,
        accent,
        liveCorrection,
        plannedDurationSec: durationSec,
        provider: 'gemini',
        model: this.env.GEMINI_LIVE_MODEL,
        promptVersions: prepared.promptVersions,
        instructionsHash: prepared.instructionsHash,
        scenarioState: { values: prepared.scenarioState, hidden: [...prepared.hiddenKeys] },
      },
    });
    this.pending.set(session.id, {
      userId,
      prepared,
      voiceName: PersonaVoices.parse(persona.voices).gemini,
      expiresAt: Date.now() + CONNECT_WINDOW_MS,
    });

    return {
      id: session.id,
      brief: prepared.brief,
      persona: {
        id: persona.id,
        slug: persona.slug,
        name: persona.name,
        gender: VoiceGender.parse(persona.gender),
        description: persona.description,
      },
      accent,
      difficulty,
      durationSec,
    };
  }

  async connect(userId: string, id: string, req: ConnectRequest): Promise<ConnectResponse> {
    const session = await this.owned(userId, id);

    if (req.reconnect) {
      const run = this.running.get(id);
      if (!run || run.userId !== userId || run.convo.isEnded) {
        throw problem(HttpStatus.CONFLICT, 'SESSION_NOT_CONNECTABLE', 'This conversation has already ended');
      }
      const { endpoint, sdpAnswer } = await this.answerOffer(req.sdpOffer);
      run.convo.replaceMedia(endpoint);
      return { sdpAnswer, durationSec: session.plannedDurationSec };
    }

    const pending = this.pending.get(id);
    if (session.status !== 'CREATED' || !pending || pending.userId !== userId || pending.expiresAt < Date.now()) {
      if (session.status === 'CREATED') await this.markExpired(id);
      throw problem(HttpStatus.CONFLICT, 'SESSION_NOT_CONNECTABLE', 'This conversation can’t be started any more. Please start a new one.');
    }
    this.pending.delete(id);

    const apiKey = this.env.GEMINI_API_KEY;
    if (!apiKey) throw problem(HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_NOT_CONFIGURED', 'AI provider is not configured');

    // Re-check the allowance at connect time (another device may have used it meanwhile).
    const quota = await this.quota.forUser(userId);
    const durationSec = Math.min(session.plannedDurationSec, quota.remainingSec);
    if (durationSec < MIN_REMAINING_TO_START_SEC) {
      await this.markExpired(id);
      throw problem(HttpStatus.PAYMENT_REQUIRED, 'QUOTA_EXCEEDED', 'You’ve used today’s free practice time');
    }

    const { prepared } = pending;
    const [liveResult, mediaResult] = await Promise.allSettled([
      connectGeminiLive({
        apiKey,
        url: this.env.GEMINI_LIVE_URL,
        setup: buildGeminiSetup({ model: this.env.GEMINI_LIVE_MODEL, voiceName: pending.voiceName, prepared }),
      }),
      this.answerOffer(req.sdpOffer),
    ]);
    if (liveResult.status === 'rejected' || mediaResult.status === 'rejected') {
      if (liveResult.status === 'fulfilled') liveResult.value.close();
      if (mediaResult.status === 'fulfilled') await mediaResult.value.endpoint.close();
      await this.prisma.conversationSession.update({ where: { id }, data: { status: 'FAILED', endReason: 'ERROR', endedAt: new Date() } });
      if (mediaResult.status === 'rejected') throw mediaResult.reason;
      throw this.providerProblem(liveResult.status === 'rejected' ? liveResult.reason : null);
    }

    const live: LiveSession = liveResult.value;
    const { endpoint, sdpAnswer } = mediaResult.value;
    const run: Running = { userId, convo: undefined as unknown as LiveConversation, values: { ...prepared.scenarioState }, goalIds: prepared.goals.map((g) => g.id) };
    run.convo = new LiveConversation({
      id,
      media: endpoint,
      live,
      log: new JsonlCallLog(this.env.CALL_LOG_DIR, id),
      maxDurationMs: durationSec * 1000,
      openingCue: prepared.openingCue,
      wrapUpCue: prepared.wrapUpCue,
      handleTool: (name, args) => {
        const outcome = handleToolCall(name, args, { values: run.values, goalIds: run.goalIds, goalsAchieved: run.convo.goalsAchieved });
        if (outcome.stateChanges) Object.assign(run.values, outcome.stateChanges);
        return outcome;
      },
      onStatus: (status) => this.enqueue(id, () => this.persistStatus(id, status)),
      onFlush: (snap) => this.enqueue(id, () => this.persistProgress(id, snap, run.values)),
      onEvent: (type, atMs, payload) => this.enqueue(id, () => this.persistEvent(id, type, atMs, payload)),
      onEnded: (snap) =>
        this.enqueue(id, async () => {
          await this.persistFinal(id, userId, snap, run.values);
          this.running.delete(id);
        }),
      onError: (m) => this.logger.warn(m),
      createRecorder: async () => {
        const key = recordingKey(userId, id);
        const out = await this.recordings.openWrite(key);
        // Record the key immediately, so a crash mid-call still leaves a findable (partial) file.
        await this.prisma.conversationSession.update({ where: { id }, data: { recordingKey: key } });
        return new CallRecorder(out);
      },
    });
    this.running.set(id, run);
    await this.prisma.conversationSession.update({ where: { id }, data: { status: 'CONNECTING', plannedDurationSec: durationSec } });
    run.convo.start();
    this.logger.log(`conversation ${id} connected (user=${userId}, ${durationSec}s)`);
    return { sdpAnswer, durationSec };
  }

  async ready(userId: string, id: string): Promise<void> {
    const run = this.running.get(id);
    if (!run || run.userId !== userId) throw notFound();
    run.convo.markMediaReady();
  }

  async end(userId: string, id: string): Promise<ConversationDetail> {
    const session = await this.owned(userId, id);
    const run = this.running.get(id);
    if (run && run.userId === userId) {
      await run.convo.end('USER_ENDED');
      await this.writeChains.get(id);
    } else if (session.status === 'CREATED') {
      await this.markExpired(id);
    }
    return this.detail(userId, id);
  }

  /** Re-queues feedback that failed (e.g. the AI provider was down for a long time). */
  async retryFeedback(userId: string, id: string): Promise<void> {
    const s = await this.owned(userId, id);
    if (s.analysisStatus !== 'FAILED') throw problem(HttpStatus.CONFLICT, 'FEEDBACK_NOT_RETRYABLE', 'Feedback is not in a failed state');
    await this.prisma.conversationSession.update({ where: { id }, data: { analysisStatus: 'PENDING' } });
    await this.analysisQueue.enqueue(id, { force: true });
  }

  /** Starts or pauses recording the live call. Requires the privacy notice that covers recordings. */
  async setRecording(userId: string, id: string, on: boolean): Promise<{ recording: boolean }> {
    await this.owned(userId, id);
    const run = this.running.get(id);
    if (!run || run.userId !== userId || run.convo.isEnded) {
      throw problem(HttpStatus.CONFLICT, 'CONVERSATION_NOT_LIVE', 'You can only record a call that is in progress');
    }
    if (on) {
      const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { consentVersion: true } });
      if (profile?.consentVersion !== CONSENT_VERSION) {
        throw problem(HttpStatus.FORBIDDEN, 'CONSENT_REQUIRED', 'Please accept the updated privacy notice to record calls');
      }
    }
    return { recording: await run.convo.setRecording(on) };
  }

  /** Where the finished recording is, for streaming. 404 if none, 409 while the call is still live. */
  async recordingFile(userId: string, id: string): Promise<{ key: string; size: number }> {
    const session = await this.owned(userId, id);
    if (this.running.get(id)) throw problem(HttpStatus.CONFLICT, 'RECORDING_IN_PROGRESS', 'The call is still in progress');
    const size = session.recordingKey ? await this.recordings.size(session.recordingKey) : null;
    if (!session.recordingKey || !size) throw problem(HttpStatus.NOT_FOUND, 'RECORDING_NOT_FOUND', 'This conversation has no recording');
    return { key: session.recordingKey, size };
  }

  openRecording(key: string, range?: { start: number; end: number }) {
    return this.recordings.openRead(key, range);
  }

  async deleteRecording(userId: string, id: string): Promise<void> {
    const session = await this.owned(userId, id);
    if (this.running.get(id)) throw problem(HttpStatus.CONFLICT, 'RECORDING_IN_PROGRESS', 'End the call before deleting its recording');
    if (session.recordingKey) await this.recordings.remove(session.recordingKey);
    await this.prisma.conversationSession.update({
      where: { id },
      data: { recordingKey: null, recordingDurationMs: null, recordingBytes: null },
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const owned = await this.owned(userId, id);
    const run = this.running.get(id);
    if (run) {
      await run.convo.end('USER_ENDED');
      await this.writeChains.get(id);
    }
    this.pending.delete(id);
    if (owned.recordingKey) await this.recordings.remove(owned.recordingKey);
    await this.prisma.conversationSession.delete({ where: { id } }); // turns/events cascade; usage keeps counting
  }

  // ───────────── reads ─────────────

  async list(userId: string, cursor: string | undefined, limit = 20): Promise<ConversationList> {
    const rows = await this.prisma.conversationSession.findMany({
      where: { userId, status: { notIn: ['CREATED', 'EXPIRED'] } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { scenarioVersion: { select: { title: true } }, persona: { select: { name: true } }, _count: { select: { turns: true } } },
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((s) => ({
        id: s.id,
        scenarioTitle: s.scenarioVersion.title,
        personaName: s.persona.name,
        difficulty: EnglishLevel.parse(s.difficulty),
        status: SessionStatusSchema.parse(s.status),
        endReason: s.endReason ? EndReasonSchema.parse(s.endReason) : null,
        createdAt: s.createdAt.toISOString(),
        durationMs: s.durationMs,
        turnCount: s._count.turns,
      })),
      nextCursor: rows.length > limit ? page.at(-1)!.id : null,
    };
  }

  async detail(userId: string, id: string): Promise<ConversationDetail> {
    if (!isUuid(id)) throw notFound();
    const s = await this.prisma.conversationSession.findFirst({
      where: { id, userId },
      include: {
        scenarioVersion: true,
        persona: { select: { name: true } },
        turns: { orderBy: { seq: 'asc' } },
        analysis: { include: { grammarErrors: { orderBy: { turnSeq: 'asc' } }, vocabularyItems: true, fluency: true, recommendations: true } },
      },
    });
    if (!s) throw notFound();
    const state = StoredState.parse(s.scenarioState);
    const render = (t: string) => renderTemplate(t, state.values);
    const run = this.running.get(id);
    const live = run ? run.convo.snapshot() : null;
    const achieved = new Set(live ? live.goalsAchieved : s.goalsAchieved);
    const turns = live
      ? live.turns
      : s.turns.map((t) => ({ seq: t.seq, speaker: t.speaker, text: t.text, startMs: t.startMs, interrupted: t.interrupted, final: true }));

    return {
      id: s.id,
      scenarioTitle: s.scenarioVersion.title,
      personaName: s.persona.name,
      difficulty: EnglishLevel.parse(s.difficulty),
      status: SessionStatusSchema.parse(s.status),
      endReason: s.endReason ? EndReasonSchema.parse(s.endReason) : null,
      createdAt: s.createdAt.toISOString(),
      durationMs: live?.durationMs ?? s.durationMs,
      turnCount: turns.length,
      accent: Accent.catch('INDIAN').parse(s.accent),
      analysisStatus: AnalysisStatusSchema.parse(s.analysisStatus),
      feedback: s.analysis ? toFeedback(s.analysis) : null,
      recording: live?.recording.started
        ? { inProgress: true, durationMs: null, bytes: null }
        : s.recordingKey
          ? { inProgress: false, durationMs: s.recordingDurationMs, bytes: s.recordingBytes }
          : null,
      brief: {
        title: s.scenarioVersion.title,
        briefing: render(s.scenarioVersion.briefing),
        userRole: render(s.scenarioVersion.userRole),
        objective: render(s.scenarioVersion.objective),
      },
      goals: StoredGoals.parse(s.scenarioVersion.goals).map((g) => ({ ...g, achieved: achieved.has(g.id) })),
      turns,
    };
  }

  // ───────────── startup / shutdown ─────────────

  /** Conversations left "live" by a crash or restart are closed; their time still counts toward the quota. */
  async onModuleInit(): Promise<void> {
    const stale = await this.prisma.conversationSession.findMany({ where: { status: { in: [...ACTIVE_STATUSES] } } });
    for (const s of stale) {
      if (s.status === 'CREATED' || !s.startedAt) {
        await this.markExpired(s.id);
        continue;
      }
      const durationMs = Math.max(0, s.updatedAt.getTime() - s.startedAt.getTime());
      await this.prisma.$transaction([
        this.prisma.conversationSession.update({
          where: { id: s.id },
          data: { status: 'ENDED', endReason: 'SERVER_RESTART', endedAt: s.updatedAt, durationMs },
        }),
        this.prisma.usageRecord.create({
          data: { userId: s.userId, sessionId: s.id, kind: 'REALTIME', provider: s.provider, model: s.model, billableSeconds: Math.ceil(durationMs / 1000) },
        }),
      ]);
    }
    if (stale.length) this.logger.warn(`closed ${stale.length} conversation(s) left open by a previous run`);
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.running.values()].map((r) => r.convo.end('SERVER_RESTART')));
    await Promise.all([...this.writeChains.values()]);
  }

  // ───────────── internals ─────────────

  private async owned(userId: string, id: string) {
    const session = isUuid(id) ? await this.prisma.conversationSession.findFirst({ where: { id, userId } }) : null;
    if (!session) throw notFound();
    return session;
  }

  private async ensureNoActiveConversation(userId: string): Promise<void> {
    const active = await this.prisma.conversationSession.findMany({ where: { userId, status: { in: [...ACTIVE_STATUSES] } } });
    for (const s of active) {
      const run = this.running.get(s.id);
      if (run && !run.convo.isEnded) {
        throw problem(HttpStatus.CONFLICT, 'ACTIVE_CONVERSATION_EXISTS', 'You already have a conversation in progress');
      }
      // Never connected, or its runtime is gone: close it so it doesn't block new calls.
      if (s.status === 'CREATED') await this.markExpired(s.id);
      else if (!run) await this.prisma.conversationSession.update({ where: { id: s.id }, data: { status: 'ENDED', endReason: 'ERROR', endedAt: new Date() } });
    }
  }

  private async recentSituations(userId: string): Promise<string[]> {
    const recent = await this.prisma.conversationSession.findMany({
      where: { userId, scenarioVersion: { kind: 'casual' } },
      orderBy: { createdAt: 'desc' },
      take: RECENT_SITUATIONS,
      select: { scenarioState: true },
    });
    return recent
      .map((r) => StoredState.safeParse(r.scenarioState))
      .flatMap((p) => (p.success && typeof p.data.values.situation === 'string' ? [p.data.values.situation] : []));
  }

  private async answerOffer(sdpOffer: string) {
    try {
      return await WebRtcEndpoint.answer(sdpOffer, {
        iceServers: this.env.RTC_ICE_SERVERS.split(',').map((u) => u.trim()).filter(Boolean).map((urls) => ({ urls })),
        udpPortRange: this.env.RTC_UDP_PORT_RANGE,
      });
    } catch (err) {
      this.logger.warn(`WebRTC answer failed: ${(err as Error).message}`);
      throw problem(HttpStatus.BAD_REQUEST, 'INVALID_OFFER', 'Could not accept the call offer');
    }
  }

  private providerProblem(err: unknown): ProblemException {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(`Gemini Live setup failed: ${message}`);
    if (err instanceof GeminiSetupError && /quota|billing|exhausted|permission|api key/i.test(message)) {
      return problem(HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_QUOTA_EXHAUSTED', 'The AI voice service is unavailable right now');
    }
    return problem(HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_UNAVAILABLE', 'The AI voice service could not start the call');
  }

  private enqueue(id: string, work: () => Promise<void>): void {
    const next = (this.writeChains.get(id) ?? Promise.resolve())
      .then(work)
      .catch((err: unknown) => this.logger.error(`persist ${id}: ${(err as Error).message}`));
    this.writeChains.set(id, next);
    void next.finally(() => {
      if (this.writeChains.get(id) === next) this.writeChains.delete(id);
    });
  }

  private async markExpired(id: string): Promise<void> {
    this.pending.delete(id);
    await this.prisma.conversationSession.updateMany({ where: { id, status: 'CREATED' }, data: { status: 'EXPIRED' } });
  }

  private async persistStatus(id: string, status: LiveStatus): Promise<void> {
    if (status === 'ENDED' || status === 'FAILED') return; // written by persistFinal
    await this.prisma.conversationSession.update({
      where: { id },
      data: { status, ...(status === 'ACTIVE' ? { startedAt: this.running.get(id)?.convo.snapshot().startedAt ?? new Date() } : {}) },
    });
  }

  private async persistEvent(id: string, type: string, atMs: number, payload?: Record<string, unknown>): Promise<void> {
    await this.prisma.conversationEvent.create({
      data: { sessionId: id, type, atMs, ...(payload ? { payload: payload as Prisma.InputJsonValue } : {}) },
    });
  }

  private turnsWrite(id: string, snap: LiveSnapshot): Prisma.PrismaPromise<unknown>[] {
    const finals = snap.turns.filter((t) => t.final || snap.status === 'ENDED' || snap.status === 'FAILED');
    return [
      this.prisma.conversationTurn.deleteMany({ where: { sessionId: id } }),
      this.prisma.conversationTurn.createMany({
        data: finals.map((t, seq) => ({ sessionId: id, seq, speaker: t.speaker, text: t.text, startMs: t.startMs, interrupted: t.interrupted })),
      }),
    ];
  }

  private stateWrite(id: string, values: Record<string, string | number>) {
    return this.prisma.conversationSession.findUniqueOrThrow({ where: { id }, select: { scenarioState: true } }).then((row) => {
      const stored = StoredState.parse(row.scenarioState);
      return { values: { ...stored.values, ...values }, hidden: stored.hidden };
    });
  }

  private async persistProgress(id: string, snap: LiveSnapshot, values: Record<string, string | number>): Promise<void> {
    const scenarioState = await this.stateWrite(id, values);
    await this.prisma.$transaction([
      ...this.turnsWrite(id, snap),
      this.prisma.conversationSession.update({ where: { id }, data: { goalsAchieved: snap.goalsAchieved, scenarioState } }),
    ]);
  }

  private async persistFinal(id: string, userId: string, snap: LiveSnapshot, values: Record<string, string | number>): Promise<void> {
    const exists = await this.prisma.conversationSession.findUnique({ where: { id }, select: { id: true, provider: true, model: true } });
    const durationMs = snap.durationMs ?? 0;
    const billableSeconds = Math.ceil(durationMs / 1000);
    const usage = {
      userId,
      kind: 'REALTIME' as const,
      provider: exists?.provider ?? 'gemini',
      model: exists?.model ?? this.env.GEMINI_LIVE_MODEL,
      billableSeconds,
      inputAudioTokens: snap.usage.inputAudioTokens,
      outputAudioTokens: snap.usage.outputAudioTokens,
      inputTextTokens: snap.usage.inputTextTokens,
      outputTextTokens: snap.usage.outputTextTokens,
      cachedInputTokens: snap.usage.cachedInputTokens,
    };
    if (!exists) {
      // Deleted mid-call: keep only the usage so the daily allowance stays correct.
      await this.prisma.usageRecord.create({ data: usage });
      return;
    }
    const scenarioState = await this.stateWrite(id, values);
    await this.prisma.$transaction([
      ...this.turnsWrite(id, snap),
      this.prisma.conversationSession.update({
        where: { id },
        data: {
          status: snap.status === 'FAILED' ? 'FAILED' : 'ENDED',
          endReason: snap.endReason ?? 'ERROR',
          endedAt: new Date(),
          durationMs,
          ...(snap.startedAt ? { startedAt: snap.startedAt } : {}),
          goalsAchieved: snap.goalsAchieved,
          scenarioState,
          userSpeakingMs: Math.round(snap.liveMetrics.userSpeakingMs),
          liveMetrics: snap.liveMetrics,
          analysisStatus: snap.turns.some((t) => t.speaker === 'USER') ? 'PENDING' : 'SKIPPED',
          ...(snap.recording.result
            ? { recordingDurationMs: snap.recording.result.durationMs, recordingBytes: snap.recording.result.bytes }
            : {}),
        },
      }),
      this.prisma.usageRecord.create({ data: { ...usage, sessionId: id } }),
    ]);
    this.logger.log(`conversation ${id} ended: ${snap.endReason} after ${durationMs} ms, ${snap.turns.length} turns, media=${JSON.stringify(snap.media)}`);
    if (snap.turns.some((t) => t.speaker === 'USER')) {
      await this.analysisQueue.enqueue(id).catch((err: unknown) => this.logger.error(`could not queue analysis for ${id}: ${(err as Error).message}`));
    }
  }
}

const isUuid = (id: string) => z.string().uuid().safeParse(id).success;

type AnalysisRow = Prisma.SessionAnalysisGetPayload<{
  include: { grammarErrors: true; vocabularyItems: true; fluency: true; recommendations: true };
}>;

/** DB rows → the Feedback contract (validated, so a bad row can't reach the app). */
function toFeedback(a: AnalysisRow): Feedback {
  const f = a.fluency;
  return Feedback.parse({
    overallScore: a.overallScore,
    summary: a.summary,
    strengths: a.strengths,
    focusAreas: a.focusAreas,
    skills: a.skills,
    grammarErrors: a.grammarErrors.map((e) => ({ turnSeq: e.turnSeq, original: e.original, corrected: e.corrected, category: e.category, explanation: e.explanation, severity: e.severity })),
    vocabulary: a.vocabularyItems.map((v) => ({ kind: v.kind, term: v.term, alternatives: v.alternatives, example: v.example })),
    fluency: {
      userSpeakingMs: f?.userSpeakingMs ?? 0,
      userWords: f?.userWords ?? 0,
      wordsPerMinute: f?.wordsPerMinute ?? null,
      fillerCounts: f?.fillerCounts ?? {},
      fillersPerMinute: f?.fillersPerMinute ?? null,
      latencyP50Ms: f?.latencyP50Ms ?? null,
      longPauseCount: f?.longPauseCount ?? 0,
    },
    conversationSkills: a.conversationSkills,
    translationPatterns: a.translationPatterns,
    recommendations: a.recommendations.map((r) => ({ type: r.type, scenarioSlug: r.scenarioSlug, title: r.title, reason: r.reason })),
    feedbackLanguage: FeedbackLanguage.catch('en').parse(a.feedbackLanguage),
  });
}

function pickRandom<T>(list: readonly T[]): T | undefined {
  return list[Math.floor(Math.random() * list.length)];
}

function problem(status: HttpStatus, code: string, title: string): ProblemException {
  return new ProblemException(status, code, title);
}

/** Other users' conversations are reported as not found (404, not 403) so ids can't be probed. */
function notFound(): ProblemException {
  return problem(HttpStatus.NOT_FOUND, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
}
