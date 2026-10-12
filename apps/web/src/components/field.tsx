'use client';

import { type InputHTMLAttributes, useState } from 'react';

/** Labelled input. Password inputs get a show/hide toggle. */
export function Field({ label, type, ...input }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-muted">{label}</span>
      <span className="relative block">
        <input
          className={`w-full rounded-xl border border-line bg-surface px-3.5 py-3 text-fg outline-none placeholder:text-muted focus:border-accent ${isPassword ? 'pr-12' : ''}`}
          type={isPassword && revealed ? 'text' : type}
          {...input}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted hover:text-fg"
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        ) : null}
      </span>
    </label>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.9 4.2A10.4 10.4 0 0 1 12 4c6.5 0 10 8 10 8a17.6 17.6 0 0 1-2.7 3.8M6.6 6.6C3.8 8.4 2 12 2 12s3.5 8 10 8a10 10 0 0 0 5.4-1.6" />
      <path d="M14.1 14.1a3 3 0 0 1-4.2-4.2" />
      <path d="M2 2l20 20" />
    </svg>
  );
}
