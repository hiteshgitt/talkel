import { MISSION_LEVELS, type MissionGroup, type MissionSkill } from '@speakai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from './api';
import { createdConversationKey } from './queries';
import type { IconName } from './visuals';

export const MISSIONS_KEY = ['missions'] as const;

export function useMissions() {
  return useQuery({ queryKey: MISSIONS_KEY, queryFn: api.missions });
}

export const LEVEL_HINT: Record<number, string> = {
  1: 'Patient and cooperative',
  2: 'Like a typical real person',
  3: 'Probing follow-up questions',
  4: 'Sceptical — pushes back hard',
  5: 'Tough and unpredictable',
};

export const levelName = (level: number) => MISSION_LEVELS[level - 1]?.name ?? `Level ${level}`;

export const GROUP: Record<MissionGroup, { title: string; subtitle: string; icon: IconName }> = {
  career: { title: 'Career', subtitle: 'Interviews, reviews and the moments that shape your work life', icon: 'briefcase-outline' },
  everyday: { title: 'Everyday life', subtitle: 'Get what you need, politely and firmly', icon: 'home-outline' },
  challenge: { title: 'Challenge', subtitle: 'Difficult people. Stay calm and win them over', icon: 'flame-outline' },
};

export const SKILL: Record<MissionSkill, { label: string; icon: IconName }> = {
  persuasion: { label: 'Persuasion', icon: 'megaphone-outline' },
  assertiveness: { label: 'Assertiveness', icon: 'shield-outline' },
  professionalism: { label: 'Professionalism', icon: 'ribbon-outline' },
  empathy: { label: 'Empathy', icon: 'heart-outline' },
  structure: { label: 'Structure', icon: 'git-network-outline' },
  composure: { label: 'Composure', icon: 'leaf-outline' },
  politeness: { label: 'Politeness', icon: 'hand-left-outline' },
};

/** Creates a mission attempt at a level and opens its brief. */
export function useStartMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ missionId, level }: { missionId: string; level: number }) =>
      api.createConversation({ scenarioId: missionId, missionLevel: level, voice: 'RANDOM' }),
    onSuccess: (created) => {
      qc.setQueryData(createdConversationKey(created.id), created);
      router.push({ pathname: '/brief/[id]', params: { id: created.id } });
    },
  });
}
