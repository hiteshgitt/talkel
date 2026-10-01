import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { makeStyles, radius, useColors } from '@/theme';

function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Plays a conversation recording streamed from our API (the session cookie is sent as a header;
 * the server supports byte ranges, so seeking works). Loaded lazily — see conversation screen.
 */
export default function RecordingPlayer({ uri, cookie, knownDurationMs }: { uri: string; cookie: string; knownDurationMs: number | null }) {
  const styles = useStyles();
  const colors = useColors();
  const player = useAudioPlayer({ uri, headers: { Cookie: cookie } });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || (knownDurationMs ?? 0) / 1000;
  const position = Math.min(status.currentTime, duration || status.currentTime);

  // Rewind when playback finishes, so "Play" starts again from the beginning.
  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0);
  }, [status.didJustFinish, player]);

  const skip = (delta: number) => void player.seekTo(Math.max(0, Math.min(duration, position + delta)));
  const fraction = duration > 0 ? position / duration : 0;

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Pause recording' : 'Play recording'}
          onPress={() => (status.playing ? player.pause() : player.play())}
          disabled={!status.isLoaded}
          style={({ pressed }) => [styles.play, (pressed || !status.isLoaded) && styles.dim]}
        >
          <Ionicons name={status.playing ? 'pause' : 'play'} size={24} color={colors.onAccent} style={status.playing ? undefined : styles.playNudge} />
        </Pressable>
        <View style={styles.track}>
          <View style={styles.bar}>
            <View style={[styles.fill, { width: `${Math.round(fraction * 100)}%` }]} />
          </View>
          <Text style={styles.time}>
            {status.isLoaded ? `${clock(position)} / ${clock(duration)}` : 'Loading…'}
          </Text>
        </View>
      </View>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back 10 seconds" onPress={() => skip(-10)} style={styles.skip}>
          <Ionicons name="play-back" size={14} color={colors.text} />
          <Text style={styles.skipText}>10 s</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Forward 10 seconds" onPress={() => skip(10)} style={styles.skip}>
          <Text style={styles.skipText}>10 s</Text>
          <Ionicons name="play-forward" size={14} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
  playNudge: { marginLeft: 3 },
  box: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  play: { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.5 },
  
  track: { flex: 1, gap: 6 },
  bar: { height: 6, borderRadius: 3, backgroundColor: c.surfaceRaised, overflow: 'hidden' },
  fill: { height: 6, backgroundColor: c.accent },
  time: { color: c.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] },
  skip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surfaceRaised, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
  skipText: { color: c.text, fontSize: 14, fontWeight: '600' },
  }),
);
