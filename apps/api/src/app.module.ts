import { Controller, type DynamicModule, Get, HttpStatus, Inject, Module } from '@nestjs/common';
import type { PrismaClient } from '@speakai/db';
import { AdminController } from './admin/admin.controller.js';
import { Public } from './auth/auth.decorators.js';
import { AuthModule } from './auth/auth.module.js';
import { ProblemException } from './common/problem.js';
import { ENV, type Env } from './config/env.js';
import { PRISMA, PrismaModule } from './db/prisma.module.js';
import { CatalogController } from './conversations/catalog.controller.js';
import { ConversationsController } from './conversations/conversations.controller.js';
import { ConversationsService } from './conversations/conversations.service.js';
import { QuotaService } from './conversations/quota.service.js';
import { AnalysisQueue, DbAnalysisQueue, RedisAnalysisQueue } from './analysis/analysis-queue.js';
import { ProgressController } from './analysis/progress.controller.js';
import { MissionsController } from './missions/missions.controller.js';
import { RephraseService } from './analysis/rephrase.service.js';
import { AnalysisService } from './analysis/analysis.service.js';
import { MemoryController } from './users/memory.controller.js';
import { ExportController } from './account/export.controller.js';
import { IceServers } from './rtc/ice-servers.js';
import { RtcController } from './rtc/rtc.controller.js';
import { LearningProfileService } from './analysis/learning-profile.service.js';
import { createRecordingStore, RECORDING_STORE } from './recording/recording-store.js';
import { UsersController } from './users/users.controller.js';
import { UsersService } from './users/users.service.js';

@Controller('health')
class HealthController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Public()
  @Get()
  async health(): Promise<{ status: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ProblemException(HttpStatus.SERVICE_UNAVAILABLE, 'DB_UNAVAILABLE', 'Database unavailable');
    }
    return { status: 'ok' };
  }
}

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        { module: ConfigModule, global: true, providers: [{ provide: ENV, useValue: env }], exports: [ENV] },
        PrismaModule,
        AuthModule,
      ],
      controllers: [HealthController, UsersController, AdminController, CatalogController, ConversationsController, ProgressController, MissionsController, MemoryController, ExportController, RtcController],
      providers: [
        UsersService,
        QuotaService,
        ConversationsService,
        {
          provide: AnalysisQueue,
          useFactory: (prisma: PrismaClient) => (env.QUEUE_DRIVER === 'postgres' ? new DbAnalysisQueue(prisma) : new RedisAnalysisQueue(env.REDIS_URL)),
          inject: [PRISMA],
        },
        LearningProfileService,
        AnalysisService,
        RephraseService,
        IceServers,
        { provide: RECORDING_STORE, useFactory: () => createRecordingStore(env) },
      ],
    };
  }
}

@Module({})
class ConfigModule {}
