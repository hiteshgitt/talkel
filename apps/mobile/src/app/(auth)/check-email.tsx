import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Body, Button, Card, ErrorText, Screen, Title } from '@/components/ui';
import { authClient, VERIFIED_CALLBACK_URL } from '@/lib/auth-client';

export default function CheckEmailScreen() {
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.sendVerificationEmail({ email, callbackURL: VERIFIED_CALLBACK_URL });
    setBusy(false);
    if (err) setError(err.message ?? 'Could not send the email');
    else setMessage('Sent again. It can take a minute to arrive.');
  }

  return (
    <Screen style={{ marginTop: 32 }}>
      <Title>Check your email</Title>
      <Body>
        We sent a verification link to <Body>{email}</Body>. Open it on this phone and you’ll come straight back
        here to sign in.
      </Body>
      <Card>
        <Body muted>Can’t find it? Check your spam folder, or send it again.</Body>
      </Card>
      {message ? <Body muted>{message}</Body> : null}
      <ErrorText>{error}</ErrorText>
      <Button label="Send the link again" variant="secondary" onPress={() => void resend()} loading={busy} disabled={!email} />
      <Button label="I’ve verified — sign in" onPress={() => router.replace('/sign-in')} />
    </Screen>
  );
}
