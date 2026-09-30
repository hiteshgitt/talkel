import type { ConversationDetail, Feedback, SkillKey } from '@speakai/contracts';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card } from '@/components/ui';
import { formatMinutes, useCatalog } from '@/lib/queries';
import { colors, radius } from '@/theme';

/** Labels in the feedback language, so a Hindi-feedback user sees Hindi section titles too. */
const T = {
  en: {
    preparing: 'Preparing your feedback…',
    preparingHint: 'This usually takes under a minute. You can leave this screen.',
    skipped: 'Not enough speech in this call to give feedback. Talk a little longer next time!',
    failed: 'We couldn’t prepare feedback for this call.',
    retry: 'Try again',
    overall: 'Overall',
    wellDone: 'What went well',
    focus: 'Focus next time',
    skills: 'Skills',
    corrections: 'Corrections',
    noCorrections: 'No important grammar mistakes found. Nice!',
    vocabulary: 'Vocabulary',
    fluency: 'Fluency',
    goals: 'Goals',
    translation: 'Sounding natural',
    next: 'Practise next',
    wpm: 'words per minute',
    spoke: 'You spoke for',
    fillers: 'Filler words',
    noFillers: 'none found',
    response: 'Typical time to start answering',
    tryIt: 'Start',
  },
  hi: {
    preparing: 'आपका फ़ीडबैक तैयार हो रहा है…',
    preparingHint: 'आमतौर पर एक मिनट से कम लगता है। आप यह स्क्रीन छोड़ सकते हैं।',
    skipped: 'इस कॉल में फ़ीडबैक के लिए पर्याप्त बातचीत नहीं हुई। अगली बार थोड़ा और बोलिए!',
    failed: 'इस कॉल का फ़ीडबैक तैयार नहीं हो सका।',
    retry: 'फिर से कोशिश करें',
    overall: 'कुल स्कोर',
    wellDone: 'क्या अच्छा रहा',
    focus: 'अगली बार ध्यान दें',
    skills: 'कौशल',
    corrections: 'सुधार',
    noCorrections: 'कोई बड़ी ग्रामर गलती नहीं मिली। बहुत बढ़िया!',
    vocabulary: 'शब्दावली',
    fluency: 'धाराप्रवाह',
    goals: 'लक्ष्य',
    translation: 'स्वाभाविक अंग्रेज़ी',
    next: 'आगे अभ्यास करें',
    wpm: 'शब्द प्रति मिनट',
    spoke: 'आप बोले',
    fillers: 'फ़िलर शब्द',
    noFillers: 'कोई नहीं मिला',
    response: 'जवाब शुरू करने में आम समय',
    tryIt: 'शुरू करें',
  },
} as const;

const SKILL_NAME: Record<'en' | 'hi', Record<SkillKey, string>> = {
  en: { grammar: 'Grammar', vocabulary: 'Vocabulary', fluency: 'Fluency', conversation: 'Conversation', clarity: 'Clarity' },
  hi: { grammar: 'ग्रामर', vocabulary: 'शब्दावली', fluency: 'धाराप्रवाह', conversation: 'बातचीत', clarity: 'स्पष्टता' },
};

export function FeedbackSection({ c, lang, onRetry, retrying }: { c: ConversationDetail; lang: 'en' | 'hi'; onRetry: () => void; retrying: boolean }) {
  const t = T[c.feedback?.feedbackLanguage ?? lang];

  if (c.analysisStatus === 'PENDING' || c.analysisStatus === 'PROCESSING') {
    return (
      <Card>
        <Text style={styles.h}>{t.preparing}</Text>
        <Body muted>{t.preparingHint}</Body>
      </Card>
    );
  }
  if (c.analysisStatus === 'SKIPPED') {
    return (
      <Card>
        <Body muted>{t.skipped}</Body>
      </Card>
    );
  }
  if (c.analysisStatus === 'FAILED' || !c.feedback) {
    return (
      <Card>
        <Body>{t.failed}</Body>
        <Button label={t.retry} variant="secondary" onPress={onRetry} loading={retrying} />
      </Card>
    );
  }
  return <FeedbackView f={c.feedback} goals={c.goals} />;
}

function FeedbackView({ f, goals }: { f: Feedback; goals: ConversationDetail['goals'] }) {
  const t = T[f.feedbackLanguage];
  const names = SKILL_NAME[f.feedbackLanguage];
  const catalog = useCatalog();
  const fillerList = Object.entries(f.fluency.fillerCounts);

  return (
    <View style={styles.stack}>
      <Card style={styles.hero}>
        <View style={styles.scoreRow}>
          <View style={styles.scoreBubble}>
            <Text style={styles.score}>{f.overallScore}</Text>
          </View>
          <Text style={styles.h}>{t.overall}</Text>
        </View>
        <Body>{f.summary}</Body>
      </Card>

      {f.strengths.length || f.focusAreas.length ? (
        <Card>
          {f.strengths.length ? <Text style={styles.h}>{t.wellDone}</Text> : null}
          {f.strengths.map((s) => (
            <Text key={s} style={styles.item}>✓ {s}</Text>
          ))}
          {f.focusAreas.length ? <Text style={[styles.h, styles.gap]}>{t.focus}</Text> : null}
          {f.focusAreas.map((s) => (
            <Text key={s} style={styles.item}>→ {s}</Text>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.h}>{t.skills}</Text>
        {(Object.keys(names) as SkillKey[]).map((k) => {
          const s = f.skills[k];
          if (!s) return null;
          return (
            <View key={k} style={styles.skill}>
              <View style={styles.skillTop}>
                <Text style={styles.skillName}>{names[k]}</Text>
                <Text style={styles.skillScore}>{s.score}</Text>
              </View>
              <View style={styles.bar}>
                <View style={[styles.fill, { width: `${s.score}%` }]} />
              </View>
              <Text style={styles.muted}>{s.rationale}</Text>
            </View>
          );
        })}
      </Card>

      <Card>
        <Text style={styles.h}>{t.corrections}</Text>
        {f.grammarErrors.length === 0 ? <Body muted>{t.noCorrections}</Body> : null}
        {f.grammarErrors.map((e, i) => (
          <View key={i} style={styles.correction}>
            <Text style={styles.wrong}>{e.original}</Text>
            <Text style={styles.right}>{e.corrected}</Text>
            <Text style={styles.muted}>{e.explanation}</Text>
          </View>
        ))}
      </Card>

      {f.vocabulary.length ? (
        <Card>
          <Text style={styles.h}>{t.vocabulary}</Text>
          {f.vocabulary.map((v, i) => (
            <View key={i} style={styles.vocab}>
              <Text style={styles.item}>
                {v.kind === 'GOOD_USAGE' ? '👍 ' : ''}
                <Text style={styles.term}>{v.term}</Text>
                {v.alternatives.length ? `  →  ${v.alternatives.join(', ')}` : ''}
              </Text>
              {v.example ? <Text style={styles.muted}>“{v.example}”</Text> : null}
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.h}>{t.fluency}</Text>
        <Text style={styles.item}>
          {t.spoke}: {formatMinutes(Math.round(f.fluency.userSpeakingMs / 1000))}
          {f.fluency.wordsPerMinute ? ` · ${f.fluency.wordsPerMinute} ${t.wpm}` : ''}
        </Text>
        <Text style={styles.item}>
          {t.fillers}: {fillerList.length ? fillerList.map(([k, n]) => `“${k}” ×${n}`).join(', ') : t.noFillers}
        </Text>
        {f.fluency.latencyP50Ms !== null ? (
          <Text style={styles.item}>
            {t.response}: {(f.fluency.latencyP50Ms / 1000).toFixed(1)} s
          </Text>
        ) : null}
      </Card>

      <Card>
        <Text style={styles.h}>{t.goals}</Text>
        {goals.map((g) => (
          <Text key={g.id} style={[styles.item, !g.achieved && styles.mutedItem]}>
            {g.achieved ? '✅ ' : '⬜ '}
            {g.description}
          </Text>
        ))}
      </Card>

      {f.translationPatterns.length ? (
        <Card>
          <Text style={styles.h}>{t.translation}</Text>
          {f.translationPatterns.map((p) => (
            <Text key={p} style={styles.item}>• {p}</Text>
          ))}
        </Card>
      ) : null}

      {f.recommendations.length ? (
        <Card>
          <Text style={styles.h}>{t.next}</Text>
          {f.recommendations.map((r, i) => {
            const scenario = r.scenarioSlug ? catalog.data?.scenarios.find((s) => s.slug === r.scenarioSlug) : undefined;
            return (
              <View key={i} style={styles.rec}>
                <Text style={styles.term}>{r.title}</Text>
                <Text style={styles.muted}>{r.reason}</Text>
                {scenario ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push({ pathname: '/scenario/[id]', params: { id: scenario.id } })}
                    style={({ pressed }) => [styles.recButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.recButtonText}>
                      {t.tryIt}: {scenario.title}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  hero: { gap: 12 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  scoreBubble: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: { color: colors.text, fontSize: 24, fontWeight: '800' },
  h: { color: colors.text, fontSize: 17, fontWeight: '700' },
  gap: { marginTop: 8 },
  item: { color: colors.text, fontSize: 15, lineHeight: 22 },
  mutedItem: { color: colors.textMuted },
  muted: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  skill: { gap: 6, marginTop: 6 },
  skillTop: { flexDirection: 'row', justifyContent: 'space-between' },
  skillName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  skillScore: { color: colors.textMuted, fontSize: 14, fontVariant: ['tabular-nums'] },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colors.accent },
  correction: { gap: 4, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  wrong: { color: colors.danger, fontSize: 15, textDecorationLine: 'line-through' },
  right: { color: colors.userSpeaking, fontSize: 16, fontWeight: '600' },
  vocab: { gap: 2, marginTop: 4 },
  term: { color: colors.text, fontSize: 15, fontWeight: '700' },
  rec: { gap: 4, marginTop: 6 },
  recButton: { alignSelf: 'flex-start', backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14, marginTop: 4 },
  recButtonText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
