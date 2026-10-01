import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Body, Button, EmptyState, ErrorText, Field, Screen, Title } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { WEB_URL } from '@/lib/config';

export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    // The link opens the web app’s "choose a new password" page.
    const { error: err } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${WEB_URL}/reset-password`,
    });
    setBusy(false);
    if (err) setError(err.message ?? 'Could not send the email');
    else setSent(true);
  }

  return (
    <Screen style={{ marginTop: 32 }}>
      {sent ? (
        <>
          <EmptyState icon="mail-open-outline" title="Check your email" body={`If an account exists for ${email.trim()}, we’ve emailed a link to choose a new password.`} />
          <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
        </>
      ) : (
        <>
          <Title>Reset your password</Title>
          <Body muted>Enter your account email and we’ll send you a reset link.</Body>
          <Field label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <ErrorText>{error}</ErrorText>
          <Button label="Send reset link" onPress={() => void send()} loading={busy} disabled={!email.trim() || !WEB_URL} />
          <Button label="Back" variant="ghost" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
