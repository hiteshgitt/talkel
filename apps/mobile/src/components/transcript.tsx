import type { ConversationDetail, Feedback } from '@speakai/contracts';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MOMENT_NAME } from '@/components/feedback';
import { segment } from '@/lib/highlight';
import { colors, radius } from '@/theme';

type Turn = ConversationDetail['turns'][number];
type MarkKind = 'grammar' | 'phrasing';

/** Feedback items that belong to one learner line. */
function fixesFor(f: Feedback | null, seq: number) {
  return {
    grammar: f?.grammarErrors.filter((e) => e.turnSeq === seq) ?? [],
    phrasing: f?.phrasing.filter((p) => p.turnSeq === seq) ?? [],
    moments: f?.conversationMoments.filter((m) => m.turnSeq === seq) ?? [],
  };
}

/**
 * One transcript line. The learner's lines underline what the feedback quotes (red = mistake,
 * amber = could sound more natural); tapping the line shows the fixes right under it.
 */
export function TranscriptLine({ turn, personaName, feedback }: { turn: Turn; personaName: string; feedback: Feedback | null }) {
  const [open, setOpen] = useState(false);
  const isUser = turn.speaker === 'USER';
  const fixes = fixesFor(isUser ? feedback : null, turn.seq);
  const count = fixes.grammar.length + fixes.phrasing.length + fixes.moments.length;
  const segments = segment<MarkKind>(turn.text || '…', [
    ...fixes.grammar.map((e) => ({ quote: e.original, kind: 'grammar' as const })),
    ...fixes.phrasing.map((p) => ({ quote: p.original, kind: 'phrasing' as const })),
  ]);
  const lang = feedback?.feedbackLanguage ?? 'en';

  return (
    <Pressable
      disabled={count === 0}
      onPress={() => setOpen((o) => !o)}
      accessibilityRole={count ? 'button' : undefined}
      accessibilityHint={count ? 'Shows the fixes for this line' : undefined}
      style={[styles.bubble, isUser ? styles.user : styles.ai, count > 0 && styles.flagged]}
    >
      <View style={styles.head}>
        <Text style={styles.speaker}>{isUser ? 'You' : personaName}</Text>
        {count ? <Text style={styles.badge}>{open ? 'hide' : `${count} ${count === 1 ? 'tip' : 'tips'} · tap`}</Text> : null}
      </View>
      <Text style={styles.text}>
        {segments.map((s, i) =>
          s.kind ? (
            <Text key={i} style={s.kind === 'grammar' ? styles.markGrammar : styles.markPhrasing}>
              {s.text}
            </Text>
          ) : (
            s.text
          ),
        )}
        {turn.interrupted ? <Text style={styles.cut}> — (interrupted)</Text> : null}
      </Text>

      {open ? (
        <View style={styles.fixes}>
          {fixes.grammar.map((e, i) => (
            <View key={`g${i}`} style={styles.fix}>
              <Text style={styles.fixRight}>✓ {e.corrected}</Text>
              <Text style={styles.fixWhy}>{e.explanation}</Text>
            </View>
          ))}
          {fixes.phrasing.map((p, i) => (
            <View key={`p${i}`} style={styles.fix}>
              <Text style={styles.fixRight}>→ {p.better}</Text>
              <Text style={styles.fixWhy}>{p.why}</Text>
            </View>
          ))}
          {fixes.moments.map((m, i) => (
            <View key={`m${i}`} style={styles.fix}>
              <Text style={styles.momentKind}>{MOMENT_NAME[lang][m.kind]}</Text>
              <Text style={styles.fixRight}>“{m.better}”</Text>
              <Text style={styles.fixWhy}>{m.why}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: { borderRadius: radius.md, padding: 12, maxWidth: '88%' },
  ai: { backgroundColor: colors.surface, alignSelf: 'flex-start' },
  user: { backgroundColor: colors.surfaceRaised, alignSelf: 'flex-end' },
  flagged: { borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
  speaker: { color: colors.textMuted, fontSize: 12 },
  badge: { color: colors.warning, fontSize: 12, fontWeight: '700' },
  text: { color: colors.text, fontSize: 16, lineHeight: 22 },
  markGrammar: { color: colors.danger, textDecorationLine: 'underline', textDecorationColor: colors.danger },
  markPhrasing: { color: colors.warning, textDecorationLine: 'underline', textDecorationColor: colors.warning },
  cut: { color: colors.textMuted, fontSize: 13 },
  fixes: { marginTop: 8, paddingTop: 8, gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  fix: { gap: 2 },
  fixRight: { color: colors.userSpeaking, fontSize: 15, fontWeight: '600' },
  fixWhy: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  momentKind: { color: colors.warning, fontSize: 12, fontWeight: '700' },
});
