import { Controller, Get, type DynamicModule, Module } from '@nestjs/common';
import { ENV, type Env } from './config/env.js';
import { DevTokenGuard } from './poc/dev-token.guard.js';
import { PocController } from './poc/poc.controller.js';
import { PocCallsService } from './poc/poc-calls.service.js';

@Controller('health')
class HealthController {
  @Get()
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, PocController],
      providers: [{ provide: ENV, useValue: env }, PocCallsService, DevTokenGuard],
    };
  }
}
