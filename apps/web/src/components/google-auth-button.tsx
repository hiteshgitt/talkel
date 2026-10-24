'use client';

import { useState, useSyncExternalStore } from 'react';
import { authClient } from '@/lib/auth-client';

let googleEnabled: boolean | null = null;
let request: Promise<void> | null = null;
const listeners = new Set<() => void>();

function loadGoogleFlag() {
  if (request) return;
  request = fetch('/v1/auth-config')
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { google?: boolean } | null) => {
      googleEnabled = Boolean(data?.google);
    })
    .catch(() => {
      googleEnabled = false;
    })
    .then(() => {
      listeners.forEach((listener) => listener());
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  loadGoogleFlag();
  return () => listeners.delete(listener);
}

/** Shown only when the API has Google sign-in configured. Creates an account on first use. */
export function GoogleAuthButton({ callbackURL = '/dashboard' }: { callbackURL?: string }) {
  const show = useSyncExternalStore(subscribe, () => googleEnabled === true, () => false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!show) return null;

  async function start() {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: `${window.location.origin}${callbackURL}`,
    });
    setBusy(false);
    if (err) setError(err.message ?? 'Google sign-in failed');
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-full border border-line bg-surface px-5 py-3.5 font-semibold text-fg transition hover:border-accent disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
          <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.5z" />
          <path fill="#34A853" d="M12 24c3.2 0 5.9-1 7.9-2.8l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.2-6.9-5.1H1.3v3A12 12 0 0 0 12 24z" />
          <path fill="#FBBC05" d="M5.1 14.4A7.2 7.2 0 0 1 4.7 12c0-.8.1-1.7.4-2.4V6.6H1.3A12 12 0 0 0 0 12c0 1.9.5 3.8 1.3 5.4l3.8-3z" />
          <path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4C17.9 1.1 15.2 0 12 0 7.3 0 3.2 2.7 1.3 6.6l3.8 3C6.1 7 8.8 4.8 12 4.8z" />
        </svg>
        {busy ? 'Please wait…' : 'Continue with Google'}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
