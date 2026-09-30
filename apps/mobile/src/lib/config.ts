/** EXPO_PUBLIC_* values are inlined at build/bundle time (see apps/mobile/.env.example). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

/** Origin without the /v1 prefix, e.g. http://192.168.1.40:4810 — what the auth client needs. */
export const API_ORIGIN = API_URL.replace(/\/v1$/, '');

export function configProblem(): string | null {
  if (!API_URL) return 'EXPO_PUBLIC_API_URL is not set (see apps/mobile/.env.example).';
  return null;
}

/** Web app origin, for pages the phone opens in a browser (e.g. choosing a new password). */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? '').replace(/\/+$/, '');
