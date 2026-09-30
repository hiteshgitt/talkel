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
      controllers: [HealthController, UsersController, AdminController, CatalogController, ConversationsController],
      providers: [UsersService, QuotaService, ConversationsService],
    };
  }
}

@Module({})
class ConfigModule {}
