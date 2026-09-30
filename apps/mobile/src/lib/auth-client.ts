import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';
import { API_ORIGIN } from './config';

/**
 * Better Auth client. The session cookie is kept in SecureStore (Android Keystore-backed) and
 * attached to API calls by `authedFetch` in ./api.
 */
export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  basePath: '/v1/auth',
  plugins: [
    expoClient({
      scheme: 'speakai',
      storagePrefix: 'speakai',
      storage: SecureStore,
    }),
  ],
});

/** Where the email-verification link sends the user after verifying: back into the app. */
export const VERIFIED_CALLBACK_URL = 'speakai://sign-in?verified=1';
