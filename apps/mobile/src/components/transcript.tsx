import Ionicons from '@expo/vector-icons/Ionicons';
import type { ConversationDetail, Feedback } from '@speakai/contracts';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MOMENT_NAME } from '@/components/feedback';
import { segment } from '@/lib/highlight';
import { makeStyles, radius, useColors } from '@/theme';

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
 * amber = could sound more natural); tapping the line shows the fixes right under it, and a
 * "Try this answer again" replay when available.
 */
export function TranscriptLine({
  turn,
  personaName,
  feedback,
  onReplay,
  replaying,
}: {
  turn: Turn;
  personaName: string;
  feedback: Feedback | null;
  onReplay?: () => void;
  replaying?: boolean;
}) {
  const styles = useStyles();
  const c = useColors();
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
      disabled={count === 0 && !onReplay}
      onPress={() => setOpen((o) => !o)}
      accessibilityRole={count || onReplay ? 'button' : undefined}
      accessibilityHint={count ? 'Shows the fixes for this line' : onReplay ? 'Shows the option to answer again' : undefined}
      style={[styles.bubble, isUser ? styles.user : styles.ai, count > 0 && styles.flagged]}
    >
      <View style={styles.head}>
        <Text style={styles.speaker}>{isUser ? 'You' : personaName}</Text>
        {count ? (
          <Text style={styles.badge}>{open ? 'hide' : `${count} ${count === 1 ? 'tip' : 'tips'} · tap`}</Text>
        ) : onReplay && !open ? (
          <Ionicons name="refresh" size={14} color={c.textFaint} />
        ) : null}
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
          {onReplay ? (
            <Pressable
              onPress={onReplay}
              disabled={replaying}
              accessibilityRole="button"
              style={({ pressed }) => [styles.replay, (pressed || replaying) && styles.pressed]}
            >
              <Ionicons name="refresh-circle" size={20} color={c.accent} />
              <Text style={styles.replayText}>{replaying ? 'Starting…' : 'Try this answer again'}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    bubble: { borderRadius: radius.lg, padding: 12, paddingHorizontal: 14, maxWidth: '88%' },
    ai: { backgroundColor: c.surface, alignSelf: 'flex-start', borderTopLeftRadius: 6, ...c.elevation },
    user: { backgroundColor: c.accentSoft, alignSelf: 'flex-end', borderTopRightRadius: 6 },
    flagged: { borderWidth: 1, borderColor: c.warning },
    head: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 4 },
    speaker: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
    badge: { color: c.warning, fontSize: 12, fontWeight: '800' },
    text: { color: c.text, fontSize: 16, lineHeight: 23 },
    markGrammar: { color: c.danger, textDecorationLine: 'underline', textDecorationColor: c.danger },
    markPhrasing: { color: c.warning, textDecorationLine: 'underline', textDecorationColor: c.warning },
    cut: { color: c.textMuted, fontSize: 13 },
    fixes: { marginTop: 10, paddingTop: 10, gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    fix: { gap: 2 },
    fixRight: { color: c.success, fontSize: 15, fontWeight: '700' },
    fixWhy: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    replay: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: c.surface, borderRadius: radius.pill, paddingVertical: 7, paddingHorizontal: 12 },
    replayText: { color: c.accent, fontSize: 14, fontWeight: '700' },
    pressed: { opacity: 0.6 },
    momentKind: { color: c.warning, fontSize: 12, fontWeight: '800' },
  }),
);
