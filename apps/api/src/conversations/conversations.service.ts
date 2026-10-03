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
  ReplayResult,
  type ConversationList,
  type CreateConversationRequest,
  type CreateConversationResponse,
  type LiveCompleteRequest,
  type LiveTokenRequest,
  type LiveTokenResponse,
  type LiveToolRequest,
  type LiveToolResponse,
  type TranscriptTurn,
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
import { createLiveToken, liveSocketUrl } from '../gemini/live-token.js';
import { WebRtcEndpoint } from '../media/webrtc-endpoint.js';
import { JsonlCallLog } from '../common/jsonl-call-log.js';
import { CallRecorder } from '../recording/call-recorder.js';
import { RECORDING_STORE, recordingKey, type RecordingStore } from '../recording/recording-store.js';
import { LiveConversation, type LiveSnapshot, type LiveStatus } from './live-conversation.js';
import { AnalysisQueue } from '../analysis/analysis-queue.js';
import { LearningProfileService } from '../analysis/learning-profile.service.js';
import { QuotaService } from './quota.service.js';
import { entitlementsFor } from '../users/users.service.js';
import { IceServers } from '../rtc/ice-servers.js';
import { MissionSpec, objectivesOf } from '../missions/mission-rules.js';
import { MEMORIES_IN_PROMPT, memoryApplies } from '../memory/memory-rules.js';

const MIN_REMAINING_TO_START_SEC = 30;
const CONNECT_WINDOW_MS = 5 * 60_000; // time to read the brief before starting
const RECENT_SITUATIONS = 6;
const ACTIVE_STATUSES = ['CREATED', 'CONNECTING', 'ACTIVE', 'RECONNECTING'] as const;

const StoredState = z.object({
  values: z.record(z.string(), z.union([z.string(), z.number()])),
  hidden: z.array(z.string()),
});
const StoredGoals = z.array(z.object({ id: z.string(), description: z.string(), label: z.string().optional() }));
const StoredReplayState = z.object({ values: z.record(z.string(), z.union([z.string(), z.number()])), hidden: z.array(z.string()).default([]) });
/** A replay is one question and one answer. */
const REPLAY_MAX_SEC = 120;
const PersonaVoices = z.object({ gemini: z.string(), openai: z.string().optional() });

interface Pending {
  userId: string;
  prepared: PreparedConversation;
  voiceName: string;
  expiresAt: number;
}

/** A call where the phone talks to Gemini Live directly; we issue tokens, run tools and save the result. */
interface Direct {
  userId: string;
  prepared: PreparedConversation;
  voiceName: string;
  values: Record<string, string | number>;
  plannedMs: number;
  connectedAt: number;
  /** When the AI opened the call (the billable start). */
  readyAt: number | null;
  /** Last request from the phone; a call that goes quiet is closed by the sweeper. */
  lastSeen: number;
  turns: TranscriptTurn[];
}

/** No word from the phone for this long: the app was killed or lost the network for good. */
const DIRECT_SILENCE_MS = 75_000;
/** Time to open the socket with a token. */
const TOKEN_CONNECT_MS = 90_000;

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
  private readonly direct = new Map<string, Direct>();
  private sweeper: NodeJS.Timeout | null = null;
  /** Serialises DB writes per session (periodic flushes vs. the final write). */
  private readonly writeChains = new Map<string, Promise<void>>();

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
    @Inject(RECORDING_STORE) private readonly recordings: RecordingStore,
    private readonly quota: QuotaService,
    private readonly analysisQueue: AnalysisQueue,
    private readonly profiles: LearningProfileService,
    private readonly ice: IceServers,
  ) {}

  // ───────────── lifecycle ─────────────

  async create(userId: string, req: CreateConversationRequest): Promise<CreateConversationResponse> {
    const [scenario, personas, user] = await Promise.all([
      this.prisma.scenario.findFirst({
        where: { id: req.scenarioId, isActive: true, publishedVersionId: { not: null } },
        include: { publishedVersion: true, missionProgress: { where: { userId } } },
      }),
      this.prisma.persona.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true, settings: true } }),
    ]);
    if (!scenario?.publishedVersion) throw problem(HttpStatus.NOT_FOUND, 'SCENARIO_NOT_FOUND', 'Scenario not found');

    // Missions: play an unlocked pressure level (default: the highest unlocked).
    const isMission = scenario.type === 'MISSION';
    const spec = isMission ? MissionSpec.parse(scenario.publishedVersion.mission) : null;
    const unlocked = scenario.missionProgress[0]?.unlockedLevel ?? 1;
    const missionLevel = isMission ? (req.missionLevel ?? unlocked) : null;
    if (missionLevel !== null && missionLevel > unlocked) {
      throw problem(HttpStatus.FORBIDDEN, 'MISSION_LEVEL_LOCKED', `Pass level ${missionLevel - 1} to unlock level ${missionLevel}`);
    }

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
      missionLevel,
      memories:
        settings?.memoryEnabled && memoryApplies({ kind: version.kind, missionLevel, isReplay: false })
          ? (await this.prisma.userMemory.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: MEMORIES_IN_PROMPT })).map((m) => m.text)
          : [],
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
        missionLevel,
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
      scenarioSlug: scenario.slug,
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
      mission:
        spec && missionLevel !== null
          ? { level: missionLevel, objectives: objectivesOf(version.goals).map((o) => o.text), aiCharacter: spec.aiCharacter }
          : null,
    };
  }

  /**
   * "Try that answer again": a short call where the same partner, in the same situation, asks the
   * question before the user's turn `turnSeq` again. Compared with the first answer afterwards.
   */
  async replay(userId: string, originalId: string, turnSeq: number): Promise<CreateConversationResponse> {
    const original = await this.owned(userId, originalId);
    if (original.replayOfId) throw problem(HttpStatus.BAD_REQUEST, 'NOT_REPLAYABLE', 'Replay a moment from the original conversation');
    if (original.status !== 'ENDED') throw problem(HttpStatus.CONFLICT, 'CONVERSATION_NOT_ENDED', 'You can replay a moment once the conversation has ended');

    const turns = await this.prisma.conversationTurn.findMany({ where: { sessionId: originalId }, orderBy: { seq: 'asc' } });
    const index = turns.findIndex((t) => t.seq === turnSeq);
    const answer = turns[index];
    const question = [...turns.slice(0, Math.max(0, index))].reverse().find((t) => t.speaker === 'AI' && t.text.trim());
    if (!answer || answer.speaker !== 'USER' || !answer.text.trim() || !question) {
      throw problem(HttpStatus.BAD_REQUEST, 'NOT_REPLAYABLE', 'This line can’t be replayed');
    }

    const [version, persona, user] = await Promise.all([
      this.prisma.scenarioVersion.findUniqueOrThrow({ where: { id: original.scenarioVersionId }, include: { scenario: { select: { slug: true } } } }),
      this.prisma.persona.findUniqueOrThrow({ where: { id: original.personaId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { profile: true } }),
    ]);

    await this.ensureNoActiveConversation(userId);
    const quota = await this.quota.forUser(userId);
    if (quota.remainingSec < MIN_REMAINING_TO_START_SEC) {
      throw problem(HttpStatus.PAYMENT_REQUIRED, 'QUOTA_EXCEEDED', 'You’ve used today’s free practice time');
    }
    const durationSec = Math.min(REPLAY_MAX_SEC, quota.remainingSec);
    const state = StoredReplayState.parse(original.scenarioState);
    const difficulty = EnglishLevel.catch('INTERMEDIATE').parse(original.difficulty);
    const accent = Accent.catch('INDIAN').parse(original.accent);

    const prepared = prepareConversation({
      scenario: version,
      persona: { id: persona.id, version: persona.version, name: persona.name, promptFragment: persona.promptFragment },
      difficulty,
      accent,
      liveCorrection: false,
      learnerGoals: [],
      // Same pressure as the original mission attempt, but a replay never counts as a mission attempt.
      missionLevel: original.missionLevel,
      timeZone: user.profile?.timezone ?? 'Asia/Kolkata',
      fixedState: state,
      replayQuestion: question.text,
    });

    const session = await this.prisma.conversationSession.create({
      data: {
        userId,
        scenarioVersionId: version.id,
        personaId: persona.id,
        difficulty,
        accent,
        liveCorrection: false,
        plannedDurationSec: durationSec,
        provider: 'gemini',
        model: this.env.GEMINI_LIVE_MODEL,
        promptVersions: prepared.promptVersions,
        instructionsHash: prepared.instructionsHash,
        scenarioState: { values: prepared.scenarioState, hidden: [...prepared.hiddenKeys] },
        replayOfId: originalId,
        replayTurnSeq: turnSeq,
        replayContext: { question: question.text, originalAnswer: answer.text },
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
      scenarioSlug: version.scenario.slug,
      brief: { ...prepared.brief, title: `Try again: ${version.title}` },
      persona: { id: persona.id, slug: persona.slug, name: persona.name, gender: VoiceGender.parse(persona.gender), description: persona.description },
      accent,
      difficulty,
      durationSec,
      mission: null,
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

    const { pending, apiKey, durationSec } = await this.takePending(userId, id, session);
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
      endPolicy: prepared.endPolicy,
      styleCue: prepared.styleCue,
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

  /**
   * Direct calls: a single-use Gemini Live token with the whole session setup locked in. Called once
   * to start, and again with the provider's resume handle whenever the phone has to reconnect.
   */
  async liveToken(userId: string, id: string, req: LiveTokenRequest): Promise<LiveTokenResponse> {
    const session = await this.owned(userId, id);
    let call = this.direct.get(id);
    if (req.resumeHandle) {
      if (!call || call.userId !== userId) throw problem(HttpStatus.CONFLICT, 'SESSION_NOT_CONNECTABLE', 'This conversation has already ended');
    } else {
      const { pending, durationSec } = await this.takePending(userId, id, session);
      call = {
        userId,
        prepared: pending.prepared,
        voiceName: pending.voiceName,
        values: { ...pending.prepared.scenarioState },
        plannedMs: durationSec * 1000,
        connectedAt: Date.now(),
        readyAt: null,
        lastSeen: Date.now(),
        turns: [],
      };
    }
    const apiKey = this.env.GEMINI_API_KEY;
    if (!apiKey) throw problem(HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_NOT_CONFIGURED', 'AI provider is not configured');

    const { prepared } = call;
    const setup = {
      ...buildGeminiSetup({ model: this.env.GEMINI_LIVE_MODEL, voiceName: call.voiceName, prepared }),
      // Resumption must be part of the token: the provider ignores a handle sent by the phone.
      sessionResumption: req.resumeHandle ? { handle: req.resumeHandle } : {},
    };
    const now = Date.now();
    // The connection is cut off shortly after the call's time is up, whatever the phone does.
    const endsAt = (call.readyAt ?? now) + call.plannedMs + 90_000;
    let token: string;
    try {
      token = await createLiveToken({ apiKey, baseUrl: this.env.GEMINI_API_BASE, setup, connectBy: new Date(now + TOKEN_CONNECT_MS), expiresAt: new Date(Math.max(endsAt, now + TOKEN_CONNECT_MS)) });
    } catch (err) {
      if (!req.resumeHandle) {
        await this.prisma.conversationSession.update({ where: { id }, data: { status: 'FAILED', endReason: 'ERROR', endedAt: new Date() } });
      }
      throw this.providerProblem(err);
    }
    call.lastSeen = now;
    if (!req.resumeHandle) {
      this.direct.set(id, call);
      await this.prisma.conversationSession.update({ where: { id }, data: { status: 'CONNECTING', plannedDurationSec: call.plannedMs / 1000 } });
      this.logger.log(`conversation ${id} direct token issued (user=${userId}, ${call.plannedMs / 1000}s)`);
    } else {
      this.enqueue(id, () => this.persistEvent(id, 'RECONNECTED', this.directElapsed(call!)));
    }
    return {
      url: liveSocketUrl(this.env.GEMINI_LIVE_URL, token),
      model: setup.model,
      durationSec: Math.round(call.plannedMs / 1000),
      openingCue: prepared.openingCue,
      wrapUpCue: prepared.wrapUpCue,
      styleCue: prepared.styleCue,
      endPolicy: prepared.endPolicy,
    };
  }

  /** Direct calls: the AI called a tool. Runs here because tools may use hidden state (e.g. a floor price). */
  async liveTool(userId: string, id: string, req: LiveToolRequest): Promise<LiveToolResponse> {
    const call = this.directCall(userId, id);
    const outcome = handleToolCall(req.name, req.args, { values: call.values, goalIds: call.prepared.goals.map((g) => g.id), goalsAchieved: new Set() });
    if (outcome.stateChanges) {
      Object.assign(call.values, outcome.stateChanges);
      const values = { ...call.values };
      this.enqueue(id, async () => {
        await this.prisma.conversationSession.update({ where: { id }, data: { scenarioState: await this.stateWrite(id, values) } });
      });
    }
    this.enqueue(id, () => this.persistEvent(id, 'TOOL_CALL', this.directElapsed(call), { name: req.name, args: req.args as Record<string, unknown>, response: outcome.response }));
    return { response: outcome.response, endRequested: outcome.endRequested ?? null };
  }

  /** Direct calls: periodic transcript save (also the phone's heartbeat). */
  async liveProgress(userId: string, id: string, turns: TranscriptTurn[]): Promise<void> {
    const call = this.directCall(userId, id);
    call.turns = turns;
    this.enqueue(id, async () => {
      await this.prisma.$transaction(this.turnsWrite(id, { turns, status: 'ACTIVE' }));
    });
  }

  /** Direct calls: the call is over; save it and queue the feedback. */
  async liveComplete(userId: string, id: string, req: LiveCompleteRequest): Promise<ConversationDetail> {
    const call = this.direct.get(id);
    if (call && call.userId === userId) {
      this.finishDirect(id, call, req.endReason, { turns: req.turns, durationMs: req.durationMs, liveMetrics: req.liveMetrics, usage: req.usage });
      await this.writeChains.get(id);
    } else {
      await this.owned(userId, id); // already closed (e.g. by the sweeper): just return it
    }
    return this.detail(userId, id);
  }

  async ready(userId: string, id: string): Promise<void> {
    const call = this.direct.get(id);
    if (call && call.userId === userId) {
      if (call.readyAt !== null) return;
      call.readyAt = Date.now();
      call.lastSeen = call.readyAt;
      const startedAt = new Date(call.readyAt);
      this.enqueue(id, async () => {
        await this.prisma.conversationSession.update({ where: { id }, data: { status: 'ACTIVE', startedAt } });
      });
      this.enqueue(id, () => this.persistEvent(id, 'READY', 0));
      return;
    }
    const run = this.running.get(id);
    if (!run || run.userId !== userId) throw notFound();
    run.convo.markMediaReady();
  }

  async end(userId: string, id: string): Promise<ConversationDetail> {
    const session = await this.owned(userId, id);
    const run = this.running.get(id);
    const call = this.direct.get(id);
    if (call && call.userId === userId) {
      // The phone normally sends "complete" with the transcript; this is the fallback.
      this.finishDirect(id, call, 'USER_ENDED');
      await this.writeChains.get(id);
    } else if (run && run.userId === userId) {
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
    if (this.direct.has(id)) throw problem(HttpStatus.CONFLICT, 'RECORDING_UNAVAILABLE', 'Recording isn’t available for this call yet');
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
    const call = this.direct.get(id);
    if (call) this.finishDirect(id, call, 'USER_ENDED');
    if (run) await run.convo.end('USER_ENDED');
    if (call || run) await this.writeChains.get(id);
    this.pending.delete(id);
    if (owned.recordingKey) await this.recordings.remove(owned.recordingKey);
    await this.prisma.conversationSession.delete({ where: { id } }); // turns/events cascade; usage keeps counting
  }

  // ───────────── reads ─────────────

  async list(userId: string, cursor: string | undefined, limit = 20): Promise<ConversationList> {
    const rows = await this.prisma.conversationSession.findMany({
      // Replays belong to their conversation, not to History.
      where: { userId, status: { notIn: ['CREATED', 'EXPIRED'] }, replayOfId: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        scenarioVersion: { select: { title: true, scenario: { select: { slug: true } } } },
        persona: { select: { name: true } },
        analysis: { select: { overallScore: true } },
        _count: { select: { turns: true } },
      },
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((s) => ({
        id: s.id,
        scenarioTitle: s.scenarioVersion.title,
        scenarioSlug: s.scenarioVersion.scenario.slug,
        personaName: s.persona.name,
        difficulty: EnglishLevel.parse(s.difficulty),
        status: SessionStatusSchema.parse(s.status),
        endReason: s.endReason ? EndReasonSchema.parse(s.endReason) : null,
        createdAt: s.createdAt.toISOString(),
        durationMs: s.durationMs,
        turnCount: s._count.turns,
        overallScore: s.analysis?.overallScore ?? null,
        missionLevel: s.missionLevel,
      })),
      nextCursor: rows.length > limit ? page.at(-1)!.id : null,
    };
  }

  async detail(userId: string, id: string): Promise<ConversationDetail> {
    if (!isUuid(id)) throw notFound();
    const s = await this.prisma.conversationSession.findFirst({
      where: { id, userId },
      include: {
        scenarioVersion: { include: { scenario: { select: { slug: true } } } },
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
    const call = this.direct.get(id);
    const achieved = new Set(live ? live.goalsAchieved : s.goalsAchieved);
    const turns = live
      ? live.turns
      : call
        ? call.turns
        : s.turns.map((t) => ({ seq: t.seq, speaker: t.speaker, text: t.text, startMs: t.startMs, interrupted: t.interrupted, final: true }));

    return {
      id: s.id,
      scenarioTitle: s.scenarioVersion.title,
      scenarioSlug: s.scenarioVersion.scenario.slug,
      personaName: s.persona.name,
      difficulty: EnglishLevel.parse(s.difficulty),
      status: SessionStatusSchema.parse(s.status),
      endReason: s.endReason ? EndReasonSchema.parse(s.endReason) : null,
      createdAt: s.createdAt.toISOString(),
      durationMs: live?.durationMs ?? (call ? this.directElapsed(call) : s.durationMs),
      turnCount: turns.length,
      overallScore: s.analysis?.overallScore ?? null,
      missionLevel: s.missionLevel,
      missionId: s.missionLevel !== null && !s.replayOfId ? s.scenarioVersion.scenarioId : null,
      replay: s.replayOfId ? replayView(s.replayOfId, s.replayTurnSeq ?? 0, s.replayContext, s.replayResult, turns) : null,
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
      // Missions show the user-facing objective wording.
      goals: StoredGoals.parse(s.scenarioVersion.goals).map((g) => ({ id: g.id, description: g.label ?? g.description, achieved: achieved.has(g.id) })),
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
    this.sweeper = setInterval(() => this.sweepDirect(), 15_000);
    this.sweeper.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.sweeper) clearInterval(this.sweeper);
    for (const [id, call] of this.direct) this.finishDirect(id, call, 'SERVER_RESTART');
    await Promise.all([...this.running.values()].map((r) => r.convo.end('SERVER_RESTART')));
    await Promise.all([...this.writeChains.values()]);
  }

  // ───────────── internals ─────────────

  /** True while the call is running in this process (used by the "hold" request). */
  async assertOwned(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
  }

  isLive(id: string): boolean {
    if (this.direct.has(id)) return true;
    const run = this.running.get(id);
    return Boolean(run && !run.convo.isEnded);
  }

  /** Current feedback status, for the long-poll that waits for it. */
  async analysisStatus(userId: string, id: string): Promise<string> {
    return (await this.owned(userId, id)).analysisStatus;
  }

  private async owned(userId: string, id: string) {
    const session = isUuid(id) ? await this.prisma.conversationSession.findFirst({ where: { id, userId } }) : null;
    if (!session) throw notFound();
    return session;
  }

  private async ensureNoActiveConversation(userId: string): Promise<void> {
    const active = await this.prisma.conversationSession.findMany({ where: { userId, status: { in: [...ACTIVE_STATUSES] } } });
    for (const s of active) {
      const run = this.running.get(s.id);
      if ((run && !run.convo.isEnded) || this.direct.has(s.id)) {
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

  /** Validates a just-created conversation for its first connection and re-checks the allowance. */
  private async takePending(userId: string, id: string, session: { status: string; plannedDurationSec: number }) {
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
    return { pending, apiKey, durationSec };
  }

  private directCall(userId: string, id: string): Direct {
    const call = this.direct.get(id);
    if (!call || call.userId !== userId) throw problem(HttpStatus.CONFLICT, 'CONVERSATION_NOT_LIVE', 'This conversation has already ended');
    call.lastSeen = Date.now();
    return call;
  }

  private directElapsed(call: Direct, at = Date.now()): number {
    return call.readyAt === null ? 0 : Math.max(0, at - call.readyAt);
  }

  /**
   * Saves a direct call exactly once. Billable time is the phone's figure, capped by our own clock
   * (from "ready" to now) and the planned length, so a modified app can't under- or over-report much.
   */
  private finishDirect(
    id: string,
    call: Direct,
    endReason: NonNullable<LiveSnapshot['endReason']>,
    report?: Pick<LiveCompleteRequest, 'turns' | 'durationMs' | 'liveMetrics' | 'usage'>,
    at = Date.now(),
  ): void {
    if (this.direct.get(id) !== call) return;
    this.direct.delete(id);
    const serverMs = this.directElapsed(call, at);
    const durationMs = call.readyAt === null ? 0 : Math.min(report?.durationMs ?? serverMs, serverMs + 5_000, call.plannedMs + 15_000);
    const turns = (report?.turns ?? call.turns).map((t) => ({ ...t, final: true }));
    const snap: LiveSnapshot = {
      status: endReason === 'ERROR' ? 'FAILED' : 'ENDED',
      endReason,
      startedAt: call.readyAt === null ? null : new Date(call.readyAt),
      durationMs,
      turns,
      goalsAchieved: [],
      stateChanges: {},
      usage: report?.usage ?? { inputAudioTokens: 0, outputAudioTokens: 0, inputTextTokens: 0, outputTextTokens: 0, cachedInputTokens: 0 },
      media: null,
      liveMetrics: report?.liveMetrics ?? { userSpeakingMs: 0, responseLatenciesMs: [] },
      recording: { active: false, started: false, result: null },
    };
    const values = { ...call.values };
    this.enqueue(id, () => this.persistEvent(id, 'ENDED', durationMs, { reason: endReason, direct: true }));
    this.enqueue(id, () => this.persistFinal(id, call.userId, snap, values));
  }

  /** Closes direct calls whose phone went silent, never connected, or ran far past their time. */
  private sweepDirect(now = Date.now()): void {
    for (const [id, call] of this.direct) {
      if (call.readyAt === null && now - call.connectedAt > TOKEN_CONNECT_MS + 30_000) {
        this.finishDirect(id, call, 'ERROR', undefined, now);
      } else if (now - call.lastSeen > DIRECT_SILENCE_MS) {
        this.finishDirect(id, call, 'CONNECTION_LOST', undefined, call.lastSeen);
      } else if (call.readyAt !== null && now - call.readyAt > call.plannedMs + 120_000) {
        this.finishDirect(id, call, 'TIME_LIMIT', undefined, now);
      }
    }
  }

  private async answerOffer(sdpOffer: string) {
    try {
      return await WebRtcEndpoint.answer(sdpOffer, {
        iceServers: await this.ice.forServer(),
        iceTransportPolicy: this.ice.relayOnly ? 'relay' : 'all',
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

  private turnsWrite(id: string, snap: Pick<LiveSnapshot, 'turns' | 'status'>): Prisma.PrismaPromise<unknown>[] {
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

export const isUuid = (id: string) => z.string().uuid().safeParse(id).success;

type AnalysisRow = Prisma.SessionAnalysisGetPayload<{
  include: { grammarErrors: true; vocabularyItems: true; fluency: true; recommendations: true };
}>;

/** DB rows → the Feedback contract (validated, so a bad row can't reach the app). */
const ReplayContext = z.object({ question: z.string(), originalAnswer: z.string() });

function replayView(
  originalId: string,
  turnSeq: number,
  context: unknown,
  result: unknown,
  turns: ReadonlyArray<{ speaker: string; text: string }>,
): NonNullable<ConversationDetail['replay']> {
  const ctx = ReplayContext.catch({ question: '', originalAnswer: '' }).parse(context);
  const answer = turns.filter((t) => t.speaker === 'USER').map((t) => t.text.trim()).filter(Boolean).join(' ');
  return {
    originalId,
    turnSeq,
    question: ctx.question,
    originalAnswer: ctx.originalAnswer,
    newAnswer: answer || null,
    result: ReplayResult.nullable().catch(null).parse(result ?? null),
  };
}

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
    // Older analyses (eval-v1) have none; tolerate anything malformed rather than failing the page.
    phrasing: Feedback.shape.phrasing.catch([]).parse(a.phrasing),
    mission: Feedback.shape.mission.catch(null).parse(a.missionResult ?? null),
    remembered: a.remembered,
    conversationMoments: Feedback.shape.conversationMoments.catch([]).parse(a.conversationMoments),
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
