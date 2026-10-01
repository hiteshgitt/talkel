import type { Trend } from '@speakai/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

/** Small bar chart of 0–100 values, oldest first. Plain views: no chart library needed. */
export function MiniBars({ values, height = 56, onPress }: { values: readonly (number | null)[]; height?: number; onPress?: (index: number) => void }) {
  return (
    <View style={[styles.bars, { height }]}>
      {values.map((v, i) => {
        const last = i === values.length - 1;
        return (
          <Pressable
            key={i}
            disabled={!onPress}
            onPress={() => onPress?.(i)}
            accessibilityLabel={v === null ? 'no score' : `score ${v}`}
            style={styles.barSlot}
          >
            <View style={[styles.barFill, { height: `${Math.max(4, v ?? 0)}%`, opacity: v === null ? 0.2 : last ? 1 : 0.55 }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** 4 weeks of practice, one square per day, today last; brighter = more minutes. */
export function PracticeCalendar({ days }: { days: readonly { date: string; seconds: number }[] }) {
  const weeks: (typeof days)[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return (
    <View style={styles.calendar}>
      {weeks.map((week, w) => (
        <View key={w} style={styles.week}>
          {week.map((d) => {
            const minutes = d.seconds / 60;
            const level = minutes === 0 ? 0 : Math.min(1, 0.35 + minutes / 15);
            return (
              <View
                key={d.date}
                accessibilityLabel={`${d.date}: ${Math.round(minutes)} minutes`}
                style={[styles.day, level > 0 ? { backgroundColor: colors.userSpeaking, opacity: level } : null]}
              />
            );
          })}
        </View>
      ))}
      <View style={styles.calendarLegend}>
        <Text style={styles.legend}>4 weeks ago</Text>
        <Text style={styles.legend}>today</Text>
      </View>
    </View>
  );
}

const TREND: Record<Trend, { text: string; color: string }> = {
  BETTER: { text: '↑ better', color: colors.userSpeaking },
  WORSE: { text: '↓ needs work', color: colors.danger },
  STEADY: { text: '→ steady', color: colors.textMuted },
};

/** "better / needs work / steady" chip; the labels can be overridden (e.g. "fewer" for mistakes). */
export function TrendBadge({ trend, labels }: { trend: Trend | null; labels?: Partial<Record<Trend, string>> }) {
  if (!trend) return null;
  const t = TREND[trend];
  return <Text style={[styles.trend, { color: t.color }]}>{labels?.[trend] ?? t.text}</Text>;
}

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barFill: { backgroundColor: colors.accent, borderRadius: 3 },
  calendar: { gap: 5 },
  week: { flexDirection: 'row', gap: 5 },
  day: { flex: 1, aspectRatio: 1, borderRadius: 4, backgroundColor: colors.surfaceRaised },
  calendarLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  legend: { color: colors.textMuted, fontSize: 12 },
  trend: { fontSize: 13, fontWeight: '700' },
});
