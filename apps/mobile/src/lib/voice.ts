import type { Me, VoiceChoice } from '@speakai/contracts';

export const PERSONAS: Record<VoiceChoice, { name: string; label: string }> = {
  female: { name: 'Maya', label: 'Female voice' },
  male: { name: 'Rohan', label: 'Male voice' },
};

/** The user's preferred voice from settings, defaulting to female. */
export function preferredVoice(me: Me | undefined): VoiceChoice {
  return me?.settings.preferredVoiceGender === 'MALE' ? 'male' : 'female';
}
