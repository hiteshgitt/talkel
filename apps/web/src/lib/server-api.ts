import 'server-only';

import { Me } from '@speakai/contracts';
import { cookies } from 'next/headers';
import { z } from 'zod';

const API = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4810';

/** Calls the API from the Next.js server on behalf of the visitor (forwards their cookies). */
async function apiGet(path: string): Promise<Response> {
  const cookieHeader = (await cookies()).toString();
  return fetch(`${API}/v1${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    cache: 'no-store',
  });
}

/** The signed-in user, or null when there is no valid session. */
export async function getMe(): Promise<Me | null> {
  const res = await apiGet('/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /me failed (${res.status})`);
  return Me.parse(await res.json());
}

export const AdminStats = z.object({
  users: z.number(),
  verifiedUsers: z.number(),
  onboardedUsers: z.number(),
  signupsLast7Days: z.number(),
});
export type AdminStats = z.infer<typeof AdminStats>;

/** Admin-only aggregates; null if the visitor isn't an admin (the API enforces the role). */
export async function getAdminStats(): Promise<AdminStats | null> {
  const res = await apiGet('/admin/stats');
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`GET /admin/stats failed (${res.status})`);
  return AdminStats.parse(await res.json());
}
