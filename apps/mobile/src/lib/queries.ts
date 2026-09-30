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

export function useMe(enabled = true) {
  return useQuery({ queryKey: ME_KEY, queryFn: api.me, enabled });
}

/** Updates settings and writes the server's response straight into the cache. */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api.updateSettings(patch),
    onSuccess: (me: Me) => qc.setQueryData(ME_KEY, me),
  });
}
