import type { PocTranscriptResponse } from '@speakai/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, pocApi } from '@/lib/api';
import { colors, radius } from '@/theme';

const POLL_MS = 1500;
const MAX_POLLS = 8; // user-turn transcription can finish a few seconds after hang-up

export default function TranscriptScreen() {
  const { callId } = useLocalSearchParams<{ callId: string }>();
  const [data, setData] = useState<PocTranscriptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async (attempt: number) => {
      try {
        const res = await pocApi.transcript(callId);
        if (cancelled) return;
        setData(res);
        const pending = res.turns.some((t) => !t.final);
        if (pending && attempt < MAX_POLLS) timer = setTimeout(() => void load(attempt + 1), POLL_MS);
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Could not load the transcript');
      }
    };
    void load(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [callId]);

  if (error) return <Centered text={error} />;
  if (!data) return <Centered loading />;

  return (
    <SafeAreaView style={styles.root} edges={['bottom']}>
      <Text style={styles.meta}>
        {formatDuration(data.durationMs)} · {data.turns.length} turns
        {data.endReason === 'TIME_LIMIT' ? ' · time limit reached' : ''}
      </Text>
      <FlatList
        data={data.turns}
        keyExtractor={(t) => String(t.seq)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>Nothing was said in this call.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.speaker === 'USER' ? styles.user : styles.ai]}>
            <Text style={styles.speaker}>{item.speaker === 'USER' ? 'You' : 'AI'}</Text>
            <Text style={[styles.text, !item.final && styles.pending]}>
              {item.text || '…'}
              {item.interrupted ? <Text style={styles.cut}> — (interrupted)</Text> : null}
            </Text>
          </View>
        )}
      />
      <Pressable style={styles.again} onPress={() => router.dismissTo('/')} accessibilityRole="button">
        <Text style={styles.againText}>Start another conversation</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function Centered({ text, loading }: { text?: string; loading?: boolean }) {
  return (
    <View style={[styles.root, styles.centered]}>
      {loading ? <ActivityIndicator color={colors.text} /> : <Text style={styles.empty}>{text}</Text>}
    </View>
  );
}

function formatDuration(ms: number | null): string {
  if (ms === null) return 'In progress';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  meta: { color: colors.textMuted, fontSize: 13, paddingVertical: 12 },
  list: { gap: 10, paddingBottom: 16 },
  bubble: { borderRadius: radius.md, padding: 12, maxWidth: '88%' },
  ai: { backgroundColor: colors.surface, alignSelf: 'flex-start' },
  user: { backgroundColor: colors.surfaceRaised, alignSelf: 'flex-end' },
  speaker: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  text: { color: colors.text, fontSize: 16, lineHeight: 22 },
  pending: { color: colors.textMuted, fontStyle: 'italic' },
  cut: { color: colors.textMuted, fontSize: 13 },
  empty: { color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: 24 },
  again: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  againText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
