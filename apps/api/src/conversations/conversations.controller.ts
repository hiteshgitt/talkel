import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ConnectRequest,
  type ConnectResponse,
  type ConversationDetail,
  type ConversationList,
  CreateConversationRequest,
  type CreateConversationResponse,
  type Quota,
  ReplayRequest,
} from '@speakai/contracts';
import { z } from 'zod';
import { AllowDevToken, CurrentUser, type SessionUser } from '../auth/auth.decorators.js';
import { parseBody } from '../common/problem.js';
import { ConversationsService } from './conversations.service.js';
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

  /** WebRTC signalling: phone SDP offer in, our gateway's SDP answer out. */
  @Post('conversations/:id/connect')
  @HttpCode(200)
  connect(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: unknown): Promise<ConnectResponse> {
    return this.conversations.connect(user.id, id, parseBody(ConnectRequest, body));
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
