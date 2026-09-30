'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { AuthShell, Button, ErrorText, Field } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (err) setError(err.message ?? 'Could not send the email');
    else setSent(true);
  }

  return (
    <AuthShell title="Reset your password">
      {sent ? (
        <p>If an account exists for {email.trim()}, we’ve emailed a link to choose a new password.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-muted">Enter your account email and we’ll send you a reset link.</p>
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <ErrorText>{error}</ErrorText>
          <Button type="submit" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
      <Link href="/sign-in" className="block text-center text-sm text-accent hover:underline">
        Back to sign in
      </Link>
    </AuthShell>
  );
}
