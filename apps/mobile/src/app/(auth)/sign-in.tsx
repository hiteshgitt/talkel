import { AuthConfig } from '@speakai/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Screen, Title } from '@/components/ui';
import { authClient, VERIFIED_CALLBACK_URL } from '@/lib/auth-client';
import { API_URL, configProblem } from '@/lib/config';
import { colors } from '@/theme';

export default function SignInScreen() {
  const { verified } = useLocalSearchParams<{ verified?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(configProblem());
  const [notVerified, setNotVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(verified ? 'Email verified. Sign in to continue.' : null);

  const authConfig = useQuery({
    queryKey: ['auth-config'],
    queryFn: async () => AuthConfig.parse(await (await fetch(`${API_URL}/auth-config`)).json()),
  });

  async function signIn() {
    setBusy(true);
    setError(null);
    setNotice(null);
    setNotVerified(false);
    const { error: err } = await authClient.signIn.email({ email: email.trim(), password });
    setBusy(false);
    if (!err) return; // the root layout reacts to the new session
    if (err.code === 'EMAIL_NOT_VERIFIED') setNotVerified(true);
    setError(err.message ?? 'Could not sign in');
  }

  async function resendVerification() {
    setBusy(true);
    const { error: err } = await authClient.sendVerificationEmail({ email: email.trim(), callbackURL: VERIFIED_CALLBACK_URL });
    setBusy(false);
    setError(err ? (err.message ?? 'Could not send the email') : null);
    if (!err) setNotice(`We sent a new verification link to ${email.trim()}.`);
  }

  async function google() {
    setError(null);
    const { error: err } = await authClient.signIn.social({ provider: 'google', callbackURL: '/' });
    if (err) setError(err.message ?? 'Google sign-in failed');
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.brand}>SpeakAI</Text>
        <Title>Welcome back</Title>
        <Body muted>Practise real conversations in English, every day.</Body>
      </View>

      {notice ? (
        <Card>
          <Body>{notice}</Body>
        </Card>
      ) : null}

      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={() => void signIn()} />
      <ErrorText>{error}</ErrorText>
      {notVerified ? <Button label="Resend verification email" variant="secondary" onPress={() => void resendVerification()} loading={busy} /> : null}

      <Button label="Sign in" onPress={() => void signIn()} loading={busy} disabled={!email || !password || Boolean(configProblem())} />
      {authConfig.data?.google ? <Button label="Continue with Google" variant="secondary" onPress={() => void google()} /> : null}

      <Link href="/sign-up" style={styles.link}>
        New here? Create an account
      </Link>
      <Link href={{ pathname: '/forgot-password', params: { email } }} style={styles.linkMuted}>
        Forgot password?
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 8, marginTop: 24, marginBottom: 8 },
  brand: { color: colors.accent, fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  link: { color: colors.accent, fontSize: 16, textAlign: 'center', paddingVertical: 8 },
  linkMuted: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
});
