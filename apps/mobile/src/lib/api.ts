import {
  Catalog,
  type ConnectRequest,
  ConnectResponse,
  ConversationDetail,
  ConversationList,
  type CreateConversationRequest,
  CreateConversationResponse,
  Me,
  MissionList,
  MistakeList,
  type OnboardingRequest,
  Progress,
  ProblemDetails,
  type ProfilePatch,
  Quota,
  type SettingsPatch,
} from '@speakai/contracts';
import { z } from 'zod';
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

const conv = (id: string) => `/conversations/${encodeURIComponent(id)}`;

export const api = {
  me: () => request('/me', { method: 'GET' }, Me),
  completeOnboarding: (body: OnboardingRequest) => request('/me/onboarding', { method: 'POST', body }, Me),
  updateProfile: (body: ProfilePatch) => request('/me/profile', { method: 'PATCH', body }, Me),
  updateSettings: (body: SettingsPatch) => request('/me/settings', { method: 'PATCH', body }, Me),

  catalog: () => request('/catalog', { method: 'GET' }, Catalog),
  quota: () => request('/quota', { method: 'GET' }, Quota),
  progress: () => request('/progress', { method: 'GET' }, Progress),
  missions: () => request('/missions', { method: 'GET' }, MissionList),
  mistakes: (category: string) => request(`/progress/mistakes/${encodeURIComponent(category)}`, { method: 'GET' }, MistakeList),

  createConversation: (body: CreateConversationRequest) =>
    request('/conversations', { method: 'POST', body }, CreateConversationResponse),
  conversations: (cursor?: string) =>
    request(`/conversations${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { method: 'GET' }, ConversationList),
  conversation: (id: string) => request(conv(id), { method: 'GET' }, ConversationDetail),
  deleteConversation: (id: string) => request(conv(id), { method: 'DELETE' }, null),

  connect: (id: string, body: ConnectRequest) => request(`${conv(id)}/connect`, { method: 'POST', body }, ConnectResponse),
  ready: (id: string) => request(`${conv(id)}/ready`, { method: 'POST' }, null),
  end: (id: string) => request(`${conv(id)}/end`, { method: 'POST' }, ConversationDetail),

  acceptConsent: (consentVersion: string) => request('/me/consent', { method: 'POST', body: { consentVersion } }, Me),
  setRecording: (id: string, on: boolean) => request(`${conv(id)}/recording`, { method: 'POST', body: { on } }, RecordingToggle),
  deleteRecording: (id: string) => request(`${conv(id)}/recording`, { method: 'DELETE' }, null),
  retryFeedback: (id: string) => request(`${conv(id)}/feedback/retry`, { method: 'POST' }, null),
  /** Streamed by the audio player with the session cookie as a header. */
  recordingUrl: (id: string) => `${API_URL}${conv(id)}/recording`,
};

const RecordingToggle = z.object({ recording: z.boolean() });

/** Friendly text for the API's error codes that users can hit in normal use. */
export function friendlyError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'QUOTA_EXCEEDED') return 'You’ve used today’s free practice time. It resets at midnight.';
    if (err.code === 'ACTIVE_CONVERSATION_EXISTS') return 'You already have a conversation in progress.';
    if (err.code === 'SESSION_NOT_CONNECTABLE') return 'This conversation expired. Please start a new one.';
    if (err.code === 'CONSENT_REQUIRED') return 'Please accept the updated privacy notice (Profile) to record calls.';
    if (err.code === 'PROVIDER_QUOTA_EXHAUSTED' || err.code === 'PROVIDER_UNAVAILABLE') return 'The AI voice service is busy. Please try again in a moment.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}
