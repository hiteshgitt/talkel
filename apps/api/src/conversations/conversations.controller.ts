import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ConnectRequest,
  type ConnectResponse,
  type ConversationDetail,
  type ConversationList,
  CreateConversationRequest,
  type CreateConversationResponse,
  LiveCompleteRequest,
  LiveProgressRequest,
  LiveTokenRequest,
  type LiveTokenResponse,
  LiveToolRequest,
  type LiveToolResponse,
  type Quota,
  ReplayRequest,
  SayItRequest,
  type SayItResult,
} from '@speakai/contracts';
import { z } from 'zod';
import { AllowDevToken, CurrentUser, type SessionUser } from '../auth/auth.decorators.js';
import { parseBody, ProblemException } from '../common/problem.js';
import { RephraseService } from '../analysis/rephrase.service.js';
import { ConversationsService, isUuid } from './conversations.service.js';
import { QuotaService } from './quota.service.js';

const RecordingToggle = z.object({ on: z.boolean() });

const ListQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/** The signed-in user's conversations. Every query is scoped to the session's user. */
@Controller()
@AllowDevToken() // headless test scripts act as a dedicated dev user
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly quota: QuotaService,
    private readonly rephrase: RephraseService,
  ) {}

  @Get('quota')
  getQuota(@CurrentUser() user: SessionUser): Promise<Quota> {
    return this.quota.forUser(user.id);
  }

  @Post('conversations')
  create(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<CreateConversationResponse> {
    return this.conversations.create(user.id, parseBody(CreateConversationRequest, body));
  }

  @Get('conversations')
  list(@CurrentUser() user: SessionUser, @Query() query: unknown): Promise<ConversationList> {
    const q = parseBody(ListQuery, query);
    return this.conversations.list(user.id, q.cursor, q.limit);
  }

  @Get('conversations/:id')
  detail(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<ConversationDetail> {
    return this.conversations.detail(user.id, id);
  }

  /**
   * Held open by the phone for the whole call. On Cloud Run's request-based billing an instance only
   * gets CPU while a request is in flight, so this keeps the call's audio processing running (and
   * lets the instance scale to zero when nobody is talking). Heartbeats keep proxies from timing out.
   */
  @Get('conversations/:id/hold')
  async hold(@CurrentUser() user: SessionUser, @Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    await this.conversations.assertOwned(user.id, id);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Accel-Buffering', 'no');
    res.status(200);
    res.write('live\n');
    const started = Date.now();
    await new Promise<void>((resolve) => {
      let beat = 0;
      const timer = setInterval(() => {
        // The call may need a moment to start; then hold until it ends (hard cap: Cloud Run's 60 min).
        const live = this.conversations.isLive(id);
        if ((!live && Date.now() - started > 15_000) || Date.now() - started > 59 * 60_000) return stop();
        if (++beat % 15 === 0) res.write('.\n');
      }, 1_000);
      const stop = () => {
        clearInterval(timer);
        resolve();
      };
      req.on('close', stop);
    });
    if (!res.writableEnded) res.end('ended\n');
  }

  /** Long-poll: returns as soon as the feedback (or replay comparison) is no longer being prepared, or after ~50 s. */
  @Get('conversations/:id/feedback/wait')
  async waitForFeedback(@CurrentUser() user: SessionUser, @Param('id') id: string, @Req() req: Request): Promise<{ analysisStatus: string }> {
    const deadline = Date.now() + 50_000;
    let closed = false;
    req.on('close', () => (closed = true));
    for (;;) {
      const status = await this.conversations.analysisStatus(user.id, id);
      if ((status !== 'PENDING' && status !== 'PROCESSING') || Date.now() > deadline || closed) return { analysisStatus: status };
      await new Promise((r) => setTimeout(r, 1_500));
    }
  }

  /** WebRTC signalling: phone SDP offer in, our gateway's SDP answer out. */
  @Post('conversations/:id/connect')
  @HttpCode(200)
  connect(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<ConnectResponse> {
    return this.conversations.connect(user.id, id, parseBody(ConnectRequest, body));
  }

  /** Direct calls: a single-use token for the phone to talk to Gemini Live (start, or resume after a drop). */
  @Post('conversations/:id/live-token')
  @HttpCode(200)
  liveToken(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<LiveTokenResponse> {
    return this.conversations.liveToken(user.id, id, parseBody(LiveTokenRequest, body ?? {}));
  }

  /** Direct calls: run a tool the AI called. */
  @Post('conversations/:id/live-tool')
  @HttpCode(200)
  liveTool(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<LiveToolResponse> {
    return this.conversations.liveTool(user.id, id, parseBody(LiveToolRequest, body));
  }

  /** Direct calls: transcript so far (sent every few seconds; also the call's heartbeat). */
  @Post('conversations/:id/live-progress')
  @HttpCode(204)
  liveProgress(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<void> {
    return this.conversations.liveProgress(user.id, id, parseBody(LiveProgressRequest, body).turns);
  }

  /** Direct calls: the call ended on the phone; save it and start the feedback. */
  @Post('conversations/:id/live-complete')
  @HttpCode(200)
  liveComplete(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<ConversationDetail> {
    return this.conversations.liveComplete(user.id, id, parseBody(LiveCompleteRequest, body));
  }

  /** The phone's media is up: the AI opens the conversation. */
  @Post('conversations/:id/ready')
  @HttpCode(204)
  ready(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.conversations.ready(user.id, id);
  }

  @Post('conversations/:id/end')
  @HttpCode(200)
  end(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<ConversationDetail> {
    return this.conversations.end(user.id, id);
  }

  /** Try the after-call feedback again if it failed. */
  @Post('conversations/:id/feedback/retry')
  @HttpCode(202)
  retryFeedback(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.conversations.retryFeedback(user.id, id);
  }

  /** "Say it 3 ways": natural / professional / casual versions of a sentence from this conversation. */
  @Post('conversations/:id/say-it')
  @HttpCode(200)
  sayIt(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<SayItResult> {
    if (!isUuid(id)) throw new ProblemException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Conversation not found');
    return this.rephrase.sayIt(user.id, id, parseBody(SayItRequest, body).text);
  }

  /** "Try that answer again": a short replay call of the question before the user's turn `turnSeq`. */
  @Post('conversations/:id/replay')
  @HttpCode(201)
  replay(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<CreateConversationResponse> {
    return this.conversations.replay(user.id, id, parseBody(ReplayRequest, body).turnSeq);
  }

  /** Start/stop recording the live call (both voices). */
  @Post('conversations/:id/recording')
  @HttpCode(200)
  record(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<{ recording: boolean }> {
    return this.conversations.setRecording(user.id, id, parseBody(RecordingToggle, body).on);
  }

  /** Streams the owner's recording (Ogg Opus) with HTTP Range support, so players can seek. */
  @Get('conversations/:id/recording')
  async recording(@CurrentUser() user: SessionUser, @Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    const { key, size } = await this.conversations.recordingFile(user.id, id);
    const headers = {
      'Content-Type': 'audio/ogg',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="conversation-${id}.ogg"`,
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        res.status(416).set({ 'Content-Range': `bytes */${size}` }).end();
        return;
      }
      res.status(206).set({ ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) });
      this.conversations.openRecording(key, { start, end }).pipe(res);
      return;
    }
    res.status(200).set({ ...headers, 'Content-Length': String(size) });
    this.conversations.openRecording(key).pipe(res);
  }

  @Delete('conversations/:id/recording')
  @HttpCode(204)
  deleteRecording(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.conversations.deleteRecording(user.id, id);
  }

  @Delete('conversations/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.conversations.remove(user.id, id);
  }
}
