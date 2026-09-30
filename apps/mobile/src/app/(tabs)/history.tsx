import type { ConversationSummary } from '@speakai/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LEVEL_LABEL } from '@/components/pickers';
import { Body, Button, ErrorText, Loading, Title } from '@/components/ui';
import { api, friendlyError } from '@/lib/api';
import { CONVERSATIONS_KEY, formatMinutes } from '@/lib/queries';
import { colors, radius } from '@/theme';

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export default function HistoryScreen() {
  const q = useInfiniteQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: ({ pageParam }) => api.conversations(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (q.isPending) return <Loading />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <Title>History</Title>
            {q.isError ? <ErrorText>{friendlyError(q.error)}</ErrorText> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Body muted>No conversations yet. Your transcripts will appear here after each call.</Body>
            <Button label="Start practising" onPress={() => router.push('/practice')} />
          </View>
        }
        renderItem={({ item }) => <Row c={item} />}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.text} />}
      />
    </SafeAreaView>
  );
}

function Row({ c }: { c: ConversationSummary }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: c.id } })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowTop}>
        <Text style={styles.title}>{c.scenarioTitle}</Text>
        <Text style={styles.meta}>{when(c.createdAt)}</Text>
      </View>
      <Text style={styles.meta}>
        with {c.personaName} · {LEVEL_LABEL[c.difficulty]} · {c.durationMs !== null ? formatMinutes(Math.round(c.durationMs / 1000)) : 'in progress'} · {c.turnCount} turns
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 20, gap: 12 },
  header: { gap: 8, marginBottom: 4 },
  empty: { gap: 16, marginTop: 8 },
  row: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, gap: 6 },
  pressed: { opacity: 0.7 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 },
  title: { color: colors.text, fontSize: 17, fontWeight: '600', flexShrink: 1 },
  meta: { color: colors.textMuted, fontSize: 13 },
});
