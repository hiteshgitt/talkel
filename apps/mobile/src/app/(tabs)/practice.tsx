import type { VoiceChoice } from '@speakai/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, Choice, ErrorText, Screen, Title } from '@/components/ui';
import { configProblem } from '@/lib/config';
import { useMe } from '@/lib/queries';
import { nativeCallingProblem } from '@/lib/runtime';
import { PERSONAS, preferredVoice } from '@/lib/voice';
import { colors } from '@/theme';

/** MVP scenario list (PRD §63). Only Friendly Conversation is live until the scenario engine (M2). */
const UPCOMING = [
  { title: 'Job Interview', description: 'Answer an interviewer’s questions about your experience.' },
  { title: 'Client Meeting', description: 'Discuss requirements, deadline and budget with a client.' },
  { title: 'Debate', description: 'Defend your side while the AI challenges you.' },
  { title: 'Bargaining', description: 'Negotiate a better price with a seller.' },
];

export default function PracticeScreen() {
  const { data: me } = useMe();
  const [voice, setVoice] = useState<VoiceChoice>(() => preferredVoice(me));
  const problem = configProblem() ?? nativeCallingProblem();

  return (
    <Screen>
      <Title>Practice</Title>

      <Card style={styles.scenario}>
        <Text style={styles.eyebrow}>Available now</Text>
        <Text style={styles.scenarioTitle}>Friendly Conversation</Text>
        <Body muted>A casual catch-up call: work, food, plans, movies — whatever comes up.</Body>
        <Text style={styles.label}>Who do you want to talk to?</Text>
        <View style={styles.voices} accessibilityRole="radiogroup">
          {(Object.keys(PERSONAS) as VoiceChoice[]).map((v) => (
            <View key={v} style={styles.voice}>
              <Choice label={PERSONAS[v].name} description={PERSONAS[v].label} selected={voice === v} onPress={() => setVoice(v)} />
            </View>
          ))}
        </View>
        <ErrorText>{problem}</ErrorText>
        <Button
          label="Start conversation"
          onPress={() => router.push({ pathname: '/call', params: { voice } })}
          disabled={Boolean(problem)}
        />
      </Card>

      <Text style={styles.section}>Coming soon</Text>
      {UPCOMING.map((s) => (
        <Card key={s.title} style={styles.upcoming}>
          <Text style={styles.upcomingTitle}>{s.title}</Text>
          <Body muted>{s.description}</Body>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scenario: { gap: 12 },
  eyebrow: { color: colors.userSpeaking, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  scenarioTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  label: { color: colors.text, fontSize: 15, fontWeight: '500', marginTop: 4 },
  voices: { flexDirection: 'row', gap: 12 },
  voice: { flex: 1 },
  section: { color: colors.textMuted, fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  upcoming: { opacity: 0.6 },
  upcomingTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
});
