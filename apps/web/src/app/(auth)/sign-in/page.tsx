'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useState } from 'react';
import { AuthShell, Button, ErrorText, Field } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(params.get('reset') ? 'Password changed. Sign in with your new password.' : null);
  const [notVerified, setNotVerified] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotVerified(false);
    const { error: err } = await authClient.signIn.email({ email: email.trim(), password });
    setBusy(false);
    if (!err) {
      router.replace('/dashboard');
      router.refresh();
      return;
    }
    setNotVerified(err.code === 'EMAIL_NOT_VERIFIED');
    setError(err.message ?? 'Could not sign in');
  }

  async function resend() {
    setBusy(true);
    const { error: err } = await authClient.sendVerificationEmail({
      email: email.trim(),
      callbackURL: `${window.location.origin}/dashboard`,
    });
    setBusy(false);
    if (err) setError(err.message ?? 'Could not send the email');
    else {
      setError(null);
      setNotice(`We sent a new verification link to ${email.trim()}.`);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Practise real conversations in English, every day.">
      {notice ? <p className="rounded-xl bg-surface p-3 text-sm">{notice}</p> : null}
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <ErrorText>{error}</ErrorText>
        {notVerified ? (
          <Button type="button" variant="secondary" onClick={() => void resend()} loading={busy}>
            Resend verification email
          </Button>
        ) : null}
        <Button type="submit" loading={busy}>
          Sign in
        </Button>
      </form>
      <div className="space-y-2 text-center text-sm">
        <Link href="/sign-up" className="block text-accent hover:underline">
          New here? Create an account
        </Link>
        <Link href="/forgot-password" className="block text-muted hover:underline">
          Forgot password?
        </Link>
      </div>
    </AuthShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
