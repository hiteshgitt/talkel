import Ionicons from '@expo/vector-icons/Ionicons';
import { MISSION_LEVELS } from '@speakai/contracts';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconBadge, ScenarioBanner } from '@/components/art';
import { Badge, Body, Button, Card, ErrorText, Loading, Screen } from '@/components/ui';
import { friendlyError } from '@/lib/api';
import { configProblem } from '@/lib/config';
import { LEVEL_HINT, SKILL, useMissions, useStartMission } from '@/lib/missions';
import { formatMinutes, useQuota } from '@/lib/queries';
import { nativeCallingProblem } from '@/lib/runtime';
import { makeStyles, radius, useColors } from '@/theme';

/** A mission: what you must achieve, who you face, the skills tested, and the level to play. */
export default function MissionScreen() {
  const s = useStyles();
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const missions = useMissions();
  const quota = useQuota();
  const start = useStartMission();
  const m = missions.data?.missions.find((x) => x.id === id);
  const [chosen, setChosen] = useState<number | null>(null);

  if (missions.isPending) return <Loading />;
  if (!m) {
    return (
      <Screen>
        <ErrorText>This mission isn’t available.</ErrorText>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const p = m.progress;
  const level = chosen ?? p.unlockedLevel;
  const problem = configProblem() ?? nativeCallingProblem();
  const outOfTime = (quota.data?.remainingSec ?? 0) < 30;

  return (
    <SafeAreaView style={s.root} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <ScenarioBanner slug={m.slug} height={170}>
          <Text style={s.eyebrow}>Mission</Text>
          <Text style={s.title}>{m.title}</Text>
          <Text style={s.tagline}>{m.tagline}</Text>
        </ScenarioBanner>

        <Card>
          <View style={s.head}>
            <IconBadge name="flag" tint={c.success} size={34} />
            <Text style={s.h}>Your objectives</Text>
          </View>
          {m.objectives.map((o, i) => (
            <View key={o} style={s.objective}>
              <View style={s.num}>
                <Text style={s.numText}>{i + 1}</Text>
              </View>
              <Text style={s.objectiveText}>{o}</Text>
            </View>
          ))}
        </Card>

        <Card>
          <View style={s.head}>
            <IconBadge name="person" tint={c.warning} size={34} />
            <Text style={s.h}>Who you’ll face</Text>
          </View>
          <Body>{m.aiCharacter}</Body>
          <Text style={s.muted}>They have their own goal — and they won’t tell you what it is.</Text>
        </Card>

        <View style={s.skills}>
          {m.skills.map((k) => (
            <Badge key={k} label={SKILL[k].label} icon={SKILL[k].icon} tone="accent" />
          ))}
          <Badge label={`~${formatMinutes(m.estimatedMinutes * 60)}`} icon="time-outline" />
        </View>

        <Text style={s.section}>Choose your level</Text>
        {MISSION_LEVELS.map(({ level: l, name }) => {
          const locked = l > p.unlockedLevel;
          const passed = p.passedLevels.includes(l);
          const selected = l === level;
          const best = p.bestScores[String(l)];
          return (
            <Pressable
              key={l}
              disabled={locked}
              onPress={() => setChosen(l)}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: locked }}
              accessibilityLabel={`Level ${l}, ${name}${locked ? ', locked' : ''}`}
              style={({ pressed }) => [s.level, selected && s.levelSelected, locked && s.levelLocked, pressed && s.pressed]}
            >
              <View style={[s.levelNum, passed && { backgroundColor: c.success }, selected && !passed && { backgroundColor: c.accent }]}>
                {passed ? <Ionicons name="checkmark" size={18} color="#fff" /> : <Text style={[s.levelNumText, (selected || passed) && { color: '#fff' }]}>{l}</Text>}
              </View>
              <View style={s.levelText}>
                <Text style={s.levelName}>{name}</Text>
                <Text style={s.muted}>{locked ? `Pass level ${l - 1} to unlock` : LEVEL_HINT[l]}</Text>
              </View>
              {locked ? <Ionicons name="lock-closed" size={18} color={c.textFaint} /> : best ? <Badge label={`Best ${best}`} tone="success" /> : null}
            </Pressable>
          );
        })}

        <ErrorText>{problem ?? (outOfTime ? 'You’ve used today’s free practice time. It resets at midnight.' : null)}</ErrorText>
        <ErrorText>{start.error ? friendlyError(start.error) : null}</ErrorText>
      </ScrollView>
      <View style={s.footer}>
        <Button
          label={`Start level ${level}`}
          icon="flag"
          onPress={() => start.mutate({ missionId: m.id, level })}
          loading={start.isPending}
          disabled={Boolean(problem) || outOfTime}
        />
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, gap: 16, paddingBottom: 24 },
    eyebrow: { color: c.text, opacity: 0.7, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
    title: { color: c.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    tagline: { color: c.textMuted, fontSize: 15, lineHeight: 21, maxWidth: '85%' },
    head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    h: { color: c.text, fontSize: 17, fontWeight: '800' },
    objective: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    num: { width: 24, height: 24, borderRadius: 12, backgroundColor: c.successSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    numText: { color: c.success, fontSize: 13, fontWeight: '800' },
    objectiveText: { color: c.text, fontSize: 15, lineHeight: 22, flex: 1 },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    skills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    section: { color: c.textMuted, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: 6 },
    level: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1.5, borderColor: c.border },
    levelSelected: { borderColor: c.accent, backgroundColor: c.accentSoft },
    levelLocked: { opacity: 0.55 },
    pressed: { opacity: 0.7 },
    levelNum: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
    levelNumText: { color: c.text, fontSize: 15, fontWeight: '800' },
    levelText: { flex: 1, gap: 2 },
    levelName: { color: c.text, fontSize: 16, fontWeight: '700' },
    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.bg },
  }),
);
