import { VoiceChoice } from '@speakai/contracts';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Animated, BackHandler, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CallState, RealtimeCall } from '@/call/realtime-call';
import { useRealtimeCall } from '@/call/use-realtime-call';
import { colors, radius } from '@/theme';

const PERSONA_NAME: Record<VoiceChoice, string> = { female: 'Maya', male: 'Rohan' };

export default function CallScreen() {
  useKeepAwake();
  const params = useLocalSearchParams<{ voice?: string }>();
  const voice = VoiceChoice.catch('female').parse(params.voice);
  const { call, state } = useRealtimeCall(voice);

  const endCall = useCallback(async () => {
    const callId = await call?.hangUp();
    if (callId) router.replace({ pathname: '/transcript/[callId]', params: { callId } });
    else router.back();
  }, [call]);

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
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.scenario}>Friendly Conversation</Text>
        <CallTimer connectedAt={state.connectedAt} />
      </View>

      <View style={styles.center}>
        <Avatar name={PERSONA_NAME[voice]} floor={state.floor} />
        <Text style={styles.name}>{PERSONA_NAME[voice]}</Text>
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {statusText(state)}
        </Text>
      </View>

      {state.phase === 'failed' ? (
        <FailedPanel state={state} onDone={endCall} />
      ) : (
        <Controls call={call} state={state} onEnd={endCall} />
      )}
    </SafeAreaView>
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
      return s.floor === 'ai' ? 'Speaking' : s.floor === 'user' ? 'Listening…' : '';
  }
}

function Avatar({ name, floor }: { name: string; floor: CallState['floor'] }) {
  const [pulse] = useState(() => new Animated.Value(0));
  const active = floor !== 'none';

  useEffect(() => {
    if (!active) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, pulse]);

  const ringColor = floor === 'user' ? colors.userSpeaking : colors.aiSpeaking;
  return (
    <View style={styles.avatarWrap}>
      <Animated.View
        style={[
          styles.ring,
          {
            borderColor: ringColor,
            opacity: active ? pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] }) : 0,
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) }],
          },
        ]}
      />
      <View style={styles.avatar}>
        <Text style={styles.avatarInitial}>{name.charAt(0)}</Text>
      </View>
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

function Controls({ call, state, onEnd }: { call: RealtimeCall | null; state: CallState; onEnd: () => void }) {
  const busy = state.phase === 'ending' || state.phase === 'ended';
  return (
    <View style={styles.controls}>
      <RoundButton label={state.muted ? 'Unmute' : 'Mute'} active={state.muted} onPress={() => call?.toggleMute()} />
      <RoundButton label="End" danger disabled={busy} onPress={onEnd} />
      <RoundButton label="Speaker" active={state.speaker} onPress={() => call?.toggleSpeaker()} />
    </View>
  );
}

function FailedPanel({ state, onDone }: { state: CallState; onDone: () => void }) {
  return (
    <View style={styles.failed}>
      <Text style={styles.failedText}>
        Your conversation could not continue.{state.callId ? ' Your session has been saved.' : ''}
      </Text>
      {state.error ? <Text style={styles.failedDetail}>{state.error}</Text> : null}
      <Pressable style={styles.failedButton} onPress={onDone} accessibilityRole="button">
        <Text style={styles.failedButtonText}>{state.callId ? 'View transcript' : 'Back'}</Text>
      </Pressable>
    </View>
  );
}

function RoundButton(props: { label: string; onPress: () => void; active?: boolean; danger?: boolean; disabled?: boolean }) {
  return (
    <View style={styles.roundWrap}>
      <Pressable
        onPress={props.onPress}
        disabled={props.disabled}
        accessibilityRole="button"
        accessibilityLabel={props.label}
        accessibilityState={{ selected: props.active, disabled: props.disabled }}
        style={({ pressed }) => [
          styles.round,
          props.active && styles.roundActive,
          props.danger && styles.roundDanger,
          (pressed || props.disabled) && styles.roundPressed,
        ]}
      >
        <Text style={[styles.roundGlyph, props.active && styles.roundGlyphActive]}>
          {props.danger ? '✕' : props.label === 'Speaker' ? '🔊' : '🎙'}
        </Text>
      </Pressable>
      <Text style={styles.roundLabel}>{props.label}</Text>
    </View>
  );
}

const AVATAR = 148;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 24, paddingVertical: 16 },
  header: { alignItems: 'center', gap: 4, marginTop: 12 },
  scenario: { color: colors.textMuted, fontSize: 15 },
  timer: { color: colors.text, fontSize: 17, fontVariant: ['tabular-nums'] },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  avatarWrap: { width: AVATAR + 40, height: AVATAR + 40, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: AVATAR + 32, height: AVATAR + 32, borderRadius: radius.pill, borderWidth: 4 },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { color: colors.text, fontSize: 56, fontWeight: '300' },
  name: { color: colors.text, fontSize: 28, fontWeight: '600' },
  status: { color: colors.textMuted, fontSize: 16, minHeight: 22 },
  controls: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 24 },
  roundWrap: { alignItems: 'center', gap: 8 },
  round: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundActive: { backgroundColor: colors.text },
  roundDanger: { backgroundColor: colors.danger },
  roundPressed: { opacity: 0.6 },
  roundGlyph: { fontSize: 26, color: colors.text },
  roundGlyphActive: { color: colors.bg },
  roundLabel: { color: colors.textMuted, fontSize: 13 },
  failed: { gap: 12, marginBottom: 24, alignItems: 'center' },
  failedText: { color: colors.text, fontSize: 16, textAlign: 'center' },
  failedDetail: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
  failedButton: { backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: 28 },
  failedButtonText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
