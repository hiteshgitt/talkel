import Ionicons from '@expo/vector-icons/Ionicons';
import type { ConversationDetail } from '@speakai/contracts';
import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { scoreColor } from '@/components/feedback';
import { Body, Button, Card } from '@/components/ui';
import { Gauge } from '@/components/vector';
import { useStartReplay } from '@/lib/replay';
import { makeStyles, radius, useColors } from '@/theme';

type Replay = NonNullable<ConversationDetail['replay']>;

/** "Try that answer again": first vs second answer, what improved, and a stronger answer. */
export function ReplayResultCard({ r, status }: { r: Replay; status: ConversationDetail['analysisStatus'] }) {
  const s = useStyles();
  const c = useColors();
  const again = useStartReplay(r.originalId);
  const back = () => router.replace({ pathname: '/conversation/[id]', params: { id: r.originalId } });

  const actions = (
    <View style={s.actions}>
      <Button label="Try it again" icon="refresh" onPress={() => again.mutate(r.turnSeq)} loading={again.isPending} />
      <Button label="Back to the conversation" variant="secondary" onPress={back} />
    </View>
  );

  if (!r.result) {
    return (
      <Card>
        <Question text={r.question} />
        {status === 'PENDING' || status === 'PROCESSING' ? (
          <View style={s.pending}>
            <ActivityIndicator color={c.accent} />
            <Body muted>Comparing your two answers…</Body>
          </View>
        ) : (
          <Body muted>{status === 'SKIPPED' ? 'We didn’t catch an answer this time. Give it another go!' : 'We couldn’t compare the answers this time.'}</Body>
        )}
        {status !== 'PENDING' && status !== 'PROCESSING' ? actions : null}
      </Card>
    );
  }

  const res = r.result;
  const change = res.secondScore - res.firstScore;
  return (
    <Card style={s.card}>
      <Question text={r.question} />
      <View style={s.compare}>
        <View style={s.side}>
          <Gauge value={res.firstScore} size={72} stroke={7} color={scoreColor(res.firstScore, c)} />
          <Text style={s.sideLabel}>First try</Text>
        </View>
        <View style={s.arrow}>
          <Ionicons name="arrow-forward" size={22} color={c.textFaint} />
          <Text style={[s.change, { color: change > 0 ? c.success : change < 0 ? c.danger : c.textMuted }]}>
            {change > 0 ? `+${change}` : change === 0 ? 'same' : change}
          </Text>
        </View>
        <View style={s.side}>
          <Gauge value={res.secondScore} size={72} stroke={7} color={scoreColor(res.secondScore, c)} colorEnd={c.accent2} />
          <Text style={s.sideLabel}>This try</Text>
        </View>
      </View>

      <Attempt label="First try" text={r.originalAnswer} comment={res.firstComment} />
      <Attempt label="This try" text={r.newAnswer ?? ''} comment={res.secondComment} />

      <Point icon="trending-up" color={c.success} title="What improved" text={res.improved} />
      <Point icon="locate" color={c.warning} title="Work on next" text={res.stillToWork} />
      <View style={s.better}>
        <Text style={s.betterLabel}>A stronger answer</Text>
        <Text style={s.betterText}>“{res.betterAnswer}”</Text>
      </View>
      {actions}
    </Card>
  );
}

function Question({ text }: { text: string }) {
  const s = useStyles();
  return (
    <View style={s.question}>
      <Text style={s.qLabel}>The question</Text>
      <Text style={s.qText}>“{text}”</Text>
    </View>
  );
}

function Attempt({ label, text, comment }: { label: string; text: string; comment: string }) {
  const s = useStyles();
  return (
    <View style={s.attempt}>
      <Text style={s.attemptLabel}>{label}</Text>
      <Text style={s.attemptText}>{text || '…'}</Text>
      <Text style={s.muted}>{comment}</Text>
    </View>
  );
}

function Point({ icon, color, title, text }: { icon: React.ComponentProps<typeof Ionicons>['name']; color: string; title: string; text: string }) {
  const s = useStyles();
  return (
    <View style={s.point}>
      <Ionicons name={icon} size={18} color={color} style={s.pointIcon} />
      <View style={s.flex}>
        <Text style={s.pointTitle}>{title}</Text>
        <Text style={s.pointText}>{text}</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    card: { gap: 14 },
    flex: { flex: 1 },
    question: { backgroundColor: c.surfaceRaised, borderRadius: radius.md, padding: 12, gap: 4 },
    qLabel: { color: c.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    qText: { color: c.text, fontSize: 15, lineHeight: 22, fontStyle: 'italic' },
    pending: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
    compare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 4 },
    side: { alignItems: 'center', gap: 6 },
    sideLabel: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
    arrow: { alignItems: 'center', gap: 2 },
    change: { fontSize: 18, fontWeight: '900' },
    attempt: { gap: 3, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    attemptLabel: { color: c.textMuted, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    attemptText: { color: c.text, fontSize: 15, lineHeight: 22 },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    pointIcon: { marginTop: 2 },
    pointTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
    pointText: { color: c.text, fontSize: 14, lineHeight: 20 },
    better: { backgroundColor: c.successSoft, borderRadius: radius.md, padding: 12, gap: 4 },
    betterLabel: { color: c.success, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    betterText: { color: c.text, fontSize: 15, lineHeight: 22, fontWeight: '600' },
    actions: { gap: 8 },
  }),
);
