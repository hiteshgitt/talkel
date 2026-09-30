import type { FeedbackLanguage, VoiceGender } from '@speakai/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Choice, ErrorText, Screen, Title } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { useMe, useUpdateSettings } from '@/lib/queries';
import { colors } from '@/theme';

const LANGUAGES: { id: FeedbackLanguage; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिन्दी' },
];

const VOICES: { id: VoiceGender; label: string }[] = [
  { id: 'FEMALE', label: 'Maya (female)' },
  { id: 'MALE', label: 'Rohan (male)' },
];

export default function ProfileScreen() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const update = useUpdateSettings();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    qc.clear(); // drop the previous user's cached data
    setSigningOut(false);
  }

  if (!me) return null;

  return (
    <Screen>
      <Title>Profile</Title>
      <Card>
        <Text style={styles.name}>{me.profile.displayName ?? me.user.name}</Text>
        <Body muted>{me.user.email}</Body>
      </Card>

      <Text style={styles.section}>Feedback language</Text>
      <View style={styles.row}>
        {LANGUAGES.map((l) => (
          <Choice
            key={l.id}
            compact
            label={l.label}
            selected={me.settings.feedbackLanguage === l.id}
            onPress={() => update.mutate({ feedbackLanguage: l.id })}
          />
        ))}
      </View>

      <Text style={styles.section}>Default conversation partner</Text>
      <View style={styles.row}>
        {VOICES.map((v) => (
          <Choice
            key={v.id}
            compact
            label={v.label}
            selected={(me.settings.preferredVoiceGender ?? 'FEMALE') === v.id}
            onPress={() => update.mutate({ preferredVoiceGender: v.id })}
          />
        ))}
      </View>
      <ErrorText>{update.error instanceof Error ? update.error.message : null}</ErrorText>

      <Button label="Sign out" variant="secondary" onPress={() => void signOut()} loading={signingOut} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.text, fontSize: 20, fontWeight: '700' },
  section: { color: colors.textMuted, fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
