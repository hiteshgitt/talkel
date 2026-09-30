import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { authClient, VERIFIED_CALLBACK_URL } from '@/lib/auth-client';
import { colors } from '@/theme';

const MIN_PASSWORD = 8;

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  async function signUp() {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
      callbackURL: VERIFIED_CALLBACK_URL,
    });
    setBusy(false);
    if (err) {
      setError(err.message ?? 'Could not create your account');
      return;
    }
    router.replace({ pathname: '/check-email', params: { email: email.trim() } });
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <Title>Create your account</Title>
        <Body muted>Talk with AI characters in real-life situations, then get friendly feedback.</Body>
      </View>
      <Field label="Your name" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Field label={`Password (at least ${MIN_PASSWORD} characters)`} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      {tooShort ? <ErrorText>Password is too short.</ErrorText> : null}
      <ErrorText>{error}</ErrorText>
      <Button
        label="Create account"
        onPress={() => void signUp()}
        loading={busy}
        disabled={!name.trim() || !email.trim() || password.length < MIN_PASSWORD}
      />
      <Link href="/sign-in" style={styles.link}>
        Already have an account? Sign in
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: 8, marginTop: 24, marginBottom: 8 },
  link: { color: colors.accent, fontSize: 16, textAlign: 'center', paddingVertical: 8 },
});
