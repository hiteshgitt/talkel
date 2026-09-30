import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@speakai/db';
import { ENV, type Env } from '../config/env.js';

export const PRISMA = Symbol('PRISMA');

@Injectable()
class PrismaLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async onApplicationShutdown(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

@Global()
@Module({
  providers: [
    { provide: PRISMA, useFactory: (env: Env) => createPrismaClient(env.DATABASE_URL), inject: [ENV] },
    PrismaLifecycle,
  ],
  exports: [PRISMA],
})
export class PrismaModule {}
