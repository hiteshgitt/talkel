import {
  Me,
  type OnboardingRequest,
  PocConnectResponse,
  PocTranscriptResponse,
  ProblemDetails,
  type PocConnectRequest,
  type ProfilePatch,
  type SettingsPatch,
} from '@speakai/contracts';
import type { z } from 'zod';
import { authClient } from './auth-client';
import { API_URL } from './config';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** Calls our API with the signed-in user's session cookie and validates the response. */
async function request<S extends z.ZodType>(
  path: string,
  init: { method: Method; body?: unknown },
  schema: S | null,
): Promise<z.infer<S>> {
  const cookie = await authClient.getCookie();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method,
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      credentials: 'omit', // the cookie is sent explicitly above
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0, 'NETWORK');
  }

  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON error page
  }
  if (!res.ok) {
    const problem = ProblemDetails.safeParse(json);
    throw new ApiError(
      problem.success ? problem.data.title : `Request failed (${res.status})`,
      res.status,
      problem.success ? problem.data.code : 'UNKNOWN',
    );
  }
  return schema ? schema.parse(json) : (undefined as z.infer<S>);
}

export const api = {
  me: () => request('/me', { method: 'GET' }, Me),
  completeOnboarding: (body: OnboardingRequest) => request('/me/onboarding', { method: 'POST', body }, Me),
  updateProfile: (body: ProfilePatch) => request('/me/profile', { method: 'PATCH', body }, Me),
  updateSettings: (body: SettingsPatch) => request('/me/settings', { method: 'PATCH', body }, Me),
};

export const pocApi = {
  connect: (body: PocConnectRequest) => request('/poc/connect', { method: 'POST', body }, PocConnectResponse),
  ready: (callId: string) => request(`/poc/calls/${encodeURIComponent(callId)}/ready`, { method: 'POST' }, null),
  end: (callId: string) =>
    request(`/poc/calls/${encodeURIComponent(callId)}/end`, { method: 'POST' }, PocTranscriptResponse),
  transcript: (callId: string) =>
    request(`/poc/calls/${encodeURIComponent(callId)}/transcript`, { method: 'GET' }, PocTranscriptResponse),
};
