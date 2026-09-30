'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { AuthShell, Button, ErrorText, Field } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

/** Opened from the reset email (also from the mobile app's "Forgot password"). */
function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token');
  const linkError = params.get('error'); // e.g. INVALID_TOKEN when the link has expired
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords don’t match.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.resetPassword({ newPassword: password, token: token ?? '' });
    setBusy(false);
    if (err) setError(err.message ?? 'Could not reset your password');
    else router.replace('/sign-in?reset=1');
  }

  if (!token || linkError) {
    return (
      <AuthShell title="Link expired">
        <p className="text-muted">This reset link is invalid or has expired. Request a new one.</p>
        <Link href="/forgot-password" className="block text-center text-accent hover:underline">
          Send a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="New password (at least 8 characters)" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label="Repeat new password" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" loading={busy}>
          Save new password
        </Button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
