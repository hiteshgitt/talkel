import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ConnectRequest,
  type ConnectResponse,
  type ConversationDetail,
  type ConversationList,
  CreateConversationRequest,
  type CreateConversationResponse,
  type Quota,
} from '@speakai/contracts';
import { z } from 'zod';
import { AllowDevToken, CurrentUser, type SessionUser } from '../auth/auth.decorators.js';
import { parseBody } from '../common/problem.js';
import { ConversationsService } from './conversations.service.js';
import { QuotaService } from './quota.service.js';

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

  @Delete('conversations/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string): Promise<void> {
    return this.conversations.remove(user.id, id);
  }
}
