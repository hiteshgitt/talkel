import type { Accent, EnglishLevel, PersonaSummary, VoicePreference } from '@speakai/contracts';
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

export const ACCENT_LABEL: Record<Accent, string> = {
  AMERICAN: 'American',
  BRITISH: 'British',
  INDIAN: 'Indian',
  AUSTRALIAN: 'Australian',
};

const VOICE_LABEL: Record<VoicePreference, string> = { FEMALE: 'Female', MALE: 'Male', RANDOM: 'Random' };

/** Options locked on the current plan stay visible, marked "Pro", so users know they exist. */
export function VoicePicker(props: { value: VoicePreference; onChange: (v: VoicePreference) => void; locked: boolean }) {
  return (
    <View style={styles.row}>
      {(['RANDOM', 'FEMALE', 'MALE'] as const).map((v) => (
        <Choice
          key={v}
          compact
          label={props.locked && v !== 'RANDOM' ? `${VOICE_LABEL[v]} · Pro` : VOICE_LABEL[v]}
          selected={props.value === v}
          disabled={props.locked && v !== 'RANDOM'}
          onPress={() => props.onChange(v)}
        />
      ))}
    </View>
  );
}

export function AccentPicker(props: { value: Accent | 'RANDOM'; onChange: (a: Accent | 'RANDOM') => void; locked: boolean }) {
  return (
    <View style={styles.row}>
      <Choice compact label="Random" selected={props.value === 'RANDOM'} onPress={() => props.onChange('RANDOM')} />
      {(Object.keys(ACCENT_LABEL) as Accent[]).map((a) => (
        <Choice
          key={a}
          compact
          label={props.locked ? `${ACCENT_LABEL[a]} · Pro` : ACCENT_LABEL[a]}
          selected={props.value === a}
          disabled={props.locked}
          onPress={() => props.onChange(a)}
        />
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
