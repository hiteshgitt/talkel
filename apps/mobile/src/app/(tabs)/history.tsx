import type { ConversationSummary } from '@speakai/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScenarioArt } from '@/components/art';
import { Badge, Card, EmptyState, ErrorText, Loading, Title } from '@/components/ui';
import { Gauge } from '@/components/vector';
import { api, friendlyError } from '@/lib/api';
import { CONVERSATIONS_KEY, formatMinutes } from '@/lib/queries';
import { makeStyles, useColors } from '@/theme';

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86_400_000);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function HistoryScreen() {
  const s = useStyles();
  const c = useColors();
  const q = useInfiniteQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: ({ pageParam }) => api.conversations(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (q.isPending) return <Loading />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={s.header}>
            <Title>History</Title>
            {items.length ? <Text style={s.subtitle}>Tap a conversation for its transcript and feedback.</Text> : null}
            {q.isError ? <ErrorText>{friendlyError(q.error)}</ErrorText> : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="chatbubbles-outline"
            title="No conversations yet"
            body="After each call, its transcript and feedback appear here."
            action={{ label: 'Start practising', onPress: () => router.push('/practice') }}
          />
        }
        renderItem={({ item }) => <Row c={item} />}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && void q.fetchNextPage()}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={c.accent} colors={[c.accent]} />}
      />
    </SafeAreaView>
  );
}

function Row({ c: x }: { c: ConversationSummary }) {
  const s = useStyles();
  const live = x.status === 'ACTIVE' || x.status === 'CONNECTING' || x.status === 'RECONNECTING';
  return (
    <Card onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: x.id } })} accessibilityLabel={x.scenarioTitle} style={s.card}>
      <View style={s.row}>
        <ScenarioArt slug={x.scenarioSlug} size={48} />
        <View style={s.text}>
          <Text style={s.title} numberOfLines={1}>
            {x.scenarioTitle}
          </Text>
          <Text style={s.meta} numberOfLines={1}>
            with {x.personaName}
            {x.durationMs !== null ? ` · ${formatMinutes(Math.round(x.durationMs / 1000))}` : ''}
          </Text>
          <View style={s.dateRow}>
            <Text style={s.date}>{when(x.createdAt)}</Text>
            {x.missionLevel !== null ? <Badge label={`Mission · L${x.missionLevel}`} tone="accent" icon="flag" /> : null}
          </View>
        </View>
        {live ? <Badge label="Live" tone="success" /> : x.overallScore !== null ? <Score value={x.overallScore} /> : null}
      </View>
    </Card>
  );
}

function Score({ value }: { value: number }) {
  const c = useColors();
  const color = value >= 75 ? c.success : value >= 55 ? c.accent : c.warning;
  return <Gauge value={value} size={48} stroke={5} color={color} />;
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    list: { padding: 20, paddingBottom: 32, gap: 12 },
    header: { gap: 6, marginBottom: 6 },
    subtitle: { color: c.textMuted, fontSize: 14 },
    card: { paddingVertical: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    text: { flex: 1, gap: 2 },
    title: { color: c.text, fontSize: 16, fontWeight: '700' },
    meta: { color: c.textMuted, fontSize: 13 },
    date: { color: c.textFaint, fontSize: 12 },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  }),
);
