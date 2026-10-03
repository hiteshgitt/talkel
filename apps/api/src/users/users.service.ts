import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  CONSENT_VERSION,
  EnglishLevel,
  FeedbackLanguage,
  LearningGoal,
  type Me,
  Plan,
  type OnboardingRequest,
  type ProfilePatch,
  type SettingsPatch,
  UserRole,
  VoiceGender,
} from '@speakai/contracts';
import type { PrismaClient, Profile, User, UserSettings } from '@speakai/db';
import { PRISMA } from '../db/prisma.module.js';
import { ENV, type Env } from '../config/env.js';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Lifetime Pro accounts stay Pro whatever else changes their plan. */
  async onModuleInit(): Promise<void> {
    if (!this.env.LIFETIME_PRO_EMAILS.length) return;
    await this.prisma.user.updateMany({ where: { email: { in: this.env.LIFETIME_PRO_EMAILS }, plan: { not: 'PRO' } }, data: { plan: 'PRO' } });
  }

  async me(userId: string): Promise<Me> {
    const [{ user, profile, settings }, passwords] = await Promise.all([
      this.load(userId),
      this.prisma.account.count({ where: { userId, providerId: 'credential' } }),
    ]);
    return toMe(user, profile, settings, passwords > 0);
  }

  async completeOnboarding(userId: string, req: OnboardingRequest): Promise<Me> {
    const now = new Date();
    await this.ensureRows(userId);
    await this.prisma.$transaction([
      this.prisma.profile.update({
        where: { userId },
        data: {
          ...(req.displayName ? { displayName: req.displayName } : {}),
          ...(req.nativeLanguage ? { nativeLanguage: req.nativeLanguage } : {}),
          selfReportedLevel: req.level,
          goals: req.goals,
          consentVersion: req.consentVersion,
          consentedAt: now,
          onboardedAt: now,
        },
      }),
      this.prisma.userSettings.update({
        where: { userId },
        data: { feedbackLanguage: req.feedbackLanguage, defaultDifficulty: req.level },
      }),
    ]);
    return this.me(userId);
  }

  /** Accepting an updated privacy notice without redoing onboarding. */
  async acceptConsent(userId: string, consentVersion: string): Promise<Me> {
    await this.ensureRows(userId);
    await this.prisma.profile.update({ where: { userId }, data: { consentVersion, consentedAt: new Date() } });
    return this.me(userId);
  }

  async updateProfile(userId: string, patch: ProfilePatch): Promise<Me> {
    await this.ensureRows(userId);
    await this.prisma.profile.update({ where: { userId }, data: patch });
    return this.me(userId);
  }

  async updateSettings(userId: string, patch: SettingsPatch): Promise<Me> {
    await this.ensureRows(userId);
    const { memoryEnabled, ...rest } = patch;
    await this.prisma.$transaction([
      this.prisma.userSettings.update({
        where: { userId },
        data: {
          ...rest,
          // Turning memory on records when the user agreed; turning it off forgets everything.
          ...(memoryEnabled === true ? { memoryEnabled: true, memoryConsentAt: new Date() } : {}),
          ...(memoryEnabled === false ? { memoryEnabled: false, memoryConsentAt: null } : {}),
        },
      }),
      ...(memoryEnabled === false ? [this.prisma.userMemory.deleteMany({ where: { userId } })] : []),
    ]);
    return this.me(userId);
  }

  /** Rows are created by the auth hook at sign-up; this is a safety net for older/partial accounts. */
  private async ensureRows(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.profile.upsert({ where: { userId }, create: { userId }, update: {} }),
      this.prisma.userSettings.upsert({ where: { userId }, create: { userId }, update: {} }),
    ]);
  }

  private async load(userId: string): Promise<{ user: User; profile: Profile; settings: UserSettings }> {
    await this.ensureRows(userId);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true, settings: true },
    });
    return { user, profile: user.profile!, settings: user.settings! };
  }
}

function toMe(user: User, profile: Profile, settings: UserSettings, hasPassword: boolean): Me {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      role: UserRole.catch('user').parse(user.role),
      plan: Plan.catch('FREE').parse(user.plan),
      hasPassword,
    },
    entitlements: entitlementsFor(user.plan),
    profile: {
      displayName: profile.displayName,
      nativeLanguage: profile.nativeLanguage,
      selfReportedLevel: profile.selfReportedLevel ? EnglishLevel.parse(profile.selfReportedLevel) : null,
      // Stored as text[]; drop anything no longer in the contract instead of failing the request.
      goals: profile.goals.filter((g): g is LearningGoal => LearningGoal.safeParse(g).success),
      timezone: profile.timezone,
      onboardedAt: profile.onboardedAt?.toISOString() ?? null,
      consentVersion: profile.consentVersion,
    },
    settings: {
      feedbackLanguage: FeedbackLanguage.catch('en').parse(settings.feedbackLanguage),
      liveCorrection: settings.liveCorrection,
      defaultDifficulty: EnglishLevel.parse(settings.defaultDifficulty),
      defaultDurationSec: settings.defaultDurationSec,
      preferredVoiceGender: settings.preferredVoiceGender ? VoiceGender.parse(settings.preferredVoiceGender) : null,
      notificationsEnabled: settings.notificationsEnabled,
      memoryEnabled: settings.memoryEnabled,
    },
    onboarded: profile.onboardedAt !== null,
    consentRequired: profile.consentVersion !== CONSENT_VERSION,
  };
}

/** Free plan: the partner's voice and accent are picked at random. Pro: the user chooses. */
export function entitlementsFor(plan: string): Me['entitlements'] {
  const pro = plan === 'PRO';
  return { choosePartner: pro, chooseAccent: pro };
}
