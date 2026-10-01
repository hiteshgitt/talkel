import Ionicons from '@expo/vector-icons/Ionicons';
import type { MissionResult } from '@speakai/contracts';
import { StyleSheet, Text, View } from 'react-native';
import { Gradient } from '@/components/gradient';
import { Button, Card, ProgressBar } from '@/components/ui';
import { Gauge } from '@/components/vector';
import { levelName, SKILL, useStartMission } from '@/lib/missions';
import { makeStyles, radius, useColors } from '@/theme';

const VERDICT = {
  SUCCESS: { title: 'Mission complete', icon: 'trophy' as const },
  PARTIAL: { title: 'Almost there', icon: 'flag' as const },
  FAILED: { title: 'Mission failed', icon: 'refresh-circle' as const },
};

/** The mission verdict: outcome, score, objectives, mission skills, and retry / next level. */
export function MissionResultCard({ r, missionId }: { r: MissionResult; missionId: string | null }) {
  const s = useStyles();
  const c = useColors();
  const start = useStartMission();
  const v = VERDICT[r.result];
  const tone = r.result === 'SUCCESS' ? [c.success, '#14B8A6'] : r.result === 'PARTIAL' ? [c.accent, c.accent2] : ['#F97316', c.danger];
  const nextLevel = r.passed && r.level < 5 ? r.level + 1 : null;

  return (
    <Card style={s.card}>
      <Gradient colors={[tone[0]!, tone[1]!]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.banner}>
        <View style={s.bannerTop}>
          <Ionicons name={v.icon} size={22} color="#fff" />
          <Text style={s.level}>
            Level {r.level} · {levelName(r.level)}
          </Text>
        </View>
        <Text style={s.verdict}>{v.title}</Text>
        <Text style={s.headline}>{r.headline}</Text>
      </Gradient>

      <View style={s.body}>
        {r.reason ? <Text style={s.reason}>{r.reason}</Text> : null}
        <View style={s.scoreRow}>
          <Gauge value={r.missionScore} size={76} stroke={8} color={tone[0]!} colorEnd={tone[1]!} label={`Mission score ${r.missionScore}`} />
          <View style={s.scoreText}>
            <Text style={s.scoreTitle}>Mission score</Text>
            <Text style={s.muted}>
              Objectives {r.objectivesAchieved} of {r.objectivesTotal}, plus how well you communicated.
            </Text>
          </View>
        </View>
        {r.skills.map((sk) => (
          <View key={sk.key} style={s.skill}>
            <View style={s.skillTop}>
              <View style={s.inline}>
                <Ionicons name={SKILL[sk.key].icon} size={16} color={c.textMuted} />
                <Text style={s.skillName}>{SKILL[sk.key].label}</Text>
              </View>
              <Text style={s.skillScore}>{sk.score}</Text>
            </View>
            <ProgressBar value={sk.score / 100} color={tone[0]} height={6} />
            <Text style={s.muted}>{sk.rationale}</Text>
          </View>
        ))}

        {nextLevel ? (
          <View style={s.unlock}>
            <Ionicons name="lock-open" size={18} color={c.success} />
            <Text style={s.unlockText}>
              Level {nextLevel} · {levelName(nextLevel)} unlocked
            </Text>
          </View>
        ) : null}
        {missionId ? (
          <View style={s.actions}>
            {nextLevel ? <Button label={`Play level ${nextLevel}`} icon="arrow-up-circle" onPress={() => start.mutate({ missionId, level: nextLevel })} loading={start.isPending} /> : null}
            <Button
              label={r.passed ? `Replay level ${r.level}` : `Retry level ${r.level}`}
              icon="refresh"
              variant={nextLevel ? 'secondary' : 'primary'}
              onPress={() => start.mutate({ missionId, level: r.level })}
              loading={start.isPending && !nextLevel}
            />
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    card: { padding: 0, overflow: 'hidden', gap: 0 },
    banner: { padding: 20, gap: 4 },
    bannerTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    level: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700' },
    verdict: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginTop: 4 },
    headline: { color: '#fff', fontSize: 16, fontWeight: '600', lineHeight: 22 },
    body: { padding: 18, gap: 12 },
    reason: { color: c.text, fontSize: 15, lineHeight: 22 },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    scoreText: { flex: 1, gap: 2 },
    scoreTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    muted: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    skill: { gap: 5 },
    skillTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    skillName: { color: c.text, fontSize: 15, fontWeight: '700' },
    skillScore: { color: c.text, fontSize: 15, fontWeight: '800' },
    unlock: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.successSoft, borderRadius: radius.md, padding: 12 },
    unlockText: { color: c.success, fontSize: 15, fontWeight: '800' },
    actions: { gap: 8 },
  }),
);
