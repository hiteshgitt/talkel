'use client';

import { useSyncExternalStore } from 'react';

type Theme = 'dark' | 'light';

function subscribe(onStoreChange: () => void) {
  window.addEventListener('talkel-theme', onStoreChange);
  return () => window.removeEventListener('talkel-theme', onStoreChange);
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => 'dark' as Theme);
  const light = theme === 'light';

  function toggle() {
    const next: Theme = light ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('talkel-theme', next);
    window.dispatchEvent(new Event('talkel-theme'));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={light}
      aria-label={light ? 'Switch to dark' : 'Switch to light'}
      className="grid h-9 w-9 place-items-center rounded-full border border-line text-fg transition hover:bg-raised"
    >
      {light ? (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M19 5l-1.6 1.6M6.6 17.4 5 19" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
