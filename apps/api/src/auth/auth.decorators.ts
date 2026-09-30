import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthSession } from './auth.js';

export const IS_PUBLIC = Symbol('IS_PUBLIC');
export const ALLOW_DEV_TOKEN = Symbol('ALLOW_DEV_TOKEN');
export const ROLES = Symbol('ROLES');

/** Route needs no session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route also accepts POC_DEV_TOKEN (headless test scripts), when that env var is set. */
export const AllowDevToken = () => SetMetadata(ALLOW_DEV_TOKEN, true);

/** Route requires one of these roles, e.g. @Roles('admin'). */
export const Roles = (...roles: Array<'user' | 'admin'>) => SetMetadata(ROLES, roles);

export type AuthedRequest = Request & { auth?: AuthSession; devToken?: boolean };

/** The signed-in user. Only use on routes that are not @Public(). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.auth?.user;
});

export type SessionUser = AuthSession['user'];
