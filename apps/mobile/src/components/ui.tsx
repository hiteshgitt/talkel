import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '@/theme';

export function Screen({ children, scroll = true, style }: { children: ReactNode; scroll?: boolean; style?: ViewStyle }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {scroll ? (
        <ScrollView contentContainerStyle={[styles.content, style]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, styles.fill, style]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <Text style={styles.error} accessibilityLiveRegion="polite">
      {children}
    </Text>
  );
}

export function Button(props: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const variant = props.variant ?? 'primary';
  const disabled = props.disabled || props.loading;
  return (
    <Pressable
      onPress={props.onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: props.loading }}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && styles.buttonDim,
        props.disabled && !props.loading && variant !== 'ghost' && styles.buttonDisabled,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'danger' ? '#fff' : colors.text} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            variant === 'ghost' && styles.buttonTextGhost,
            props.disabled && variant !== 'ghost' && styles.buttonTextDisabled,
          ]}
        >
          {props.label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { label, style, ...input } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[styles.input, style]}
        accessibilityLabel={label}
        {...input}
      />
    </View>
  );
}

/** Selectable card/chip. Use inside a row or column. */
export function Choice(props: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  role?: 'radio' | 'checkbox';
  compact?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole={props.role ?? 'radio'}
      accessibilityState={{ selected: props.selected, checked: props.selected, disabled: props.disabled }}
      style={({ pressed }) => [
        props.compact ? styles.chip : styles.choice,
        props.selected && styles.choiceSelected,
        (pressed || props.disabled) && styles.buttonDim,
      ]}
    >
      <View style={styles.choiceRow}>
        <View
          style={[
            (props.role ?? 'radio') === 'radio' ? styles.radio : styles.checkbox,
            props.selected && styles.indicatorOn,
          ]}
        >
          {props.selected ? <Text style={styles.indicatorMark}>✓</Text> : null}
        </View>
        <View style={styles.choiceText}>
          <Text style={[styles.choiceLabel, props.compact && styles.chipLabel]}>{props.label}</Text>
          {props.description ? <Text style={styles.choiceDescription}>{props.description}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Loading() {
  return (
    <View style={[styles.screen, styles.center]}>
      <ActivityIndicator color={colors.text} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16 },
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  body: { color: colors.text, fontSize: 16, lineHeight: 23 },
  muted: { color: colors.textMuted },
  error: { color: colors.danger, fontSize: 14 },
  button: { borderRadius: radius.pill, paddingVertical: 16, paddingHorizontal: 20, alignItems: 'center' },
  button_primary: { backgroundColor: colors.accent },
  button_secondary: { backgroundColor: colors.surfaceRaised },
  button_ghost: { backgroundColor: 'transparent' },
  button_danger: { backgroundColor: colors.danger },
  buttonDim: { opacity: 0.55 },
  buttonDisabled: { backgroundColor: colors.surfaceRaised },
  buttonTextDisabled: { color: colors.textMuted },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  buttonTextGhost: { color: colors.accent },
  field: { gap: 6 },
  fieldLabel: { color: colors.textMuted, fontSize: 14 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  choice: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 2,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  choiceSelected: { borderColor: colors.accent, backgroundColor: '#1d2440' },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  choiceText: { flexShrink: 1, gap: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.textMuted, alignItems: 'center', justifyContent: 'center' },
  indicatorOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  indicatorMark: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 15 },
  choiceLabel: { color: colors.text, fontSize: 16, fontWeight: '600' },
  chipLabel: { fontSize: 14 },
  choiceDescription: { color: colors.textMuted, fontSize: 14, lineHeight: 19 },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, gap: 8 },
});
