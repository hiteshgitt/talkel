import Ionicons from '@expo/vector-icons/Ionicons';
import type { ConversationDetail, Feedback, MomentKind, SkillKey } from '@speakai/contracts';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { IconBadge, ScenarioArt } from '@/components/art';
import { Badge, Body, Button, Card, ProgressBar } from '@/components/ui';
import { Gauge } from '@/components/vector';
import { MissionResultCard } from '@/components/mission-result';
import { formatMinutes, useCatalog } from '@/lib/queries';
import type { IconName } from '@/lib/visuals';
import { makeStyles, type Palette, radius, useColors } from '@/theme';

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
    major: 'Major',
    minor: 'Minor',
    natural: 'Say it more naturally',
    naturalHint: 'Not wrong, but a fluent speaker would say it differently.',
    moments: 'Conversation moments',
    momentsHint: 'Replies you could handle better next time.',
    youSaid: 'You said',
    tryInstead: 'Try',
    transcriptHint: 'Mistakes are underlined in the transcript below. Tap your line to see the fixes.',
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
    major: 'बड़ी',
    minor: 'छोटी',
    natural: 'इसे और स्वाभाविक तरीके से कहें',
    naturalHint: 'गलत नहीं है, पर धाराप्रवाह बोलने वाले इसे ऐसे कहेंगे।',
    moments: 'बातचीत के पल',
    momentsHint: 'ऐसे जवाब जिन्हें अगली बार बेहतर कर सकते हैं।',
    youSaid: 'आपने कहा',
    tryInstead: 'ऐसे कहें',
    transcriptHint: 'नीचे ट्रांसक्रिप्ट में गलतियाँ रेखांकित हैं। सुधार देखने के लिए अपनी लाइन पर टैप करें।',
  },
} as const;

export const MOMENT_NAME: Record<'en' | 'hi', Record<MomentKind, string>> = {
  en: {
    TOO_SHORT: 'Too short',
    MISSED_QUESTION: 'Missed the question',
    NO_FOLLOW_UP: 'No follow-up',
    OFF_TOPIC: 'Off topic',
    ABRUPT_TONE: 'Sounds abrupt',
    UNCLEAR: 'Unclear',
  },
  hi: {
    TOO_SHORT: 'बहुत छोटा जवाब',
    MISSED_QUESTION: 'सवाल का जवाब नहीं',
    NO_FOLLOW_UP: 'बातचीत आगे नहीं बढ़ाई',
    OFF_TOPIC: 'विषय से हटकर',
    ABRUPT_TONE: 'रूखा लग सकता है',
    UNCLEAR: 'स्पष्ट नहीं',
  },
};

const SKILL_NAME: Record<'en' | 'hi', Record<SkillKey, string>> = {
  en: { grammar: 'Grammar', vocabulary: 'Vocabulary', fluency: 'Fluency', conversation: 'Conversation', clarity: 'Clarity' },
  hi: { grammar: 'ग्रामर', vocabulary: 'शब्दावली', fluency: 'धाराप्रवाह', conversation: 'बातचीत', clarity: 'स्पष्टता' },
};

const SKILL_ICON: Record<SkillKey, IconName> = {
  grammar: 'construct-outline',
  vocabulary: 'book-outline',
  fluency: 'water-outline',
  conversation: 'chatbubbles-outline',
  clarity: 'eye-outline',
};

/** Score colour: green when strong, accent in the middle, amber when there is work to do. */
export function scoreColor(score: number, c: Palette): string {
  return score >= 75 ? c.success : score >= 55 ? c.accent : c.warning;
}

export function FeedbackSection({ c, lang, onRetry, retrying }: { c: ConversationDetail; lang: 'en' | 'hi'; onRetry: () => void; retrying: boolean }) {
  const styles = useStyles();
  const colors = useColors();
  const t = T[c.feedback?.feedbackLanguage ?? lang];

  if (c.analysisStatus === 'PENDING' || c.analysisStatus === 'PROCESSING') {
    return (
      <Card style={styles.statusCard}>
        <ActivityIndicator color={colors.accent} />
        <View style={styles.flex}>
          <Text style={styles.h}>{t.preparing}</Text>
          <Body muted>{t.preparingHint}</Body>
        </View>
      </Card>
    );
  }
  if (c.analysisStatus === 'SKIPPED') {
    return (
      <Card style={styles.statusCard}>
        <Ionicons name="mic-off-outline" size={24} color={colors.textMuted} />
        <View style={styles.flex}>
          <Body muted>{t.skipped}</Body>
        </View>
      </Card>
    );
  }
  if (c.analysisStatus === 'FAILED' || !c.feedback) {
    return (
      <Card>
        <View style={styles.statusRow}>
          <Ionicons name="alert-circle-outline" size={24} color={colors.danger} />
          <View style={styles.flex}>
            <Body>{t.failed}</Body>
          </View>
        </View>
        <Button label={t.retry} icon="refresh" variant="secondary" onPress={onRetry} loading={retrying} />
      </Card>
    );
  }
  return <FeedbackView f={c.feedback} goals={c.goals} missionId={c.missionId} />;
}

/** Card heading: coloured icon badge, title and optional count. */
function Heading({ icon, tint, title, count }: { icon: IconName; tint: string; title: string; count?: number }) {
  const styles = useStyles();
  return (
    <View style={styles.heading}>
      <IconBadge name={icon} tint={tint} size={34} />
      <Text style={styles.h}>{title}</Text>
      {count ? <Text style={styles.count}>{count}</Text> : null}
    </View>
  );
}

function Item({ icon, color, children }: { icon: IconName; color: string; children: ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.itemRow}>
      <Ionicons name={icon} size={18} color={color} style={styles.itemIcon} />
      <Text style={styles.item}>{children}</Text>
    </View>
  );
}

function FeedbackView({ f, goals, missionId }: { f: Feedback; goals: ConversationDetail['goals']; missionId: string | null }) {
  const styles = useStyles();
  const c = useColors();
  const t = T[f.feedbackLanguage];
  const names = SKILL_NAME[f.feedbackLanguage];
  const catalog = useCatalog();
  const fillerList = Object.entries(f.fluency.fillerCounts);
  const overallColor = scoreColor(f.overallScore, c);

  return (
    <View style={styles.stack}>
      {f.mission ? <MissionResultCard r={f.mission} missionId={missionId} /> : null}
      <Card style={styles.hero}>
        <View style={styles.scoreRow}>
          <Gauge value={f.overallScore} size={84} stroke={9} color={overallColor} colorEnd={c.accent2} label={`${t.overall} ${f.overallScore}`} />
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>{t.overall}</Text>
            <Text style={styles.summary}>{f.summary}</Text>
          </View>
        </View>
      </Card>

      {f.strengths.length || f.focusAreas.length ? (
        <Card>
          {f.strengths.length ? <Heading icon="trophy-outline" tint={c.success} title={t.wellDone} /> : null}
          {f.strengths.map((x) => (
            <Item key={x} icon="checkmark-circle" color={c.success}>
              {x}
            </Item>
          ))}
          {f.focusAreas.length ? (
            <View style={styles.gap}>
              <Heading icon="locate-outline" tint={c.warning} title={t.focus} />
            </View>
          ) : null}
          {f.focusAreas.map((x) => (
            <Item key={x} icon="arrow-forward-circle" color={c.warning}>
              {x}
            </Item>
          ))}
        </Card>
      ) : null}

      <Card>
        <Heading icon="podium-outline" tint={c.accent} title={t.skills} />
        {(Object.keys(names) as SkillKey[]).map((k) => {
          const sk = f.skills[k];
          if (!sk) return null;
          const col = scoreColor(sk.score, c);
          return (
            <View key={k} style={styles.skill}>
              <View style={styles.skillTop}>
                <View style={styles.inline}>
                  <Ionicons name={SKILL_ICON[k]} size={16} color={c.textMuted} />
                  <Text style={styles.skillName}>{names[k]}</Text>
                </View>
                <Text style={[styles.skillScore, { color: col }]}>{sk.score}</Text>
              </View>
              <ProgressBar value={sk.score / 100} color={col} height={6} />
              <Text style={styles.muted}>{sk.rationale}</Text>
            </View>
          );
        })}
      </Card>

      <Card>
        <Heading icon="create-outline" tint={c.danger} title={t.corrections} count={f.grammarErrors.length} />
        {f.grammarErrors.length === 0 ? <Body muted>{t.noCorrections}</Body> : null}
        {f.grammarErrors.map((e, i) => (
          <View key={i} style={styles.correction}>
            <View style={styles.corrTop}>
              <Text style={[styles.wrong, styles.flex]}>{e.original}</Text>
              <Badge label={e.severity === 'LOW' ? t.minor : t.major} tone={e.severity === 'LOW' ? 'neutral' : 'danger'} />
            </View>
            <View style={styles.inline}>
              <Ionicons name="checkmark-circle" size={18} color={c.success} />
              <Text style={[styles.right, styles.flex]}>{e.corrected}</Text>
            </View>
            <Text style={styles.muted}>{e.explanation}</Text>
          </View>
        ))}
        {f.grammarErrors.length || f.phrasing.length ? (
          <View style={styles.hint}>
            <Ionicons name="hand-left-outline" size={16} color={c.accent} />
            <Text style={styles.hintText}>{t.transcriptHint}</Text>
          </View>
        ) : null}
      </Card>

      {f.phrasing.length ? (
        <Card>
          <Heading icon="sparkles-outline" tint={c.warning} title={t.natural} count={f.phrasing.length} />
          <Body muted>{t.naturalHint}</Body>
          {f.phrasing.map((p, i) => (
            <View key={i} style={styles.correction}>
              <Text style={styles.plain}>{p.original}</Text>
              <View style={styles.inline}>
                <Ionicons name="arrow-forward-circle" size={18} color={c.success} />
                <Text style={[styles.right, styles.flex]}>{p.better}</Text>
              </View>
              <Text style={styles.muted}>{p.why}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {f.conversationMoments.length ? (
        <Card>
          <Heading icon="people-outline" tint={c.accent} title={t.moments} count={f.conversationMoments.length} />
          <Body muted>{t.momentsHint}</Body>
          {f.conversationMoments.map((m, i) => (
            <View key={i} style={styles.correction}>
              <Badge label={MOMENT_NAME[f.feedbackLanguage][m.kind]} tone="warning" />
              <Text style={styles.muted}>
                {t.youSaid}: <Text style={styles.plain}>“{m.youSaid}”</Text>
              </Text>
              <View style={styles.inline}>
                <Ionicons name="chatbubble-ellipses" size={17} color={c.success} />
                <Text style={[styles.right, styles.flex]}>“{m.better}”</Text>
              </View>
              <Text style={styles.muted}>{m.why}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {f.vocabulary.length ? (
        <Card>
          <Heading icon="book-outline" tint={c.success} title={t.vocabulary} />
          {f.vocabulary.map((v, i) => (
            <View key={i} style={styles.vocab}>
              <View style={styles.inline}>
                <Ionicons name={v.kind === 'GOOD_USAGE' ? 'thumbs-up' : v.kind === 'REPEATED' ? 'repeat' : 'trending-up'} size={16} color={v.kind === 'GOOD_USAGE' ? c.success : c.accent} />
                <Text style={styles.term}>{v.term}</Text>
                {v.alternatives.length ? <Text style={styles.alts}>→ {v.alternatives.join(', ')}</Text> : null}
              </View>
              {v.example ? <Text style={styles.muted}>“{v.example}”</Text> : null}
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <Heading icon="pulse-outline" tint={c.accent} title={t.fluency} />
        <View style={styles.stats}>
          <Stat value={formatMinutes(Math.round(f.fluency.userSpeakingMs / 1000))} label={t.spoke} />
          {f.fluency.wordsPerMinute ? <Stat value={String(f.fluency.wordsPerMinute)} label={t.wpm} /> : null}
          {f.fluency.latencyP50Ms !== null ? <Stat value={`${(f.fluency.latencyP50Ms / 1000).toFixed(1)} s`} label={t.response} /> : null}
        </View>
        <Item icon="chatbox-ellipses-outline" color={c.textMuted}>
          {t.fillers}: {fillerList.length ? fillerList.map(([k, n]) => `“${k}” ×${n}`).join(', ') : t.noFillers}
        </Item>
      </Card>

      <Card>
        <Heading icon="flag-outline" tint={c.success} title={t.goals} />
        {goals.map((g) => (
          <Item key={g.id} icon={g.achieved ? 'checkmark-circle' : 'ellipse-outline'} color={g.achieved ? c.success : c.textFaint}>
            <Text style={!g.achieved ? styles.mutedItem : undefined}>{g.description}</Text>
          </Item>
        ))}
      </Card>

      {f.translationPatterns.length ? (
        <Card>
          <Heading icon="language-outline" tint={c.warning} title={t.translation} />
          {f.translationPatterns.map((p) => (
            <Item key={p} icon="bulb-outline" color={c.warning}>
              {p}
            </Item>
          ))}
        </Card>
      ) : null}

      {f.recommendations.length ? (
        <Card>
          <Heading icon="rocket-outline" tint={c.accent} title={t.next} />
          {f.recommendations.map((r, i) => {
            const scenario = r.scenarioSlug ? catalog.data?.scenarios.find((x) => x.slug === r.scenarioSlug) : undefined;
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
                    <ScenarioArt slug={scenario.slug} size={36} />
                    <Text style={styles.recButtonText}>
                      {t.tryIt}: {scenario.title}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={c.accent} />
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

function Stat({ value, label }: { value: string; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    stack: { gap: 16 },
    flex: { flex: 1 },
    statusCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    hero: { gap: 12, paddingVertical: 20 },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    eyebrow: { color: c.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    summary: { color: c.text, fontSize: 15, lineHeight: 22, marginTop: 2 },
    heading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
    h: { color: c.text, fontSize: 17, fontWeight: '800', flexShrink: 1 },
    count: { color: c.textMuted, fontSize: 14, fontWeight: '700', backgroundColor: c.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1, overflow: 'hidden' },
    gap: { marginTop: 10 },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    itemRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    itemIcon: { marginTop: 2 },
    item: { color: c.text, fontSize: 15, lineHeight: 22, flex: 1 },
    mutedItem: { color: c.textMuted },
    muted: { color: c.textMuted, fontSize: 14, lineHeight: 20 },
    skill: { gap: 6, marginTop: 8 },
    skillTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    skillName: { color: c.text, fontSize: 15, fontWeight: '700' },
    skillScore: { fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
    correction: { gap: 6, paddingTop: 12, marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    wrong: { color: c.danger, fontSize: 15, textDecorationLine: 'line-through' },
    right: { color: c.success, fontSize: 16, fontWeight: '700' },
    plain: { color: c.text, fontSize: 15 },
    corrTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    hint: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: c.accentSoft, borderRadius: radius.md, padding: 10, marginTop: 6 },
    hintText: { color: c.text, fontSize: 13, lineHeight: 18, flex: 1 },
    vocab: { gap: 3, marginTop: 6 },
    term: { color: c.text, fontSize: 15, fontWeight: '800' },
    alts: { color: c.textMuted, fontSize: 15 },
    stats: { flexDirection: 'row', gap: 10, marginVertical: 4 },
    stat: { flex: 1, backgroundColor: c.surfaceRaised, borderRadius: radius.md, padding: 12, gap: 2 },
    statValue: { color: c.text, fontSize: 18, fontWeight: '800' },
    statLabel: { color: c.textMuted, fontSize: 12, lineHeight: 16 },
    rec: { gap: 4, marginTop: 6 },
    recButton: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.accentSoft, borderRadius: radius.md, padding: 8, paddingRight: 12, marginTop: 6 },
    recButtonText: { color: c.accent, fontSize: 15, fontWeight: '700', flex: 1 },
    pressed: { opacity: 0.7 },
  }),
);
