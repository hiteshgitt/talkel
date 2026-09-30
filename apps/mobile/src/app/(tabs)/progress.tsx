import type { GrammarCategory } from '@speakai/contracts';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Button, Card, ErrorText, Loading, Title } from '@/components/ui';
import { api, friendlyError } from '@/lib/api';
import { formatMinutes } from '@/lib/queries';
import { colors } from '@/theme';

const MISTAKE: Record<GrammarCategory, string> = {
  VERB_TENSE: 'Verb tenses',
  SUBJECT_VERB_AGREEMENT: 'Subject–verb agreement (he goes / they go)',
  ARTICLES: 'Articles (a / an / the)',
  PREPOSITIONS: 'Prepositions (in / on / at / for)',
  WORD_ORDER: 'Word order',
  PLURALS: 'Plurals',
  PRONOUNS: 'Pronouns',
  QUESTION_FORM: 'Forming questions',
  VERB_FORM: 'Verb forms',
  WORD_CHOICE: 'Word choice',
  OTHER: 'Other',
};

const SKILLS = [
  ['grammar', 'Grammar'],
  ['vocabulary', 'Vocabulary'],
  ['fluency', 'Fluency'],
  ['conversation', 'Conversation'],
] as const;

export default function ProgressScreen() {
  const q = useQuery({ queryKey: ['progress'], queryFn: api.progress });

  if (q.isPending) return <Loading />;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.text} />}
      >
        <Title>Progress</Title>
        {q.isError ? <ErrorText>{friendlyError(q.error)}</ErrorText> : null}

        {q.data && q.data.analysedConversations === 0 ? (
          <Card>
            <Body>Your progress appears here after your first conversation with feedback.</Body>
            <Button label="Start practising" onPress={() => router.push('/practice')} />
          </Card>
        ) : null}

        {q.data && q.data.analysedConversations > 0 ? (
          <>
            <View style={styles.stats}>
              <Card style={styles.stat}>
                <Text style={styles.statValue}>{q.data.analysedConversations}</Text>
                <Text style={styles.statLabel}>conversations with feedback</Text>
              </Card>
              <Card style={styles.stat}>
                <Text style={styles.statValue}>{formatMinutes(Math.round(q.data.totalSpeakingMs / 1000))}</Text>
                <Text style={styles.statLabel}>you spoke in total</Text>
              </Card>
            </View>

            <Card>
              <Text style={styles.h}>Your skills</Text>
              <Body muted>Recent conversations count more.</Body>
              {SKILLS.map(([key, label]) => {
                const v = q.data.skills[key];
                return (
                  <View key={key} style={styles.skill}>
                    <View style={styles.row}>
                      <Text style={styles.skillName}>{label}</Text>
                      <Text style={styles.skillScore}>{v ?? '—'}</Text>
                    </View>
                    <View style={styles.bar}>
                      <View style={[styles.fill, { width: `${v ?? 0}%` }]} />
                    </View>
                  </View>
                );
              })}
            </Card>

            {q.data.commonMistakes.length ? (
              <Card>
                <Text style={styles.h}>Mistakes you make most</Text>
                <Body muted>Your conversations will naturally give you chances to practise these.</Body>
                {q.data.commonMistakes.map((m) => (
                  <View key={m.category} style={styles.row}>
                    <Text style={styles.item}>{MISTAKE[m.category]}</Text>
                    <Text style={styles.count}>×{m.count}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {q.data.recentCorrections.length ? (
              <Card>
                <Text style={styles.h}>Recent corrections</Text>
                {q.data.recentCorrections.map((c, i) => (
                  <View key={i} style={styles.correction}>
                    <Text style={styles.wrong}>{c.original}</Text>
                    <Text style={styles.right}>{c.corrected}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {q.data.commonFillers.length ? (
              <Card>
                <Text style={styles.h}>Filler words</Text>
                <Text style={styles.item}>{q.data.commonFillers.map((f) => `“${f.word}” ×${f.count}`).join(' · ')}</Text>
              </Card>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, gap: 4 },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 13 },
  h: { color: colors.text, fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  item: { color: colors.text, fontSize: 15, lineHeight: 22, flexShrink: 1 },
  count: { color: colors.textMuted, fontSize: 14, fontVariant: ['tabular-nums'] },
  skill: { gap: 6, marginTop: 8 },
  skillName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  skillScore: { color: colors.textMuted, fontSize: 14, fontVariant: ['tabular-nums'] },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.accent },
  correction: { gap: 2, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  wrong: { color: colors.danger, fontSize: 15, textDecorationLine: 'line-through' },
  right: { color: colors.userSpeaking, fontSize: 15, fontWeight: '600' },
});
