import {
  PocConnectResponse,
  PocTranscriptResponse,
  ProblemDetails,
  type PocConnectRequest,
} from '@speakai/contracts';
import type { z } from 'zod';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';
const DEV_TOKEN = process.env.EXPO_PUBLIC_POC_DEV_TOKEN ?? '';

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

export function apiConfigProblem(): string | null {
  if (!API_URL) return 'EXPO_PUBLIC_API_URL is not set (see apps/mobile/.env.example).';
  if (!DEV_TOKEN) return 'EXPO_PUBLIC_POC_DEV_TOKEN is not set (see apps/mobile/.env.example).';
  return null;
}

async function request<S extends z.ZodType>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown },
  schema: S | null,
): Promise<z.infer<S>> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${DEV_TOKEN}`,
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection.', 0, 'NETWORK');
  }

  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;
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

export const pocApi = {
  connect: (body: PocConnectRequest) => request('/poc/connect', { method: 'POST', body }, PocConnectResponse),
  ready: (callId: string) => request(`/poc/calls/${encodeURIComponent(callId)}/ready`, { method: 'POST' }, null),
  end: (callId: string) =>
    request(`/poc/calls/${encodeURIComponent(callId)}/end`, { method: 'POST' }, PocTranscriptResponse),
  transcript: (callId: string) =>
    request(`/poc/calls/${encodeURIComponent(callId)}/transcript`, { method: 'GET' }, PocTranscriptResponse),
};
