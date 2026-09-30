import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { type Me, OnboardingRequest, ProfilePatch, SettingsPatch } from '@speakai/contracts';
import { CurrentUser, type SessionUser } from '../auth/auth.decorators.js';
import { parseBody } from '../common/problem.js';
import { UsersService } from './users.service.js';

/** The signed-in user's own account. Every query is scoped to the session's user id. */
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: SessionUser): Promise<Me> {
    return this.users.me(user.id);
  }

  @Post('onboarding')
  @HttpCode(200)
  onboarding(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<Me> {
    return this.users.completeOnboarding(user.id, parseBody(OnboardingRequest, body));
  }

  @Patch('profile')
  profile(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<Me> {
    return this.users.updateProfile(user.id, parseBody(ProfilePatch, body));
  }

  @Patch('settings')
  settings(@CurrentUser() user: SessionUser, @Body() body: unknown): Promise<Me> {
    return this.users.updateSettings(user.id, parseBody(SettingsPatch, body));
  }
}
