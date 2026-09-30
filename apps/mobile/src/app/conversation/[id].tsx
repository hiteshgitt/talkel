import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { lazy, Suspense, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LEVEL_LABEL } from '@/components/pickers';
import { Body, Button, Card, ErrorText, Loading, Screen, Title } from '@/components/ui';
import { api, friendlyError } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { audioPlaybackAvailable } from '@/lib/runtime';
import { CONVERSATIONS_KEY, conversationKey, formatMinutes, QUOTA_KEY } from '@/lib/queries';
import { colors, radius } from '@/theme';

// Loaded only when there is a recording and this app build includes the audio module.
const RecordingPlayer = lazy(() => import('@/components/recording-player'));

const END_REASON: Record<string, string> = {
  USER_ENDED: 'You ended the call',
  TIME_LIMIT: 'Time was up',
  OBJECTIVE_COMPLETED: 'Conversation completed',
  AI_NATURAL_END: 'Conversation finished',
  CONNECTION_LOST: 'The connection was lost',
  PROVIDER_CLOSED: 'The call dropped',
  QUOTA_EXHAUSTED: 'Daily practice time used up',
  SERVER_RESTART: 'The call was interrupted',
  ERROR: 'The call could not continue',
};

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const detail = useQuery({
    queryKey: conversationKey(id),
    queryFn: () => api.conversation(id),
    // Transcripts are finalised a moment after the call ends; refresh until the status settles.
    refetchInterval: (q) =>
      q.state.data && (['ACTIVE', 'CONNECTING', 'RECONNECTING'].includes(q.state.data.status) || q.state.data.recording?.inProgress)
        ? 2000
        : false,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteConversation(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
      void qc.invalidateQueries({ queryKey: QUOTA_KEY });
      qc.removeQueries({ queryKey: conversationKey(id) });
      router.back();
    },
  });

  if (detail.isPending) return <Loading />;
  if (detail.isError) {
    return (
      <Screen>
        <ErrorText>{friendlyError(detail.error)}</ErrorText>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }
  const c = detail.data;

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: '' }} />
      <Title>{c.scenarioTitle}</Title>
      <Body muted>
        With {c.personaName} · {LEVEL_LABEL[c.difficulty]} · {c.durationMs !== null ? formatMinutes(Math.round(c.durationMs / 1000)) : 'in progress'}
        {c.endReason ? ` · ${END_REASON[c.endReason] ?? ''}` : ''}
      </Body>

      <Card>
        <Body>{c.brief.briefing}</Body>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Goals for this conversation</Text>
        {c.goals.map((g) => (
          <Text key={g.id} style={styles.goal}>
            {g.achieved ? '✓ ' : '• '}
            {g.description}
          </Text>
        ))}
        <Body muted>Detailed feedback on your English (grammar, vocabulary, fluency) is coming in the next update.</Body>
      </Card>

      {c.recording ? <RecordingSection id={c.id} inProgress={c.recording.inProgress} durationMs={c.recording.durationMs} /> : null}

      <Text style={styles.sectionTitle}>Transcript</Text>
      {c.turns.length === 0 ? <Body muted>Nothing was said in this conversation.</Body> : null}
      {c.turns.map((t) => (
        <View key={t.seq} style={[styles.bubble, t.speaker === 'USER' ? styles.user : styles.ai]}>
          <Text style={styles.speaker}>{t.speaker === 'USER' ? 'You' : c.personaName}</Text>
          <Text style={styles.text}>
            {t.text || '…'}
            {t.interrupted ? <Text style={styles.cut}> — (interrupted)</Text> : null}
          </Text>
        </View>
      ))}

      <Button label="Practise again" onPress={() => router.replace('/practice')} />
      {confirmDelete ? (
        <>
          <Body muted>Delete this conversation and its transcript? This can’t be undone.</Body>
          <Button label="Yes, delete it" variant="danger" onPress={() => remove.mutate()} loading={remove.isPending} />
          <Button label="Keep it" variant="ghost" onPress={() => setConfirmDelete(false)} />
        </>
      ) : (
        <Button label="Delete conversation" variant="ghost" onPress={() => setConfirmDelete(true)} />
      )}
      <ErrorText>{remove.error ? friendlyError(remove.error) : null}</ErrorText>
    </Screen>
  );
}

function RecordingSection({ id, inProgress, durationMs }: { id: string; inProgress: boolean; durationMs: number | null }) {
  const qc = useQueryClient();
  const [cookie, setCookie] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    void authClient.getCookie().then(setCookie);
  }, []);
  const remove = useMutation({
    mutationFn: () => api.deleteRecording(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: conversationKey(id) }),
  });

  return (
    <Card>
      <Text style={styles.sectionTitle}>Recording</Text>
      {inProgress ? (
        <Body muted>The recording is being saved…</Body>
      ) : !audioPlaybackAvailable() ? (
        <Body muted>Update the SpeakAI app to listen to recordings.</Body>
      ) : cookie ? (
        <Suspense fallback={<Body muted>Loading player…</Body>}>
          <RecordingPlayer uri={api.recordingUrl(id)} cookie={cookie} knownDurationMs={durationMs} />
        </Suspense>
      ) : null}
      {!inProgress &&
        (confirm ? (
          <>
            <Body muted>Delete this recording? The transcript stays.</Body>
            <Button label="Yes, delete recording" variant="danger" onPress={() => remove.mutate()} loading={remove.isPending} />
            <Button label="Keep it" variant="ghost" onPress={() => setConfirm(false)} />
          </>
        ) : (
          <Button label="Delete recording" variant="ghost" onPress={() => setConfirm(true)} />
        ))}
      <ErrorText>{remove.error ? friendlyError(remove.error) : null}</ErrorText>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  goal: { color: colors.text, fontSize: 15, lineHeight: 22 },
  bubble: { borderRadius: radius.md, padding: 12, maxWidth: '88%' },
  ai: { backgroundColor: colors.surface, alignSelf: 'flex-start' },
  user: { backgroundColor: colors.surfaceRaised, alignSelf: 'flex-end' },
  speaker: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  text: { color: colors.text, fontSize: 16, lineHeight: 22 },
  cut: { color: colors.textMuted, fontSize: 13 },
});
