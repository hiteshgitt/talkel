import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { api } from './api';
import { haptic } from './haptics';

/**
 * "Try that answer again": starts a short replay call of one of the user's lines and goes straight
 * to the call (the user already knows the situation).
 */
export function useStartReplay(conversationId: string) {
  return useMutation({
    mutationFn: (turnSeq: number) => api.replay(conversationId, turnSeq),
    onSuccess: (created) => {
      haptic.press();
      router.push({
        pathname: '/call',
        params: { conversationId: created.id, personaName: created.persona.name, personaSlug: created.persona.slug, title: created.brief.title },
      });
    },
  });
}
