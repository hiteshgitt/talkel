import { timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ProblemException } from '../common/problem.js';
import { ENV, type Env } from '../config/env.js';

/** Milestone 0 only: a static bearer token stands in for real auth (Better Auth arrives in M1). */
@Injectable()
export class DevTokenGuard implements CanActivate {
  private readonly expected: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.expected = Buffer.from(env.POC_DEV_TOKEN);
  }

  canActivate(ctx: ExecutionContext): boolean {
    const header = ctx.switchToHttp().getRequest<Request>().headers.authorization ?? '';
    const token = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
    if (token.length === this.expected.length && timingSafeEqual(token, this.expected)) return true;
    throw new ProblemException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Missing or invalid token');
  }
}
