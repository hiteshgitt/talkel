import { timingSafeEqual } from 'node:crypto';
import { type CanActivate, type ExecutionContext, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { fromNodeHeaders } from 'better-auth/node';
import { ProblemException } from '../common/problem.js';
import { ENV, type Env } from '../config/env.js';
import { ALLOW_DEV_TOKEN, type AuthedRequest, IS_PUBLIC, ROLES } from './auth.decorators.js';
import type { Auth } from './auth.js';

export const AUTH = Symbol('AUTH');

/**
 * Global guard: every route requires a valid Better Auth session unless marked @Public().
 * Secure by default — a forgotten decorator fails closed, not open.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly devToken: Buffer | null;

  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(ENV) env: Env,
  ) {
    this.devToken = env.POC_DEV_TOKEN ? Buffer.from(env.POC_DEV_TOKEN) : null;
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<AuthedRequest>();

    if (this.reflector.getAllAndOverride<boolean>(ALLOW_DEV_TOKEN, targets) && this.matchesDevToken(req)) {
      req.devToken = true;
      return true;
    }

    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) {
      throw new ProblemException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Please sign in');
    }
    req.auth = session;

    const roles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES, targets);
    if (roles && !roles.includes((session.user as { role?: string }).role ?? 'user')) {
      throw new ProblemException(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'You do not have access to this');
    }
    return true;
  }

  private matchesDevToken(req: AuthedRequest): boolean {
    if (!this.devToken) return false;
    const header = req.headers.authorization ?? '';
    const token = Buffer.from(header.startsWith('Bearer ') ? header.slice(7) : '');
    return token.length === this.devToken.length && timingSafeEqual(token, this.devToken);
  }
}
