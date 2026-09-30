import type { EnglishLevel, PersonaSummary } from '@speakai/contracts';
import { StyleSheet, Text, View } from 'react-native';
import { Choice } from '@/components/ui';
import { formatMinutes } from '@/lib/queries';
import { colors } from '@/theme';

export const LEVEL_LABEL: Record<EnglishLevel, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  UPPER_INTERMEDIATE: 'Upper-int.',
  ADVANCED: 'Advanced',
  EXPERT: 'Expert',
};

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function PersonaPicker(props: { personas: PersonaSummary[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <View style={styles.grid}>
      {props.personas.map((p) => (
        <View key={p.id} style={styles.half}>
          <Choice label={p.name} description={p.description} selected={props.value === p.id} onPress={() => props.onChange(p.id)} />
        </View>
      ))}
    </View>
  );
}

export function LevelPicker(props: { value: EnglishLevel; onChange: (l: EnglishLevel) => void }) {
  return (
    <View style={styles.row}>
      {(Object.keys(LEVEL_LABEL) as EnglishLevel[]).map((l) => (
        <Choice key={l} compact label={LEVEL_LABEL[l]} selected={props.value === l} onPress={() => props.onChange(l)} />
      ))}
    </View>
  );
}

export function DurationPicker(props: { options: readonly number[]; value: number; remainingSec: number; onChange: (s: number) => void }) {
  return (
    <View style={styles.row}>
      {props.options.map((s) => (
        <Choice
          key={s}
          compact
          label={formatMinutes(s)}
          selected={props.value === s}
          disabled={s > props.remainingSec && props.remainingSec < props.options[0]!}
          onPress={() => props.onChange(s)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  sectionTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  half: { width: '48%' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
