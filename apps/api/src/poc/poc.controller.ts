import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import { PocConnectRequest, type PocConnectResponse, type PocTranscriptResponse } from '@speakai/contracts';
import { parseBody } from '../common/problem.js';
import { AllowDevToken, type AuthedRequest } from '../auth/auth.decorators.js';
import { PocCallsService } from './poc-calls.service.js';

/** Voice POC routes: signed-in users, or POC_DEV_TOKEN for headless test scripts. */
@Controller('poc')
@AllowDevToken()
export class PocController {
  constructor(private readonly calls: PocCallsService) {}

  /** WebRTC signalling: device SDP offer in, provider SDP answer out (session config bound server-side). */
  @Post('connect')
  connect(@Req() req: AuthedRequest, @Body() body: unknown): Promise<PocConnectResponse> {
    return this.calls.connect(parseBody(PocConnectRequest, body), ownerOf(req));
  }

  /** Device's media is up — the AI may now speak first. */
  @Post('calls/:callId/ready')
  @HttpCode(204)
  ready(@Req() req: AuthedRequest, @Param('callId') callId: string): void {
    this.calls.markReady(callId, ownerOf(req));
  }

  @Post('calls/:callId/end')
  @HttpCode(200)
  end(@Req() req: AuthedRequest, @Param('callId') callId: string): Promise<PocTranscriptResponse> {
    return this.calls.end(callId, ownerOf(req));
  }

  @Get('calls/:callId/transcript')
  transcript(@Req() req: AuthedRequest, @Param('callId') callId: string): PocTranscriptResponse {
    return this.calls.transcript(callId, ownerOf(req));
  }
}

/** Calls belong to the signed-in user; headless dev-token scripts share one "dev" owner. */
function ownerOf(req: AuthedRequest): string {
  return req.auth?.user.id ?? 'dev';
}
