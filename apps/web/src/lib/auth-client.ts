'use client';

import { createAuthClient } from 'better-auth/react';

/** Same-origin: /v1/auth/* is forwarded to the API by next.config.ts rewrites. */
export const authClient = createAuthClient({
  baseURL: typeof window === 'undefined' ? process.env.NEXT_PUBLIC_WEB_URL : window.location.origin,
  basePath: '/v1/auth',
});
