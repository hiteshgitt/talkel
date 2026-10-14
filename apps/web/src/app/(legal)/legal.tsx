import Link from 'next/link';
import { Brand } from '@/components/brand';
import type { ReactNode } from 'react';

/** Who runs Talkel and how to reach them; shared by every legal page. */
export const LEGAL = {
  operator: 'an individual developer',
  location: 'Pune, Maharashtra, India',
  courts: 'Pune, Maharashtra',
  email: 'talkel.app@gmail.com',
  updated: '14 October 2026',
} as const;

const PAGES = [
  { href: '/privacy', label: 'Privacy policy' },
  { href: '/terms', label: 'Terms of service' },
  { href: '/delete-account', label: 'Delete your account' },
] as const;

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:py-16">
      <Brand />
      <h1 className="mt-8 text-3xl font-bold text-fg sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated {LEGAL.updated}</p>
      <p className="mt-6 text-lg leading-relaxed text-fg">{intro}</p>
      <div className="mt-10 space-y-10">{children}</div>
      <nav className="mt-16 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-sm">
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href} className="text-muted hover:text-fg">
            {p.label}
          </Link>
        ))}
        <a href={`mailto:${LEGAL.email}`} className="text-muted hover:text-fg">
          {LEGAL.email}
        </a>
      </nav>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-fg">{title}</h2>
      <div className="space-y-3 leading-relaxed text-muted [&_a]:text-accent [&_a:hover]:underline [&_strong]:font-semibold [&_strong]:text-fg">
        {children}
      </div>
    </section>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5 marker:text-line">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export const Mail = () => <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;
