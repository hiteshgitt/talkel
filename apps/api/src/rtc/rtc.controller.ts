import { Controller, Get } from '@nestjs/common';
import { AllowDevToken } from '../auth/auth.decorators.js';
import { IceServers, type IceServer } from './ice-servers.js';

/** What the phone needs before it creates its WebRTC offer (TURN credentials are short-lived). */
@Controller('rtc')
@AllowDevToken()
export class RtcController {
  constructor(private readonly ice: IceServers) {}

  @Get('ice-servers')
  async iceServers(): Promise<{ iceServers: IceServer[] }> {
    return { iceServers: await this.ice.forClient() };
  }
}
