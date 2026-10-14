import type { TopicArea, TopicInput, TopicMood } from '@speakai/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Section } from '@/components/pickers';
import { Body, Button, Choice, ErrorText, Field, Loading, Screen } from '@/components/ui';
import { api, friendlyError } from '@/lib/api';
import { TOPICS_KEY, useTopics } from '@/lib/queries';
import { makeStyles } from '@/theme';

const AREAS: { value: TopicArea; label: string }[] = [
  { value: 'everyday', label: 'Everyday' },
  { value: 'work', label: 'Work' },
  { value: 'real-life', label: 'Real life' },
];

const MOODS: { value: TopicMood; label: string; description: string }[] = [
  { value: 'FRIENDLY', label: 'Friendly', description: 'Patient and helpful — good for a first try.' },
  { value: 'REALISTIC', label: 'Realistic', description: 'Like a typical real person: fair, with follow-up questions.' },
  { value: 'TOUGH', label: 'Tough', description: 'Sceptical and pushes back — for when you’re ready.' },
];

/** Tap to fill, so it's clear what a good topic looks like. */
const EXAMPLES: Record<TopicArea, string> = {
  everyday: 'Meeting my friend’s parents for the first time at a family dinner',
  work: 'Telling my manager the project will be two days late because the client changed the requirements',
  'real-life': 'Asking my landlord to return my security deposit after I moved out',
};

/** Create a custom topic, or edit one (`id`): the user describes a situation and the AI builds the role-play. */
export default function TopicEditScreen() {
  const s = useStyles();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const qc = useQueryClient();
  const topics = useTopics();
  const existing = id ? topics.data?.topics.find((t) => t.id === id) : undefined;

  const [area, setArea] = useState<TopicArea>('work');
  const [situation, setSituation] = useState('');
  const [partner, setPartner] = useState('');
  const [goal, setGoal] = useState('');
  const [mood, setMood] = useState<TopicMood>('REALISTIC');
  const filled = useRef(false);

  useEffect(() => {
    if (!existing || filled.current) return;
    filled.current = true;
    setArea(existing.input.area);
    setSituation(existing.input.situation);
    setPartner(existing.input.partner ?? '');
    setGoal(existing.input.goal ?? '');
    setMood(existing.input.mood);
  }, [existing]);

  const save = useMutation({
    mutationFn: () => {
      const body: TopicInput = {
        area,
        situation: situation.trim(),
        mood,
        ...(partner.trim() ? { partner: partner.trim() } : {}),
        ...(goal.trim() ? { goal: goal.trim() } : {}),
      };
      return id ? api.updateTopic(id, body) : api.createTopic(body);
    },
    onSuccess: async (topic) => {
      await qc.invalidateQueries({ queryKey: TOPICS_KEY });
      if (id) router.back();
      else router.replace({ pathname: '/scenario/[id]', params: { id: topic.id } });
    },
  });

  if (id && topics.isPending) return <Loading />;
  if (id && !existing) {
    return (
      <Screen>
        <ErrorText>This topic isn’t available.</ErrorText>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const tooShort = situation.trim().length < 10;

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: id ? 'Edit topic' : 'Your own topic' }} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {!id ? <Body muted>Describe a real conversation you have coming up. Talkel turns it into a practice call, with feedback afterwards.</Body> : null}

        <Section title="Where does it happen?" icon="location-outline">
          <View style={s.chips}>
            {AREAS.map((a) => (
              <Choice key={a.value} compact label={a.label} selected={area === a.value} onPress={() => setArea(a.value)} />
            ))}
          </View>
        </Section>

        <Section title="What’s the situation?" icon="chatbubble-ellipses-outline">
          <Field
            label="The situation, in your own words"
            placeholder={`e.g. ${EXAMPLES[area]}`}
            value={situation}
            onChangeText={setSituation}
            maxLength={500}
            multiline
            style={s.multiline}
          />
          {!situation.trim() ? (
            <Choice compact icon="bulb-outline" label="Use this example" selected={false} onPress={() => setSituation(EXAMPLES[area])} />
          ) : null}
          <Body muted>English, Hindi or Hinglish — all fine.</Body>
        </Section>

        <Section title="Details (optional)" icon="create-outline">
          <Field label="Who should the AI be?" icon="person-outline" placeholder="e.g. my manager, a bit strict" value={partner} onChangeText={setPartner} maxLength={120} />
          <Field label="What do you want to achieve?" icon="flag-outline" placeholder="e.g. get two more days without sounding unprofessional" value={goal} onChangeText={setGoal} maxLength={200} />
        </Section>

        <Section title="How should they behave?" icon="happy-outline">
          {MOODS.map((m) => (
            <Choice key={m.value} label={m.label} description={m.description} selected={mood === m.value} onPress={() => setMood(m.value)} />
          ))}
        </Section>

        {save.isPending ? <Body muted>Building your topic — this takes a few seconds…</Body> : null}
        <ErrorText>{save.error ? friendlyError(save.error) : null}</ErrorText>
      </ScrollView>
      <View style={s.footer}>
        <Button label={id ? 'Save changes' : 'Create topic'} icon="sparkles" onPress={() => save.mutate()} loading={save.isPending} disabled={tooShort} />
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, gap: 24, paddingBottom: 24 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    multiline: { minHeight: 96, textAlignVertical: 'top' },
    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.bg },
  }),
);
