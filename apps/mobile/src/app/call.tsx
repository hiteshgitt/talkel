import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Animated, BackHandler, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PersonaAvatar } from '@/components/art';
import { Gradient } from '@/components/gradient';
import { haptic } from '@/lib/haptics';
import type { AudioRoute, CallState, RealtimeCall } from '@/call/realtime-call';
import { useRealtimeCall } from '@/call/use-realtime-call';
import { CONVERSATIONS_KEY, QUOTA_KEY } from '@/lib/queries';
import { type IconName, personaTint, withAlpha } from '@/lib/visuals';
import { palettes, radius } from '@/theme';

/** The call is always dark, like a phone call: immersive, and calm on the eyes. */
const c = palettes.dark;

export default function CallScreen() {
  useKeepAwake();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ conversationId: string; personaName?: string; personaSlug?: string; title?: string }>();
  const { conversationId } = params;
  const personaName = params.personaName ?? 'Your partner';
  const tint = personaTint(params.personaSlug ?? personaName);
  const { call, state } = useRealtimeCall(conversationId);

  const endCall = useCallback(async () => {
    await call?.hangUp();
  }, [call]);

  // However the call ended (user, time limit, AI said goodbye), show the saved conversation.
  const ended = state?.phase === 'ended';
  useEffect(() => {
    if (!ended) return;
    void qc.invalidateQueries({ queryKey: QUOTA_KEY });
    void qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    showResult(conversationId);
  }, [ended, conversationId, qc]);

  // Hardware back behaves like "end call" rather than silently leaving a live call.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      void endCall();
      return true;
    });
    return () => sub.remove();
  }, [endCall]);

  if (!state) return <View style={styles.root} />;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Ambient light in the partner's colour, fading into the night */}
      <Gradient colors={[withAlpha(tint, 0.38), withAlpha(tint, 0.1), c.bg]} start={{ x: 0.2, y: 0 }} end={{ x: 0.5, y: 0.75 }} style={styles.fill} />
      <View style={[styles.glow, styles.glowTop, { backgroundColor: withAlpha(tint, 0.12) }]} />
      <View style={[styles.glow, styles.glowBottom, { backgroundColor: withAlpha(tint, 0.1) }]} />

      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <Text style={styles.scenario} numberOfLines={1}>
            {params.title ?? 'Conversation'}
          </Text>
          <View style={styles.pills}>
            <View style={styles.pill}>
              <CallTimer connectedAt={state.connectedAt} />
            </View>
            {state.recording ? (
              <View style={[styles.pill, styles.recPill]} accessibilityLabel="This call is being recorded">
                <View style={styles.recDot} />
                <Text style={styles.recText}>REC</Text>
              </View>
            ) : null}
          </View>
          {state.warningSecondsLeft !== null && state.phase === 'active' ? (
            <View style={[styles.pill, styles.warnPill]}>
              <Ionicons name="hourglass-outline" size={14} color={c.warning} />
              <Text style={styles.warnText} accessibilityLiveRegion="polite">
                About {Math.max(1, Math.round(state.warningSecondsLeft / 60))} minute left
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.center}>
          <Orb name={personaName} slug={params.personaSlug} tint={tint} floor={state.phase === 'active' ? state.floor : 'none'} />
          <Text style={styles.name}>{personaName}</Text>
          <Wave active={state.phase === 'active' && state.floor !== 'none'} color={state.floor === 'user' ? c.userSpeaking : tint} />
          <Text style={styles.status} accessibilityLiveRegion="polite">
            {statusText(state)}
          </Text>
        </View>

        {state.phase === 'failed' ? <FailedPanel state={state} onDone={() => showResult(conversationId)} /> : <Controls call={call} state={state} onEnd={endCall} />}
      </SafeAreaView>
    </View>
  );
}

function statusText(s: CallState): string {
  switch (s.phase) {
    case 'connecting':
      return 'Connecting…';
    case 'reconnecting':
      return 'Connection lost. Reconnecting…';
    case 'ending':
    case 'ended':
      return 'Call ended';
    case 'failed':
      return 'Call dropped';
    case 'active':
      if (s.muted) return 'You are muted';
      return s.floor === 'ai' ? 'Speaking…' : s.floor === 'user' ? 'Listening…' : 'Your turn — just talk';
  }
}

/**
 * The partner's avatar inside softly pulsing rings: the partner's colour while they speak,
 * green while you speak, a slow "breathing" glow otherwise.
 */
function Orb({ name, slug, tint, floor }: { name: string; slug?: string; tint: string; floor: CallState['floor'] }) {
  const [wave] = useState(() => new Animated.Value(0));
  const speaking = floor !== 'none';

  useEffect(() => {
    wave.stopAnimation();
    wave.setValue(0);
    const loop = Animated.loop(
      Animated.timing(wave, { toValue: 1, duration: speaking ? 1400 : 3200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [speaking, wave]);

  const ringColor = floor === 'user' ? c.userSpeaking : tint;
  const ring = (delay: number) => {
    const t = Animated.modulo(Animated.add(wave, delay), 1);
    return {
      opacity: t.interpolate({ inputRange: [0, 1], outputRange: speaking ? [0.55, 0] : [0.25, 0] }),
      transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, speaking ? 1.55 : 1.25] }) }],
    };
  };

  return (
    <View style={styles.orb}>
      {[0, 0.33, 0.66].map((d) => (
        <Animated.View key={d} style={[styles.ring, { borderColor: ringColor, backgroundColor: withAlpha(ringColor, 0.06) }, ring(d)]} />
      ))}
      <View style={[styles.avatarHalo, { borderColor: withAlpha(ringColor, speaking ? 0.9 : 0.35) }]}>
        <PersonaAvatar name={name} slug={slug} size={AVATAR} />
      </View>
    </View>
  );
}

const BARS = [0.45, 0.8, 0.55, 1, 0.7, 0.9, 0.5, 0.75, 0.4];

/** A small voice waveform: bars dance while someone is speaking, and rest flat otherwise. */
function Wave({ active, color }: { active: boolean; color: string }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      Animated.timing(t, { toValue: 0, duration: 250, useNativeDriver: true }).start();
      return;
    }
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [active, t]);
  return (
    <View style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {BARS.map((h, i) => {
        const phase = Animated.modulo(Animated.add(t, i / BARS.length), 1);
        const scale = active
          ? phase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.25, h, 0.25] })
          : t.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.15] });
        return <Animated.View key={i} style={[styles.waveBar, { backgroundColor: color, transform: [{ scaleY: scale }] }]} />;
      })}
    </View>
  );
}

function CallTimer({ connectedAt }: { connectedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const secs = connectedAt ? Math.max(0, Math.floor((now - connectedAt) / 1000)) : 0;
  const text = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return <Text style={styles.timer}>{text}</Text>;
}

const ROUTE: Record<AudioRoute, { label: string; icon: IconName }> = {
  EARPIECE: { label: 'Phone', icon: 'phone-portrait-outline' },
  SPEAKER_PHONE: { label: 'Speaker', icon: 'volume-high' },
  WIRED_HEADSET: { label: 'Headset', icon: 'headset' },
  BLUETOOTH: { label: 'Bluetooth', icon: 'bluetooth' },
};

/**
 * Opens the finished conversation on top of the tabs, so "back" from it returns home instead of to
 * the scenario setup screens the call was started from.
 */
function showResult(id: string) {
  if (router.canDismiss()) router.dismissAll();
  router.push({ pathname: '/conversation/[id]', params: { id } });
}

function Controls({ call, state, onEnd }: { call: RealtimeCall | null; state: CallState; onEnd: () => void }) {
  const busy = state.phase === 'ending' || state.phase === 'ended';
  return (
    <View style={styles.controlsWrap}>
      {state.recordingError ? <Text style={styles.recError}>{state.recordingError}</Text> : null}
      <View style={styles.dock}>
        <RoundButton
          label={state.muted ? 'Unmute' : 'Mute'}
          icon={state.muted ? 'mic-off' : 'mic'}
          active={state.muted}
          onPress={() => {
            haptic.tap();
            call?.toggleMute();
          }}
        />
        <RoundButton
          label={state.recording ? 'Stop rec.' : 'Record'}
          icon={state.recording ? 'stop' : 'radio-button-on'}
          iconColor={state.recording ? '#fff' : c.danger}
          active={state.recording}
          activeColor={c.danger}
          disabled={state.phase !== 'active'}
          onPress={() => {
            haptic.press();
            void call?.toggleRecording();
          }}
        />
        <RoundButton
          label={ROUTE[state.audioRoute].label}
          icon={ROUTE[state.audioRoute].icon}
          active={state.audioRoute !== 'EARPIECE'}
          onPress={() => {
            haptic.tap();
            call?.nextAudioRoute();
          }}
        />
      </View>
      <Pressable
        onPress={() => {
          haptic.warning();
          onEnd();
        }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="End call"
        style={({ pressed }) => [styles.end, (pressed || busy) && styles.pressed]}
      >
        <Ionicons name="call" size={30} color="#fff" style={styles.endIcon} />
      </Pressable>
    </View>
  );
}

function FailedPanel({ state, onDone }: { state: CallState; onDone: () => void }) {
  return (
    <View style={styles.failed}>
      <Ionicons name="cloud-offline-outline" size={30} color={c.textMuted} />
      <Text style={styles.failedText}>Your conversation could not continue. What you said so far has been saved.</Text>
      {state.error ? <Text style={styles.failedDetail}>{state.error}</Text> : null}
      <Pressable style={({ pressed }) => [styles.failedButton, pressed && styles.pressed]} onPress={onDone} accessibilityRole="button">
        <Text style={styles.failedButtonText}>View conversation</Text>
      </Pressable>
    </View>
  );
}

function RoundButton(props: {
  label: string;
  icon: IconName;
  onPress: () => void;
  active?: boolean;
  activeColor?: string;
  iconColor?: string;
  disabled?: boolean;
}) {
  const bg = props.active ? (props.activeColor ?? c.text) : 'rgba(255,255,255,0.08)';
  const fg = props.iconColor ?? (props.active ? c.bg : c.text);
  return (
    <View style={styles.roundWrap}>
      <Pressable
        onPress={props.onPress}
        disabled={props.disabled}
        accessibilityRole="button"
        accessibilityLabel={props.label}
        accessibilityState={{ selected: props.active, disabled: props.disabled }}
        style={({ pressed }) => [styles.round, { backgroundColor: bg }, (pressed || props.disabled) && styles.pressed]}
      >
        <Ionicons name={props.icon} size={26} color={fg} />
      </Pressable>
      <Text style={styles.roundLabel}>{props.label}</Text>
    </View>
  );
}

const AVATAR = 132;
const ORB = AVATAR + 120;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg, overflow: 'hidden' },
  safe: { flex: 1, paddingHorizontal: 24, paddingVertical: 12 },
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  glow: { position: 'absolute', borderRadius: radius.pill },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 28 },
  waveBar: { width: 4, height: 28, borderRadius: 2 },
  glowTop: { width: 520, height: 520, top: -200, left: -120 },
  glowBottom: { width: 460, height: 460, bottom: -220, right: -160 },
  header: { alignItems: 'center', gap: 10, marginTop: 12 },
  scenario: { color: c.textMuted, fontSize: 15, fontWeight: '600' },
  pills: { flexDirection: 'row', gap: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
  timer: { color: c.text, fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  recPill: { backgroundColor: 'rgba(255,92,97,0.18)' },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger },
  recText: { color: c.danger, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  warnPill: { backgroundColor: 'rgba(245,181,68,0.16)' },
  warnText: { color: c.warning, fontSize: 14, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  orb: { width: ORB, height: ORB, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: AVATAR + 24, height: AVATAR + 24, borderRadius: radius.pill, borderWidth: 2 },
  avatarHalo: { borderWidth: 3, borderRadius: radius.pill, padding: 5 },
  name: { color: c.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  status: { color: c.textMuted, fontSize: 16, minHeight: 22 },
  controlsWrap: { gap: 22, marginBottom: 20, alignItems: 'center' },
  dock: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch' },
  recError: { color: c.danger, fontSize: 13, textAlign: 'center' },
  roundWrap: { alignItems: 'center', gap: 8, width: 84 },
  round: { width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.55 },
  roundLabel: { color: c.textMuted, fontSize: 13 },
  end: { width: 76, height: 76, borderRadius: radius.pill, backgroundColor: c.danger, alignItems: 'center', justifyContent: 'center' },
  endIcon: { transform: [{ rotate: '135deg' }] },
  failed: { gap: 12, marginBottom: 32, alignItems: 'center' },
  failedText: { color: c.text, fontSize: 16, textAlign: 'center', lineHeight: 23 },
  failedDetail: { color: c.textMuted, fontSize: 13, textAlign: 'center' },
  failedButton: { backgroundColor: c.accent, borderRadius: radius.pill, paddingVertical: 15, paddingHorizontal: 30, marginTop: 6 },
  failedButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
