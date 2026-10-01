import type { ConfidenceIndicator, ConfidenceKey, Progress } from '@speakai/contracts';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MiniBars, PracticeCalendar, TrendBadge } from '@/components/progress-charts';
import { Body, Button, Card, ErrorText, Loading, Title } from '@/components/ui';
import { api, friendlyError } from '@/lib/api';
import { MISTAKE_LABEL } from '@/lib/labels';
import { formatMinutes } from '@/lib/queries';
import { colors } from '@/theme';

const SKILLS = [
  ['grammar', 'Grammar'],
  ['vocabulary', 'Vocabulary'],
  ['fluency', 'Fluency'],
  ['conversation', 'Conversation'],
  ['clarity', 'Clarity'],
] as const;

type SkillKey = (typeof SKILLS)[number][0];

/** How each confidence signal is named and shown (PRD §28: explain the basis, no fake precision). */
const CONFIDENCE: Record<ConfidenceKey, { label: string; format: (v: number) => string }> = {
  RESPONSE_SPEED: { label: 'Time to start answering', format: (v) => `${v.toFixed(1)} s` },
  ANSWER_LENGTH: { label: 'Words per answer', format: (v) => `${Math.round(v)} words` },
  LONG_PAUSES: { label: 'Long pauses while speaking', format: (v) => `${v.toFixed(1)} per min` },
  FILLERS: { label: 'Filler words (um, like…)', format: (v) => `${v.toFixed(1)} per min` },
  ASKING_QUESTIONS: {
    label: 'Asking questions back',
    format: (v) => (v >= 0.67 ? 'most calls' : v > 0 ? 'some calls' : 'not yet'),
  },
};

export default function ProgressScreen() {
  const q = useQuery({ queryKey: ['progress'], queryFn: api.progress });
  const { refetch } = q;
  // New feedback arrives in the background; refresh whenever the tab is opened.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (q.isPending) return <Loading />;
  const p = q.data;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.text} />}
      >
        <Title>Progress</Title>
        {q.isError ? <ErrorText>{friendlyError(q.error)}</ErrorText> : null}

        {p && p.analysedConversations === 0 ? (
          <>
            {p.calendar.some((d) => d.seconds > 0) ? <PracticeCard p={p} /> : null}
            <Card>
              <Body>Your skills, confidence and common mistakes appear here after your first conversation with feedback.</Body>
              <Button label="Start practising" onPress={() => router.push('/practice')} />
            </Card>
          </>
        ) : null}

        {p && p.analysedConversations > 0 ? (
          <>
            <View style={styles.stats}>
              <Stat value={`${p.streak.current}${p.streak.current ? ' 🔥' : ''}`} label={p.streak.current === 1 ? 'day streak' : 'days streak'} />
              <Stat value={String(p.analysedConversations)} label="conversations" />
              <Stat value={formatMinutes(Math.round(p.totalSpeakingMs / 1000))} label="you spoke" />
            </View>

            <PracticeCard p={p} />

            <OverallCard p={p} />
            <SkillsCard p={p} />
            <ConfidenceCard indicators={p.confidence} />

            {p.commonMistakes.length ? (
              <Card>
                <Text style={styles.h}>Mistakes you make most</Text>
                <Body muted>Tap one to review every example. Your conversations will give you chances to practise these.</Body>
                {p.commonMistakes.map((m) => (
                  <Pressable
                    key={m.category}
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/mistakes/[category]', params: { category: m.category } })}
                    style={({ pressed }) => [styles.mistake, pressed && styles.pressed]}
                  >
                    <Text style={styles.item}>{MISTAKE_LABEL[m.category]}</Text>
                    <View style={styles.mistakeRight}>
                      <TrendBadge trend={m.trend} labels={{ BETTER: '↓ fewer', WORSE: '↑ more', STEADY: '→ same' }} />
                      <Text style={styles.count}>×{m.count}</Text>
                      <Text style={styles.chevron}>›</Text>
                    </View>
                  </Pressable>
                ))}
              </Card>
            ) : null}

            {p.recentCorrections.length ? (
              <Card>
                <Text style={styles.h}>Recent corrections</Text>
                {p.recentCorrections.map((c, i) => (
                  <View key={i} style={styles.correction}>
                    <Text style={styles.wrong}>{c.original}</Text>
                    <Text style={styles.right}>{c.corrected}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {p.commonFillers.length ? (
              <Card>
                <Text style={styles.h}>Filler words</Text>
                <Text style={styles.item}>{p.commonFillers.map((f) => `“${f.word}” ×${f.count}`).join(' · ')}</Text>
              </Card>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

function PracticeCard({ p }: { p: Progress }) {
  return (
    <Card>
      <View style={styles.row}>
        <Text style={styles.h}>Practice</Text>
        <Text style={styles.muted}>
          {p.streak.current} {p.streak.current === 1 ? 'day' : 'days'} streak{p.streak.current ? ' 🔥' : ''} · best {p.streak.longest}
        </Text>
      </View>
      {!p.streak.practisedToday && p.streak.current > 0 ? <Body muted>Practise today to keep your streak going.</Body> : null}
      <PracticeCalendar days={p.calendar} />
    </Card>
  );
}

function OverallCard({ p }: { p: Progress }) {
  const h = p.history;
  const last = h.at(-1);
  if (!last) return null;
  return (
    <Card>
      <View style={styles.row}>
        <Text style={styles.h}>Overall score</Text>
        <Text style={styles.big}>{last.overall}</Text>
      </View>
      <Body muted>
        {h.length > 1 ? `Your last ${h.length} conversations. Tap a bar to open it.` : 'Your score in each conversation will appear here.'}
      </Body>
      <MiniBars
        values={h.map((x) => x.overall)}
        onPress={(i) => router.push({ pathname: '/conversation/[id]', params: { id: h[i]!.conversationId } })}
      />
    </Card>
  );
}

function SkillsCard({ p }: { p: Progress }) {
  return (
    <Card>
      <Text style={styles.h}>Your skills</Text>
      <Body muted>Recent conversations count more.</Body>
      {SKILLS.map(([key, label]) => {
        const v = p.skills[key];
        const series = p.history.map((x) => x.skills[key as SkillKey]).filter((x): x is number => x !== null);
        const change = series.length >= 2 ? series.at(-1)! - series[0]! : null;
        return (
          <View key={key} style={styles.skill}>
            <View style={styles.row}>
              <Text style={styles.skillName}>{label}</Text>
              <Text style={styles.skillScore}>
                {change ? <Text style={{ color: change > 0 ? colors.userSpeaking : colors.danger }}>{change > 0 ? `+${change}` : change}  </Text> : null}
                {v ?? '—'}
              </Text>
            </View>
            <View style={styles.bar}>
              <View style={[styles.fill, { width: `${v ?? 0}%` }]} />
            </View>
            {series.length >= 2 ? <MiniBars values={series} height={22} /> : null}
          </View>
        );
      })}
    </Card>
  );
}

function ConfidenceCard({ indicators }: { indicators: ConfidenceIndicator[] }) {
  const shown = indicators.filter((i) => i.recent !== null);
  if (!shown.length) return null;
  const comparing = shown.some((i) => i.trend !== null);
  return (
    <Card>
      <Text style={styles.h}>Speaking confidence</Text>
      <Body muted>
        {comparing
          ? 'Signs of confidence we can measure: your last 3 conversations compared with the 3 before.'
          : 'Signs of confidence we can measure. After a few more conversations you’ll see how they change.'}
      </Body>
      {shown.map((i) => {
        const c = CONFIDENCE[i.key];
        return (
          <View key={i.key} style={styles.indicator}>
            <View style={styles.row}>
              <Text style={styles.skillName}>{c.label}</Text>
              <TrendBadge trend={i.trend} />
            </View>
            <Text style={styles.muted}>
              {i.earlier !== null && i.trend && i.trend !== 'STEADY' ? `${c.format(i.earlier)} → ` : ''}
              <Text style={styles.value}>{c.format(i.recent!)}</Text>
            </Text>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16 },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, gap: 4, paddingHorizontal: 12 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 12 },
  h: { color: colors.text, fontSize: 17, fontWeight: '700' },
  big: { color: colors.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  item: { color: colors.text, fontSize: 15, lineHeight: 22, flexShrink: 1 },
  muted: { color: colors.textMuted, fontSize: 14 },
  value: { color: colors.text, fontWeight: '700' },
  count: { color: colors.textMuted, fontSize: 14, fontVariant: ['tabular-nums'] },
  chevron: { color: colors.textMuted, fontSize: 20 },
  mistake: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingVertical: 6 },
  mistakeRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pressed: { opacity: 0.6 },
  skill: { gap: 6, marginTop: 8 },
  indicator: { gap: 2, marginTop: 8 },
  skillName: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  skillScore: { color: colors.textMuted, fontSize: 14, fontVariant: ['tabular-nums'] },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.accent },
  correction: { gap: 2, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  wrong: { color: colors.danger, fontSize: 15, textDecorationLine: 'line-through' },
  right: { color: colors.userSpeaking, fontSize: 15, fontWeight: '600' },
});
