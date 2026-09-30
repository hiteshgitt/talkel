import { DURATION_OPTIONS_SEC, type EnglishLevel } from '@speakai/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Body, Button, Choice, ErrorText, Loading, Screen, Title } from '@/components/ui';
import { DurationPicker, LevelPicker, PersonaPicker, Section } from '@/components/pickers';
import { api, friendlyError } from '@/lib/api';
import { configProblem } from '@/lib/config';
import { createdConversationKey, formatMinutes, useCatalog, useMe, useQuota } from '@/lib/queries';
import { nativeCallingProblem } from '@/lib/runtime';
import { preferredPersonaSlug } from '@/lib/voice';

/** Conversation setup: partner, difficulty, length, live correction. */
export default function ScenarioSetupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const catalog = useCatalog();
  const quota = useQuota();
  const { data: me } = useMe();

  const scenario = catalog.data?.scenarios.find((s) => s.id === id);
  const defaultPersona = catalog.data?.personas.find((p) => p.slug === preferredPersonaSlug(me))?.id ?? null;
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<EnglishLevel | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [liveCorrection, setLiveCorrection] = useState<boolean | null>(null);

  const chosenPersona = personaId ?? defaultPersona;
  const chosenLevel = difficulty ?? me?.settings.defaultDifficulty ?? 'INTERMEDIATE';
  const chosenCorrection = liveCorrection ?? me?.settings.liveCorrection ?? false;
  const remaining = quota.data?.remainingSec ?? 0;
  const chosenDuration = durationSec ?? (DURATION_OPTIONS_SEC.find((s) => s === 300) ?? 300);

  const create = useMutation({
    mutationFn: () =>
      api.createConversation({
        scenarioId: id,
        personaId: chosenPersona!,
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
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: '' }} />
      <Title>{scenario.title}</Title>
      <Body muted>{scenario.tagline}</Body>

      <Section title="Talk to">
        <PersonaPicker personas={catalog.data!.personas} value={chosenPersona} onChange={setPersonaId} />
      </Section>

      <Section title="Difficulty">
        <LevelPicker value={chosenLevel} onChange={setDifficulty} />
      </Section>

      <Section title="Length">
        <DurationPicker options={DURATION_OPTIONS_SEC} value={chosenDuration} remainingSec={remaining} onChange={setDurationSec} />
        {!outOfTime && remaining < chosenDuration ? (
          <Body muted>You have {formatMinutes(remaining)} left today, so this call will be shorter.</Body>
        ) : null}
      </Section>

      <Section title="Corrections during the call">
        <Choice
          role="checkbox"
          label="Gently correct big mistakes"
          description="Off: the AI stays in character and you get all feedback after the call."
          selected={chosenCorrection}
          onPress={() => setLiveCorrection(!chosenCorrection)}
        />
      </Section>

      <ErrorText>{problem ?? (outOfTime ? 'You’ve used today’s free practice time. It resets at midnight.' : null)}</ErrorText>
      <ErrorText>{create.error ? friendlyError(create.error) : null}</ErrorText>
      <Button label="Continue" onPress={() => create.mutate()} loading={create.isPending} disabled={!chosenPersona || outOfTime || Boolean(problem)} />
    </Screen>
  );
}
