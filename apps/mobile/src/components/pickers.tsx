import Ionicons from '@expo/vector-icons/Ionicons';
import type { Accent, EnglishLevel, PersonaSummary, VoicePreference } from '@speakai/contracts';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PersonaAvatar } from '@/components/art';
import { Choice } from '@/components/ui';
import { formatMinutes } from '@/lib/queries';
import type { IconName } from '@/lib/visuals';
import { makeStyles, radius, useColors } from '@/theme';

export const LEVEL_LABEL: Record<EnglishLevel, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  UPPER_INTERMEDIATE: 'Upper-int.',
  ADVANCED: 'Advanced',
  EXPERT: 'Expert',
};

export function Section({ title, icon, children }: { title: string; icon?: IconName; children: React.ReactNode }) {
  const s = useStyles();
  const c = useColors();
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        {icon ? <Ionicons name={icon} size={16} color={c.textMuted} /> : null}
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Lock() {
  const c = useColors();
  return <Ionicons name="lock-closed" size={13} color={c.warning} />;
}

export function PersonaPicker(props: { personas: PersonaSummary[]; value: string | null; onChange: (id: string) => void }) {
  const s = useStyles();
  const c = useColors();
  return (
    <View style={s.grid}>
      {props.personas.map((p) => {
        const selected = props.value === p.id;
        return (
          <Pressable
            key={p.id}
            onPress={() => props.onChange(p.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${p.name}: ${p.description}`}
            style={({ pressed }) => [s.persona, selected && s.personaSelected, pressed && s.pressed]}
          >
            <PersonaAvatar name={p.name} slug={p.slug} size={46} />
            <Text style={s.personaName}>{p.name}</Text>
            <Text style={s.personaDesc} numberOfLines={3}>
              {p.description}
            </Text>
            {selected ? (
              <View style={s.personaCheck}>
                <Ionicons name="checkmark" size={14} color={c.onAccent} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export const ACCENT_LABEL: Record<Accent, string> = {
  AMERICAN: 'American',
  BRITISH: 'British',
  INDIAN: 'Indian',
  AUSTRALIAN: 'Australian',
};

const VOICE: Record<VoicePreference, { label: string; icon: IconName }> = {
  RANDOM: { label: 'Surprise me', icon: 'shuffle' },
  FEMALE: { label: 'Female', icon: 'woman' },
  MALE: { label: 'Male', icon: 'man' },
};

/** Options locked on the current plan stay visible with a lock, so users know they exist. */
export function VoicePicker(props: { value: VoicePreference; onChange: (v: VoicePreference) => void; locked: boolean }) {
  const s = useStyles();
  return (
    <View style={s.row}>
      {(['RANDOM', 'FEMALE', 'MALE'] as const).map((v) => {
        const locked = props.locked && v !== 'RANDOM';
        return (
          <Choice
            key={v}
            compact
            icon={VOICE[v].icon}
            label={VOICE[v].label}
            selected={props.value === v}
            disabled={locked}
            trailing={locked ? <Lock /> : undefined}
            onPress={() => props.onChange(v)}
          />
        );
      })}
    </View>
  );
}

export function AccentPicker(props: { value: Accent | 'RANDOM'; onChange: (a: Accent | 'RANDOM') => void; locked: boolean }) {
  const s = useStyles();
  return (
    <View style={s.row}>
      <Choice compact icon="shuffle" label="Surprise me" selected={props.value === 'RANDOM'} onPress={() => props.onChange('RANDOM')} />
      {(Object.keys(ACCENT_LABEL) as Accent[]).map((a) => (
        <Choice
          key={a}
          compact
          label={ACCENT_LABEL[a]}
          selected={props.value === a}
          disabled={props.locked}
          trailing={props.locked ? <Lock /> : undefined}
          onPress={() => props.onChange(a)}
        />
      ))}
    </View>
  );
}

export function LevelPicker(props: { value: EnglishLevel; onChange: (l: EnglishLevel) => void }) {
  const s = useStyles();
  return (
    <View style={s.row}>
      {(Object.keys(LEVEL_LABEL) as EnglishLevel[]).map((l) => (
        <Choice key={l} compact label={LEVEL_LABEL[l]} selected={props.value === l} onPress={() => props.onChange(l)} />
      ))}
    </View>
  );
}

export function DurationPicker(props: { options: readonly number[]; value: number; remainingSec: number; onChange: (s: number) => void }) {
  const s = useStyles();
  return (
    <View style={s.row}>
      {props.options.map((sec) => (
        <Choice
          key={sec}
          compact
          icon="time-outline"
          label={formatMinutes(sec)}
          selected={props.value === sec}
          disabled={sec > props.remainingSec && props.remainingSec < props.options[0]!}
          onPress={() => props.onChange(sec)}
        />
      ))}
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    section: { gap: 10 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    sectionTitle: { color: c.textMuted, fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    persona: {
      width: '48%',
      flexGrow: 1,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: 14,
      gap: 6,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    personaSelected: { borderColor: c.accent, backgroundColor: c.accentSoft },
    personaName: { color: c.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
    personaDesc: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    personaCheck: { position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    pressed: { opacity: 0.7 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  }),
);
