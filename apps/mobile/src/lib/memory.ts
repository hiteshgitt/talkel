import type { MemoryKind } from '@speakai/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { IconName } from './visuals';

export const MEMORIES_KEY = ['memories'] as const;

export function useMemories(enabled = true) {
  return useQuery({ queryKey: MEMORIES_KEY, queryFn: api.memories, enabled });
}

export const MEMORY_KIND: Record<MemoryKind, { label: string; icon: IconName }> = {
  WORK: { label: 'Work & studies', icon: 'briefcase-outline' },
  ABOUT: { label: 'About you', icon: 'person-outline' },
  INTERESTS: { label: 'Interests', icon: 'heart-outline' },
  UPCOMING: { label: 'Coming up', icon: 'calendar-outline' },
  GOALS: { label: 'Goals', icon: 'flag-outline' },
};

/** What memory does and doesn't do, shown before turning it on and on the memory screen. */
export const MEMORY_EXPLAINER = [
  { icon: 'chatbubbles-outline' as IconName, text: 'In everyday chats and practice interviews, your partner remembers what you’ve shared — like a friend would.' },
  { icon: 'list-outline' as IconName, text: 'Only things you say about yourself: work or studies, city, interests, upcoming events and goals.' },
  { icon: 'shield-checkmark-outline' as IconName, text: 'Never health, religion, caste, politics, money details, IDs, addresses or phone numbers. Nothing from missions or role-plays.' },
  { icon: 'trash-outline' as IconName, text: 'See and delete anything, any time. Turning memory off deletes everything.' },
];
