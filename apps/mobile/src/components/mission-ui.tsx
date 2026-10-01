import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';
import { makeStyles, useColors } from '@/theme';

/** Five level pips: passed (filled), current unlocked (ring), locked (faint). */
export function LevelDots({ passed, unlocked, size = 10 }: { passed: readonly number[]; unlocked: number; size?: number }) {
  const s = useStyles();
  const c = useColors();
  return (
    <View style={s.row} accessibilityLabel={`${passed.length} of 5 levels passed`}>
      {[1, 2, 3, 4, 5].map((l) => {
        const done = passed.includes(l);
        const open = !done && l <= unlocked;
        return (
          <View
            key={l}
            style={[
              s.dot,
              { width: size, height: size, borderRadius: size / 2 },
              done ? { backgroundColor: c.success, borderColor: c.success } : open ? { borderColor: c.accent } : { borderColor: c.border, backgroundColor: c.surfaceRaised },
            ]}
          >
            {done && size >= 16 ? <Ionicons name="checkmark" size={size * 0.7} color="#fff" /> : null}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: 5, alignItems: 'center' },
    dot: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  }),
);
