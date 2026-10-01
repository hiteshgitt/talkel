import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/ui';
import { getMe } from '@/lib/server-api';
import { AccountActions } from './account-actions';

export const metadata = { title: 'Your account — Talkel' };

/** DPDP: download everything we store, or delete the account. */
export default async function AccountPage() {
  const me = await getMe();
  if (!me) redirect('/sign-in?next=/account');

  return (
    <>
      <AppHeader me={me} />
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Your account</h1>
          <p className="text-muted">{me.user.email}</p>
        </div>
        <Card>
          <AccountActions hasPassword={me.user.hasPassword} />
        </Card>
      </main>
    </>
  );
}
