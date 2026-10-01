import { Controller, Get, Global, Inject, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { PrismaClient } from '@speakai/db';
import type { AuthConfig } from '@speakai/contracts';
import { ENV, type Env } from '../config/env.js';
import { PRISMA } from '../db/prisma.module.js';
import { LogMailer, MAILER, type Mailer, ResendMailer, SmtpMailer } from '../mail/mailer.js';
import { Public } from './auth.decorators.js';
import { createAuth } from './auth.js';
import { AUTH, SessionGuard } from './session.guard.js';

@Controller('auth-config')
class AuthConfigController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Lets clients show only the sign-in methods this server has enabled. */
  @Public()
  @Get()
  config(): AuthConfig {
    return { emailPassword: true, google: Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET) };
  }
}

@Global()
@Module({
  controllers: [AuthConfigController],
  providers: [
    {
      provide: MAILER,
      // Development: SMTP (Mailpit). Production: Resend. Neither: log the email (tests).
      useFactory: (env: Env): Mailer =>
        env.SMTP_URL
          ? new SmtpMailer(env.SMTP_URL, env.EMAIL_FROM)
          : env.RESEND_API_KEY
            ? new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM)
            : new LogMailer(),
      inject: [ENV],
    },
    {
      provide: AUTH,
      useFactory: (env: Env, prisma: PrismaClient, mailer: Mailer) => createAuth({ env, prisma, mailer }),
      inject: [ENV, PRISMA, MAILER],
    },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [AUTH, MAILER],
})
export class AuthModule {}
