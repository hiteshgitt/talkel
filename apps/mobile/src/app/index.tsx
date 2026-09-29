import type { VoiceChoice } from '@speakai/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { apiConfigProblem } from '@/lib/api';
import { colors, radius } from '@/theme';

const VOICES: { id: VoiceChoice; label: string; name: string }[] = [
  { id: 'female', label: 'Female', name: 'Maya' },
  { id: 'male', label: 'Male', name: 'Rohan' },
];

export default function SetupScreen() {
  const [voice, setVoice] = useState<VoiceChoice>('female');
  const configProblem = apiConfigProblem();

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Scenario</Text>
        <Text style={styles.title}>Friendly Conversation</Text>
        <Text style={styles.body}>
          A casual catch-up call with a friend. Chat about your weekend, work, hobbies or anything else. Just talk
          naturally — nobody will correct you during the call.
        </Text>
      </View>

      <Text style={styles.sectionLabel}>Who do you want to talk to?</Text>
      <View style={styles.voiceRow} accessibilityRole="radiogroup">
        {VOICES.map((v) => {
          const selected = v.id === voice;
          return (
            <Pressable
              key={v.id}
              onPress={() => setVoice(v.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.voice, selected && styles.voiceSelected]}
            >
              <Text style={styles.voiceName}>{v.name}</Text>
              <Text style={styles.voiceLabel}>{v.label} voice</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.spacer} />

      {configProblem ? <Text style={styles.warning}>{configProblem}</Text> : null}
      <Pressable
        onPress={() => router.push({ pathname: '/call', params: { voice } })}
        disabled={Boolean(configProblem)}
        accessibilityRole="button"
        style={({ pressed }) => [styles.start, (pressed || configProblem) && styles.startDim]}
      >
        <Text style={styles.startText}>Start conversation</Text>
      </Pressable>
      <Text style={styles.hint}>Up to 5 minutes · hold the phone to your ear or use headphones</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 20, gap: 16 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 20, gap: 8 },
  eyebrow: { color: colors.textMuted, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 24, fontWeight: '600' },
  body: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  sectionLabel: { color: colors.text, fontSize: 16, fontWeight: '500', marginTop: 8 },
  voiceRow: { flexDirection: 'row', gap: 12 },
  voice: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  voiceSelected: { borderColor: colors.accent },
  voiceName: { color: colors.text, fontSize: 18, fontWeight: '600' },
  voiceLabel: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  spacer: { flex: 1 },
  warning: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  start: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 18, alignItems: 'center' },
  startDim: { opacity: 0.6 },
  startText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
