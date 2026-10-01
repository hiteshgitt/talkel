import Ionicons from '@expo/vector-icons/Ionicons';
import type { CreateConversationResponse } from '@speakai/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconBadge, PersonaAvatar, ScenarioBanner } from '@/components/art';
import { ACCENT_LABEL, LEVEL_LABEL } from '@/components/pickers';
import { Badge, Button, Card, ErrorText, Screen } from '@/components/ui';
import { levelName } from '@/lib/missions';
import { createdConversationKey, formatMinutes } from '@/lib/queries';
import { makeStyles, useColors } from '@/theme';

/** Pre-conversation brief (PRD §24): the situation and objective — never the AI's questions. */
export default function BriefScreen() {
  const s = useStyles();
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const created = qc.getQueryData<CreateConversationResponse>(createdConversationKey(id));

  if (!created) {
    return (
      <Screen>
        <ErrorText>This conversation setup has expired.</ErrorText>
        <Button label="Choose a scenario" onPress={() => router.replace('/practice')} />
      </Screen>
    );
  }

  const start = () =>
    router.replace({
      pathname: '/call',
      params: { conversationId: created.id, personaName: created.persona.name, personaSlug: created.persona.slug, title: created.brief.title },
    });

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: 'Your brief' }} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <ScenarioBanner slug={created.scenarioSlug} height={130}>
          <Text style={s.title}>{created.brief.title}</Text>
        </ScenarioBanner>

        {created.mission ? (
          <View style={s.missionRow}>
            <Badge label={`Mission · Level ${created.mission.level} · ${levelName(created.mission.level)}`} tone="accent" icon="flag" />
          </View>
        ) : null}
        <Card>
          <Text style={s.label}>The situation</Text>
          <Text style={s.body}>{created.brief.briefing}</Text>
        </Card>

        {created.mission ? (
          <Card>
            <Text style={s.label}>Your objectives</Text>
            {created.mission.objectives.map((o) => (
              <View key={o} style={s.objective}>
                <Ionicons name="flag-outline" size={17} color={c.success} />
                <Text style={s.factValue}>{o}</Text>
              </View>
            ))}
          </Card>
        ) : null}

        <Card style={s.facts}>
          <Fact icon={<IconBadge name="person" tint={c.accent} />} label="You are" value={created.brief.userRole} />
          <Fact icon={<IconBadge name="flag" tint={c.success} />} label="Your goal" value={created.brief.objective} />
          <Fact
            icon={<PersonaAvatar name={created.persona.name} slug={created.persona.slug} size={36} />}
            label="Talking to"
            value={`${created.persona.name} · ${ACCENT_LABEL[created.accent]} accent\n${created.persona.description}`}
          />
          <Fact
            icon={<IconBadge name="speedometer" tint={c.warning} />}
            label="Level · length"
            value={`${LEVEL_LABEL[created.difficulty]} · up to ${formatMinutes(created.durationSec)}`}
          />
        </Card>

        <View style={s.tip}>
          <Ionicons name="bulb-outline" size={20} color={c.accent} />
          <Text style={s.tipText}>Speak naturally. It’s fine to pause, ask them to repeat, or say you don’t know a word.</Text>
        </View>
      </ScrollView>
      <View style={s.footer}>
        <Button label="Start call" icon="call" onPress={start} />
        <Button label="Change settings" variant="ghost" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={s.fact}>
      {icon}
      <View style={s.factText}>
        <Text style={s.label}>{label}</Text>
        <Text style={s.factValue}>{value}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, gap: 16, paddingBottom: 24 },
    title: { color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.4 },
    label: { color: c.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    body: { color: c.text, fontSize: 16, lineHeight: 24 },
    facts: { gap: 16 },
    missionRow: { flexDirection: 'row' },
    objective: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    fact: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
    factText: { flex: 1, gap: 3 },
    factValue: { color: c.text, fontSize: 15, lineHeight: 21 },
    tip: { flexDirection: 'row', gap: 10, backgroundColor: c.accentSoft, borderRadius: 16, padding: 14, alignItems: 'flex-start' },
    tipText: { color: c.text, fontSize: 14, lineHeight: 20, flex: 1 },
    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, gap: 2, alignItems: 'stretch', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  }),
);
