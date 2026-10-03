import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BrandMark } from '@/components/art';
import { Button, ErrorText, Field, Screen, Title } from '@/components/ui';
import { authClient, VERIFIED_CALLBACK_URL } from '@/lib/auth-client';
import { pendingSignup } from '@/lib/pending-signup';
import { makeStyles } from '@/theme';

const MIN_PASSWORD = 8;

export default function SignUpScreen() {
  const styles = useStyles();
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
    pendingSignup.set(email.trim(), password);
    router.replace({ pathname: '/check-email', params: { email: email.trim() } });
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <BrandMark size={52} />
        <Title>Create your account</Title>
        <Text style={styles.lead}>Talk with AI characters in real-life situations, then get friendly feedback.</Text>
      </View>
      <Field label="Your name" icon="person-outline" value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
      <Field label="Email" icon="mail-outline" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Field label={`Password (at least ${MIN_PASSWORD} characters)`} icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      {tooShort ? <ErrorText>Password is too short.</ErrorText> : null}
      <ErrorText>{error}</ErrorText>
      <Button
        label="Create account"
        icon="person-add-outline"
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

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    hero: { gap: 8, marginTop: 20, marginBottom: 8, alignItems: 'center' },
    lead: { color: c.textMuted, fontSize: 16, lineHeight: 23, textAlign: 'center' },
    link: { color: c.accent, fontSize: 16, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
  }),
);
