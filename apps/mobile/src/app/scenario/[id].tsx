import { type Accent, DURATION_OPTIONS_SEC, type EnglishLevel, type VoicePreference } from '@speakai/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScenarioBanner } from '@/components/art';
import { AccentPicker, DurationPicker, LevelPicker, PersonaPicker, Section, VoicePicker } from '@/components/pickers';
import { Body, Button, Choice, ErrorText, Loading, Screen } from '@/components/ui';
import { api, friendlyError } from '@/lib/api';
import { configProblem } from '@/lib/config';
import { createdConversationKey, formatMinutes, useCatalog, useMe, useQuota } from '@/lib/queries';
import { nativeCallingProblem } from '@/lib/runtime';
import { makeStyles } from '@/theme';

/** Conversation setup: partner, difficulty, length, live correction. */
export default function ScenarioSetupScreen() {
  const s = useStyles();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const catalog = useCatalog();
  const quota = useQuota();
  const { data: me } = useMe();

  const scenario = catalog.data?.scenarios.find((x) => x.id === id);
  const canChoosePartner = me?.entitlements.choosePartner ?? false;
  const canChooseAccent = me?.entitlements.chooseAccent ?? false;
  const preferred: VoicePreference = me?.settings.preferredVoiceGender === 'MALE' ? 'MALE' : me?.settings.preferredVoiceGender === 'FEMALE' ? 'FEMALE' : 'RANDOM';
  const [voice, setVoice] = useState<VoicePreference | null>(null);
  const [accent, setAccent] = useState<Accent | 'RANDOM'>('RANDOM');
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<EnglishLevel | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [liveCorrection, setLiveCorrection] = useState<boolean | null>(null);

  const chosenVoice: VoicePreference = canChoosePartner ? (voice ?? preferred) : 'RANDOM';
  const partnerOptions = (catalog.data?.personas ?? []).filter((p) => chosenVoice === 'RANDOM' || p.gender === chosenVoice);
  // A specific partner is optional: without one, the server picks at random (within the voice).
  const chosenPersona = canChoosePartner && partnerOptions.some((p) => p.id === personaId) ? personaId : null;
  const chosenLevel = difficulty ?? me?.settings.defaultDifficulty ?? 'INTERMEDIATE';
  const chosenCorrection = liveCorrection ?? me?.settings.liveCorrection ?? false;
  const remaining = quota.data?.remainingSec ?? 0;
  const chosenDuration = durationSec ?? (DURATION_OPTIONS_SEC.find((x) => x === 300) ?? 300);

  const create = useMutation({
    mutationFn: () =>
      api.createConversation({
        scenarioId: id,
        ...(chosenPersona ? { personaId: chosenPersona } : {}),
        voice: chosenVoice,
        accent: canChooseAccent ? accent : 'RANDOM',
        difficulty: chosenLevel,
        durationSec: chosenDuration,
        liveCorrection: chosenCorrection,
      }),
    onSuccess: (created) => {
      qc.setQueryData(createdConversationKey(created.id), created);
      router.push({ pathname: '/brief/[id]', params: { id: created.id } });
    },
  });

  if (catalog.isPending || quota.isPending) return <Loading />;
  if (!scenario) {
    return (
      <Screen>
        <ErrorText>This scenario isn’t available.</ErrorText>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const problem = configProblem() ?? nativeCallingProblem();
  const outOfTime = remaining < 30;

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <ScenarioBanner slug={scenario.slug} height={170}>
          <Text style={s.eyebrow}>{scenario.category.name}</Text>
          <Text style={s.title}>{scenario.title}</Text>
          <Text style={s.tagline}>{scenario.tagline}</Text>
        </ScenarioBanner>

        <Section title="Who you’ll talk to" icon="person-outline">
          <VoicePicker value={chosenVoice} onChange={setVoice} locked={!canChoosePartner} />
          {canChoosePartner ? (
            <PersonaPicker personas={partnerOptions} value={chosenPersona} onChange={(pid) => setPersonaId(pid === personaId ? null : pid)} />
          ) : (
            <Body muted>On the free plan your partner is a surprise: one of {catalog.data!.personas.map((p) => p.name).join(', ')}.</Body>
          )}
        </Section>

        <Section title="Accent" icon="globe-outline">
          <AccentPicker value={canChooseAccent ? accent : 'RANDOM'} onChange={setAccent} locked={!canChooseAccent} />
        </Section>

        <Section title="Difficulty" icon="bar-chart-outline">
          <LevelPicker value={chosenLevel} onChange={setDifficulty} />
        </Section>

        <Section title="Length" icon="time-outline">
          <DurationPicker options={DURATION_OPTIONS_SEC} value={chosenDuration} remainingSec={remaining} onChange={setDurationSec} />
          {!outOfTime && remaining < chosenDuration ? <Body muted>You have {formatMinutes(remaining)} left today, so this call will be shorter.</Body> : null}
        </Section>

        <Section title="During the call" icon="school-outline">
          <Choice
            role="checkbox"
            icon="bulb-outline"
            label="Gently correct big mistakes"
            description="Off: the AI stays in character, and you get all feedback after the call."
            selected={chosenCorrection}
            onPress={() => setLiveCorrection(!chosenCorrection)}
          />
        </Section>

        <ErrorText>{problem ?? (outOfTime ? 'You’ve used today’s free practice time. It resets at midnight.' : null)}</ErrorText>
        <ErrorText>{create.error ? friendlyError(create.error) : null}</ErrorText>
      </ScrollView>
      <View style={s.footer}>
        <Button label="Continue" icon="arrow-forward" onPress={() => create.mutate()} loading={create.isPending} disabled={outOfTime || Boolean(problem)} />
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, gap: 24, paddingBottom: 24 },
    eyebrow: { color: c.text, opacity: 0.7, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
    title: { color: c.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    tagline: { color: c.textMuted, fontSize: 15, lineHeight: 21, maxWidth: '85%' },
    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.bg },
  }),
);
