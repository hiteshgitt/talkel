import { expo } from '@better-auth/expo';
import type { PrismaClient } from '@speakai/db';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { Env } from '../config/env.js';
import { purgeUserFiles } from '../account/account-cleanup.js';
import { createRecordingStore } from '../recording/recording-store.js';
import { accountDeletedEmail, type Mailer, resetPasswordEmail, verificationEmail } from '../mail/mailer.js';

export const AUTH_BASE_PATH = '/v1/auth';
/** Internal header carrying the real client IP to Better Auth (rate limits, session metadata). */
export const CLIENT_IP_HEADER = 'x-speakai-client-ip';

export interface AuthDeps {
  env: Env;
  prisma: PrismaClient;
  mailer: Mailer;
}

/**
 * Better Auth instance. Sessions live in our Postgres (no third-party identity store).
 * Web uses httpOnly cookies (via the Next.js same-origin proxy); the Expo app stores the session
 * cookie in SecureStore and sends it as a Cookie header (expo plugin).
 */
export function createAuth({ env, prisma, mailer }: AuthDeps) {
  const google =
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
      : {};

  return betterAuth({
    appName: 'Talkel',
    baseURL: env.APP_BASE_URL,
    basePath: AUTH_BASE_PATH,
    secret: env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    // Extra web origins, e.g. a staging tunnel next to the LAN address.
    trustedOrigins: [env.WEB_BASE_URL, ...env.EXTRA_TRUSTED_ORIGINS, `${env.MOBILE_SCHEME}://`],

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send(resetPasswordEmail(user.email, user.name, url));
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send(verificationEmail(user.email, user.name, url));
      },
    },
    socialProviders: google,

    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'user', input: false },
      },
      // DPDP: users can delete their account themselves (password, or a recent sign-in for Google accounts).
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await purgeUserFiles(prisma, { recordings: createRecordingStore(env), callLogDir: env.CALL_LOG_DIR }, user.id);
        },
        afterDelete: async (user) => {
          await mailer.send(accountDeletedEmail(user.email, user.name, env.WEB_BASE_URL));
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // refresh expiry at most daily
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 10 },
        '/sign-up/email': { window: 3600, max: 10 },
        '/request-password-reset': { window: 3600, max: 5 },
        '/send-verification-email': { window: 3600, max: 5 },
        '/delete-user': { window: 3600, max: 5 },
      },
    },
    advanced: {
      database: { generateId: 'uuid' },
      // Set by our own server from the socket / trusted proxy (see main.ts), never taken from the client.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    databaseHooks: {
      user: {
        create: {
          // Every user gets a profile and settings row from the start.
          after: async (user) => {
            await prisma.$transaction([
              prisma.profile.create({ data: { userId: user.id, displayName: user.name || null } }),
              prisma.userSettings.create({ data: { userId: user.id } }),
              ...(env.LIFETIME_PRO_EMAILS.includes(user.email.toLowerCase())
                ? [prisma.user.update({ where: { id: user.id }, data: { plan: 'PRO' } })]
                : []),
            ]);
          },
        },
      },
    },
    plugins: [expo()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
