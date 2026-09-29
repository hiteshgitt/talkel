import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { PocConnectRequest, type PocConnectResponse, type PocTranscriptResponse } from '@speakai/contracts';
import { parseBody } from '../common/problem.js';
import { DevTokenGuard } from './dev-token.guard.js';
import { PocCallsService } from './poc-calls.service.js';

@Controller('poc')
@UseGuards(DevTokenGuard)
export class PocController {
  constructor(private readonly calls: PocCallsService) {}

  /** WebRTC signalling: device SDP offer in, provider SDP answer out (session config bound server-side). */
  @Post('connect')
  connect(@Body() body: unknown): Promise<PocConnectResponse> {
    return this.calls.connect(parseBody(PocConnectRequest, body));
  }

  /** Device's media is up — the AI may now speak first. */
  @Post('calls/:callId/ready')
  @HttpCode(204)
  ready(@Param('callId') callId: string): void {
    this.calls.markReady(callId);
  }

  @Post('calls/:callId/end')
  @HttpCode(200)
  end(@Param('callId') callId: string): Promise<PocTranscriptResponse> {
    return this.calls.end(callId);
  }

  @Get('calls/:callId/transcript')
  transcript(@Param('callId') callId: string): PocTranscriptResponse {
    return this.calls.transcript(callId);
  }
}
