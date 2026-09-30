import type { Me, SettingsPatch } from '@speakai/contracts';
import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't hammer the server when signed out or when the error won't fix itself.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export const ME_KEY = ['me'] as const;
export const QUOTA_KEY = ['quota'] as const;
export const CONVERSATIONS_KEY = ['conversations'] as const;
/** The just-created conversation (brief, partner), handed from setup to the brief screen. */
export const createdConversationKey = (id: string) => ['created-conversation', id] as const;
export const conversationKey = (id: string) => ['conversation', id] as const;

export function useMe(enabled = true) {
  return useQuery({ queryKey: ME_KEY, queryFn: api.me, enabled });
}

/** Scenarios and personas change rarely: cache for 10 minutes. */
export function useCatalog() {
  return useQuery({ queryKey: ['catalog'], queryFn: api.catalog, staleTime: 10 * 60_000 });
}

export function useQuota() {
  return useQuery({ queryKey: QUOTA_KEY, queryFn: api.quota });
}

export function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} sec`;
  return s === 0 ? `${m} min` : `${m} min ${s} sec`;
}

/** Updates settings and writes the server's response straight into the cache. */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api.updateSettings(patch),
    onSuccess: (me: Me) => qc.setQueryData(ME_KEY, me),
  });
}
