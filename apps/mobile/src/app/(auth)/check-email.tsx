import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, EmptyState, ErrorText, Screen } from '@/components/ui';
import { authClient, VERIFIED_CALLBACK_URL } from '@/lib/auth-client';
import { pendingSignup } from '@/lib/pending-signup';
import { makeStyles, useColors } from '@/theme';

/** Sign-in is rate-limited, so automatic checks are spaced out. */
const CHECK_EVERY_MS = 20_000;

/**
 * After sign-up: "we've emailed you a link". Once the link is tapped (it opens the app here) or the
 * user switches back to the app, we sign them in by ourselves — no extra step.
 */
export default function CheckEmailScreen() {
  const s = useStyles();
  const c = useColors();
  const params = useLocalSearchParams<{ email?: string; verified?: string }>();
  const pending = pendingSignup.get();
  const email = params.email ?? pending?.email ?? '';
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const lastCheck = useRef(0);

  /** Tries to sign in with the just-created account; quietly waits while it isn't verified yet. */
  const tryContinue = useCallback(
    async (manual: boolean) => {
      const creds = pendingSignup.get();
      if (!creds) {
        if (manual || params.verified) router.replace({ pathname: '/sign-in', params: { verified: params.verified ?? '', email } });
        return;
      }
      if (!manual && Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = Date.now();
      setChecking(true);
      setError(null);
      const { error: err } = await authClient.signIn.email({ email: creds.email, password: creds.password });
      setChecking(false);
      if (!err) {
        pendingSignup.clear(); // signed in: the app moves on to onboarding by itself
        return;
      }
      if (err.code === 'EMAIL_NOT_VERIFIED') {
        if (manual) setError('Not verified yet — tap the link in the email first.');
        return;
      }
      setError(err.message ?? 'Could not sign in');
    },
    [email, params.verified],
  );

  // Back from the email app (or opened by the verification link): check now, then every so often.
  useEffect(() => {
    if (params.verified) lastCheck.current = 0;
    const first = setTimeout(() => void tryContinue(false), 0);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        lastCheck.current = 0;
        void tryContinue(false);
      }
    });
    const timer = setInterval(() => void tryContinue(false), CHECK_EVERY_MS);
    return () => {
      clearTimeout(first);
      sub.remove();
      clearInterval(timer);
    };
  }, [tryContinue, params.verified]);

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
      <EmptyState
        icon="mail-unread-outline"
        title="Verify your email"
        body={`We've sent a verification link to ${email}. Tap the link in that email — you'll come straight back here and we'll continue automatically.`}
      />
      <View style={s.status}>
        {checking ? <ActivityIndicator color={c.accent} size="small" /> : <Ionicons name="time-outline" size={18} color={c.textMuted} />}
        <Text style={s.statusText}>{checking ? 'Checking…' : 'Waiting for you to verify…'}</Text>
      </View>
      <Card>
        <Body muted>Can’t find it? Check your spam or promotions folder, or send it again.</Body>
      </Card>
      {message ? <Body muted>{message}</Body> : null}
      <ErrorText>{error}</ErrorText>
      <Button label="I’ve verified — continue" icon="arrow-forward" onPress={() => void tryContinue(true)} loading={checking} />
      <Button label="Send the link again" icon="refresh" variant="secondary" onPress={() => void resend()} loading={busy} disabled={!email} />
    </Screen>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    status: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    statusText: { color: c.textMuted, fontSize: 14 },
  }),
);
