import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Landing } from '@/components/landing';
import { getMe } from '@/lib/server-api';

export const metadata: Metadata = {
  title: 'Talkel — Practise real English conversations with AI',
  description:
    'A real phone call with an AI partner: rehearse job interviews, salary talks and everyday conversations, then get feedback on exactly what to fix. 10 free minutes a day.',
  openGraph: {
    title: 'Talkel — Practise real English conversations with AI',
    description: 'Rehearse the English conversation you’re scared of — before it’s real. 10 free minutes a day.',
    type: 'website',
  },
};

/** Signed-in visitors go to their dashboard; everyone else sees what Talkel is. */
export default async function Home() {
  // The marketing page must stay up even if the API is down, so a failed check means "signed out".
  const me = await getMe().catch(() => null);
  if (me) redirect('/dashboard');
  return <Landing />;
}
