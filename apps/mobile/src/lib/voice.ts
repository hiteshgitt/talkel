import type { Me } from '@speakai/contracts';

/** Default conversation partner from the user's preferred voice (Profile tab). */
export function preferredPersonaSlug(me: Me | undefined): string {
  return me?.settings.preferredVoiceGender === 'MALE' ? 'rohan' : 'maya';
}
