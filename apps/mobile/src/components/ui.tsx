import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useState } from 'react';
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
import { Gradient } from '@/components/gradient';
import { haptic } from '@/lib/haptics';
import type { IconName } from '@/lib/visuals';
import { makeStyles, radius, useColors } from '@/theme';

export function Screen({
  children,
  scroll = true,
  style,
  edges = ['top', 'bottom'],
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  edges?: ('top' | 'bottom')[];
  /**
   * Pinned below the scrolling content (primary actions). Keeps buttons visible, and avoids an
   * Android issue where taps miss buttons at the end of a list that shrank while scrolled down.
   */
  footer?: ReactNode;
}) {
  const s = useStyles();
  return (
    <SafeAreaView style={s.screen} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[s.content, style]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[s.content, s.fill, style]}>{children}</View>
      )}
      {footer ? <View style={s.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const s = useStyles();
  return (
    <Text style={s.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Small uppercase label above a title or section. */
export function Eyebrow({ children, color }: { children: ReactNode; color?: string }) {
  const s = useStyles();
  return <Text style={[s.eyebrow, color ? { color } : null]}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const s = useStyles();
  return <Text style={[s.body, muted && s.muted]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const s = useStyles();
  const c = useColors();
  if (!children) return null;
  return (
    <View style={s.errorBox} accessibilityLiveRegion="polite">
      <Ionicons name="alert-circle" size={18} color={c.danger} />
      <Text style={s.error}>{children}</Text>
    </View>
  );
}

export function Button(props: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  const s = useStyles();
  const c = useColors();
  const variant = props.variant ?? 'primary';
  // Always explicit booleans: on Android, "disabled" going from true to undefined never re-enabled
  // the native view, so a button that started disabled (e.g. onboarding's Continue) ignored taps.
  const disabled = Boolean(props.disabled || props.loading);
  const solid = variant === 'primary' || variant === 'danger';
  const textColor = props.disabled && !props.loading && variant !== 'ghost' ? c.textFaint : solid ? c.onAccent : variant === 'ghost' ? c.accent : c.text;
  return (
    <Pressable
      // A fresh native view when it switches between disabled and enabled (see `disabled` above).
      key={disabled ? 'disabled' : 'enabled'}
      onPress={() => {
        if (solid) haptic.tap();
        props.onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled, busy: Boolean(props.loading) }}
      style={({ pressed }) => [
        s.button,
        props.compact && s.buttonCompact,
        s[`button_${variant}`],
        pressed && s.pressed,
        props.disabled && !props.loading && variant !== 'ghost' && s.buttonDisabled,
      ]}
    >
      {variant === 'primary' && !props.disabled ? (
        <Gradient colors={[c.accent, c.accent2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.buttonGradient} pointerEvents="none" />
      ) : null}
      {props.loading ? (
        <ActivityIndicator color={solid ? c.onAccent : c.text} />
      ) : (
        <View style={s.buttonRow}>
          {props.icon ? <Ionicons name={props.icon} size={props.compact ? 17 : 20} color={textColor} /> : null}
          <Text style={[s.buttonText, props.compact && s.buttonTextCompact, { color: textColor }]}>{props.label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; icon?: IconName }) {
  const { label, style, icon, ...input } = props;
  const s = useStyles();
  const c = useColors();
  const [focused, setFocused] = useState(false);
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[s.inputWrap, focused && s.inputFocused]}>
        {icon ? <Ionicons name={icon} size={19} color={focused ? c.accent : c.textFaint} /> : null}
        <TextInput
          placeholderTextColor={c.textFaint}
          style={[s.input, style]}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          {...input}
        />
      </View>
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
  icon?: IconName;
  /** e.g. a "Pro" lock */
  trailing?: ReactNode;
}) {
  const s = useStyles();
  const c = useColors();
  const role = props.role ?? 'radio';
  if (props.compact) {
    return (
      <Pressable
        onPress={() => {
          haptic.select();
          props.onPress();
        }}
        disabled={Boolean(props.disabled)}
        accessibilityRole={role}
        accessibilityState={{ selected: props.selected, checked: props.selected, disabled: Boolean(props.disabled) }}
        style={({ pressed }) => [s.chip, props.selected && s.chipSelected, (pressed || props.disabled) && s.pressed]}
      >
        {props.icon ? <Ionicons name={props.icon} size={16} color={props.selected ? c.accent : c.textMuted} /> : null}
        <Text style={[s.chipLabel, props.selected && s.chipLabelSelected]}>{props.label}</Text>
        {props.trailing}
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        props.onPress();
      }}
      disabled={Boolean(props.disabled)}
      accessibilityRole={role}
      accessibilityState={{ selected: props.selected, checked: props.selected, disabled: Boolean(props.disabled) }}
      style={({ pressed }) => [s.choice, props.selected && s.choiceSelected, (pressed || props.disabled) && s.pressed]}
    >
      {props.icon ? <Ionicons name={props.icon} size={22} color={props.selected ? c.accent : c.textMuted} /> : null}
      <View style={s.choiceText}>
        <Text style={s.choiceLabel}>{props.label}</Text>
        {props.description ? <Text style={s.choiceDescription}>{props.description}</Text> : null}
      </View>
      {props.trailing}
      <View style={[role === 'radio' ? s.radio : s.checkbox, props.selected && s.indicatorOn]}>
        {props.selected ? <Ionicons name="checkmark" size={15} color={c.onAccent} /> : null}
      </View>
    </Pressable>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: ViewStyle | ViewStyle[]; onPress?: () => void; accessibilityLabel?: string }) {
  const s = useStyles();
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => [s.card, style, pressed && s.pressedCard]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

/** Section heading with an optional icon and right-side action. */
export function SectionHeader({ title, icon, action }: { title: string; icon?: IconName; action?: { label: string; onPress: () => void } }) {
  const s = useStyles();
  const c = useColors();
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionTitleRow}>
        {icon ? <Ionicons name={icon} size={18} color={c.accent} /> : null}
        <Text style={s.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={10}>
          <Text style={s.sectionAction}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Small pill label. */
export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'; icon?: IconName }) {
  const s = useStyles();
  const c = useColors();
  const tones = {
    neutral: [c.surfaceRaised, c.textMuted],
    accent: [c.accentSoft, c.accent],
    success: [c.successSoft, c.success],
    warning: [c.warningSoft, c.warning],
    danger: [c.dangerSoft, c.danger],
  } as const;
  const [bg, fg] = tones[tone];
  return (
    <View style={[s.badge, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[s.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/** Tappable row: leading visual, title/subtitle, trailing content, chevron. */
export function ListRow(props: { title: string; subtitle?: string; leading?: ReactNode; trailing?: ReactNode; onPress?: () => void; chevron?: boolean }) {
  const s = useStyles();
  const c = useColors();
  const content = (
    <>
      {props.leading}
      <View style={s.rowText}>
        <Text style={s.rowTitle} numberOfLines={1}>
          {props.title}
        </Text>
        {props.subtitle ? (
          <Text style={s.rowSubtitle} numberOfLines={2}>
            {props.subtitle}
          </Text>
        ) : null}
      </View>
      {props.trailing}
      {props.onPress && props.chevron !== false ? <Ionicons name="chevron-forward" size={18} color={c.textFaint} /> : null}
    </>
  );
  if (!props.onPress) return <View style={s.row}>{content}</View>;
  return (
    <Pressable onPress={props.onPress} accessibilityRole="button" style={({ pressed }) => [s.row, pressed && s.pressed]}>
      {content}
    </Pressable>
  );
}

export function ProgressBar({ value, color, height = 8 }: { value: number; color?: string; height?: number }) {
  const s = useStyles();
  const c = useColors();
  return (
    <View style={[s.bar, { height, borderRadius: height / 2 }]}>
      <View style={{ height, borderRadius: height / 2, width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, backgroundColor: color ?? c.accent }} />
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  const s = useStyles();
  const c = useColors();
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Ionicons name={icon} size={30} color={c.accent} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
      {action ? (
        <View style={s.emptyAction}>
          <Button label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}

export function Loading() {
  const s = useStyles();
  const c = useColors();
  return (
    <View style={[s.screen, s.center]}>
      <ActivityIndicator color={c.accent} size="large" />
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    content: { padding: 20, paddingBottom: 36, gap: 16 },
    footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border, backgroundColor: c.bg },
    fill: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    title: { color: c.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
    eyebrow: { color: c.accent, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
    body: { color: c.text, fontSize: 16, lineHeight: 23 },
    muted: { color: c.textMuted },
    errorBox: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: c.dangerSoft, borderRadius: radius.md, padding: 12 },
    error: { color: c.danger, fontSize: 14, lineHeight: 20, flex: 1 },
    button: { borderRadius: radius.pill, paddingVertical: 16, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center', minHeight: 54, overflow: 'hidden' },
    buttonGradient: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
    buttonCompact: { paddingVertical: 10, paddingHorizontal: 18, minHeight: 42, alignSelf: 'flex-start' },
    buttonRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    button_primary: { backgroundColor: c.accent },
    button_secondary: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    button_ghost: { backgroundColor: 'transparent' },
    button_danger: { backgroundColor: c.danger },
    pressed: { opacity: 0.6 },
    pressedCard: { opacity: 0.85, transform: [{ scale: 0.99 }] },
    buttonDisabled: { backgroundColor: c.surfaceRaised, borderColor: c.surfaceRaised },
    buttonText: { fontSize: 17, fontWeight: '700' },
    buttonTextCompact: { fontSize: 15 },
    field: { gap: 8 },
    fieldLabel: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: c.border,
      paddingHorizontal: 14,
    },
    inputFocused: { borderColor: c.accent },
    input: { flex: 1, color: c.text, paddingVertical: 14, fontSize: 16 },
    choice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: c.surface,
      borderRadius: radius.lg,
      padding: 16,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    choiceSelected: { borderColor: c.accent, backgroundColor: c.accentSoft },
    choiceText: { flex: 1, gap: 3 },
    choiceLabel: { color: c.text, fontSize: 16, fontWeight: '700' },
    choiceDescription: { color: c.textMuted, fontSize: 14, lineHeight: 19 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: c.surface,
      borderRadius: radius.pill,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderWidth: 1.5,
      borderColor: c.border,
    },
    chipSelected: { borderColor: c.accent, backgroundColor: c.accentSoft },
    chipLabel: { color: c.text, fontSize: 14, fontWeight: '600' },
    chipLabelSelected: { color: c.accent },
    radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    indicatorOn: { backgroundColor: c.accent, borderColor: c.accent },
    card: { backgroundColor: c.surface, borderRadius: radius.lg, padding: 18, gap: 10, ...c.elevation },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
    sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    sectionTitle: { color: c.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
    sectionAction: { color: c.accent, fontSize: 14, fontWeight: '700' },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
    badgeText: { fontSize: 12, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
    rowText: { flex: 1, gap: 2 },
    rowTitle: { color: c.text, fontSize: 16, fontWeight: '700' },
    rowSubtitle: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    bar: { backgroundColor: c.surfaceRaised, overflow: 'hidden' },
    empty: { alignItems: 'center', gap: 10, paddingVertical: 28, paddingHorizontal: 12 },
    emptyIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { color: c.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
    emptyAction: { alignSelf: 'stretch' },
    emptyBody: { color: c.textMuted, fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 6 },
  }),
);
