'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { AuthShell, Button, ErrorText, Field } from '@/components/ui';
import { authClient } from '@/lib/auth-client';

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
      // After clicking the emailed link the user is signed in and lands here.
      callbackURL: `${window.location.origin}/dashboard`,
    });
    setBusy(false);
    if (err) {
      setError(err.message ?? 'Could not create your account');
      return;
    }
    router.push(`/check-email?email=${encodeURIComponent(email.trim())}`);
  }

  return (
    <AuthShell title="Create your account" subtitle="Talk with AI characters in real-life situations, then get friendly feedback.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Your name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Password (at least 8 characters)"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <ErrorText>{error}</ErrorText>
        <Button type="submit" loading={busy}>
          Create account
        </Button>
      </form>
      <Link href="/sign-in" className="block text-center text-sm text-accent hover:underline">
        Already have an account? Sign in
      </Link>
    </AuthShell>
  );
}
