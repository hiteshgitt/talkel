import { notFound, redirect } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/ui';
import { getAdminStats, getMe } from '@/lib/server-api';

/** Admin overview. The API enforces the admin role; non-admins get a 404 here. */
export default async function AdminPage() {
  const me = await getMe();
  if (!me) redirect('/sign-in');
  if (me.user.role !== 'admin') notFound();

  const stats = await getAdminStats();
  if (!stats) notFound();

  const tiles = [
    { label: 'Users', value: stats.users },
    { label: 'Verified email', value: stats.verifiedUsers },
    { label: 'Finished onboarding', value: stats.onboardedUsers },
    { label: 'New in last 7 days', value: stats.signupsLast7Days },
  ];

  return (
    <>
      <AppHeader me={me} />
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
        <h1 className="text-3xl font-bold">Admin</h1>
        <div className="grid gap-4 sm:grid-cols-4">
          {tiles.map((t) => (
            <Card key={t.label}>
              <p className="text-sm text-muted">{t.label}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{t.value}</p>
            </Card>
          ))}
        </div>
        <Card>
          <h2 className="font-semibold">Coming next</h2>
          <p className="mt-1 text-sm text-muted">Scenario, persona and prompt management, usage and cost reports (Milestones 2–4).</p>
        </Card>
      </main>
    </>
  );
}
