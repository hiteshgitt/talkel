import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IconBadge } from '@/components/art';
import { Body, Button, Card, Choice, ErrorText, Field, Screen, Title } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { useMe } from '@/lib/queries';
import type { IconName } from '@/lib/visuals';
import { makeStyles, useColors } from '@/theme';

const DELETED: { icon: IconName; text: string }[] = [
  { icon: 'chatbubbles-outline', text: 'All conversations, transcripts and feedback' },
  { icon: 'recording-outline', text: 'Call recordings' },
  { icon: 'flag-outline', text: 'Mission progress and your learning profile' },
  { icon: 'sparkles-outline', text: 'Everything Talkel remembers about you' },
  { icon: 'person-outline', text: 'Your account, profile and settings' },
];

/** DPDP: delete the account and all its data, after a password check. */
export default function DeleteAccountScreen() {
  const s = useStyles();
  const c = useColors();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [password, setPassword] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPassword = me?.user.hasPassword ?? true;

  async function remove() {
    setBusy(true);
    setError(null);
    const { error: err } = await authClient.deleteUser(hasPassword ? { password } : {});
    setBusy(false);
    if (err) {
      setError(
        err.code === 'INVALID_PASSWORD'
          ? 'That password is incorrect.'
          : err.code === 'SESSION_EXPIRED'
            ? 'For your security, please sign out, sign in again, and then delete your account.'
            : (err.message ?? 'Could not delete your account.'),
      );
      return;
    }
    // The session is gone: clear cached data; the root layout shows the sign-in screen.
    qc.clear();
    await authClient.signOut().catch(() => undefined);
  }

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />
      <IconBadge name="warning-outline" tint={c.danger} size={56} />
      <Title>Delete your account</Title>
      <Body muted>This permanently deletes everything. It can’t be undone. We’ll email you a confirmation.</Body>

      <Card>
        <Text style={s.label}>What will be deleted</Text>
        {DELETED.map((d) => (
          <View key={d.text} style={s.row}>
            <Ionicons name={d.icon} size={18} color={c.danger} />
            <Text style={s.text}>{d.text}</Text>
          </View>
        ))}
      </Card>

      <Body muted>Want a copy first? Use “Download my data” in Profile before deleting.</Body>

      {hasPassword ? (
        <Field label="Your password" icon="lock-closed-outline" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" />
      ) : (
        <Body muted>You signed in with Google. If that was more than a day ago, sign out and back in first.</Body>
      )}
      <Choice
        role="checkbox"
        label="I understand"
        description="My account and all my data will be permanently deleted."
        selected={understood}
        onPress={() => setUnderstood((u) => !u)}
      />
      <ErrorText>{error}</ErrorText>
      <Button label="Permanently delete my account" icon="trash-outline" variant="danger" onPress={() => void remove()} loading={busy} disabled={!understood || (hasPassword && !password)} />
      <Button label="Keep my account" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    label: { color: c.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    text: { color: c.text, fontSize: 15, flex: 1 },
  }),
);
