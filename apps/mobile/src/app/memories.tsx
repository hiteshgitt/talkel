import Ionicons from '@expo/vector-icons/Ionicons';
import { type MemoryKind } from '@speakai/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { IconBadge } from '@/components/art';
import { Body, Button, Card, EmptyState, ErrorText, Loading, Screen, Title } from '@/components/ui';
import { api, friendlyError } from '@/lib/api';
import { MEMORIES_KEY, MEMORY_EXPLAINER, MEMORY_KIND, useMemories } from '@/lib/memory';
import { makeStyles, useColors } from '@/theme';

const ORDER: MemoryKind[] = ['UPCOMING', 'WORK', 'ABOUT', 'INTERESTS', 'GOALS'];

/** "What Talkel remembers": every remembered fact, deletable one by one or all at once. */
export default function MemoriesScreen() {
  const s = useStyles();
  const c = useColors();
  const qc = useQueryClient();
  const q = useMemories();
  const [confirmAll, setConfirmAll] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: MEMORIES_KEY });
  const remove = useMutation({ mutationFn: api.deleteMemory, onSuccess: refresh });
  const clear = useMutation({ mutationFn: api.clearMemories, onSuccess: () => (setConfirmAll(false), refresh()) });

  if (q.isPending) return <Loading />;
  const items = q.data?.items ?? [];

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />
      <View style={s.head}>
        <IconBadge name="sparkles" tint={c.accent} size={44} />
        <View style={s.flex}>
          <Title>What Talkel remembers</Title>
        </View>
      </View>
      {q.isError ? <ErrorText>{friendlyError(q.error)}</ErrorText> : null}
      {q.data && !q.data.enabled ? (
        <Card>
          <Body>Memory is off. Turn it on in Profile if you’d like your partner to remember what you share.</Body>
          <Button label="Go to Profile" variant="secondary" onPress={() => router.push('/profile')} />
        </Card>
      ) : null}

      {q.data?.enabled && items.length === 0 ? (
        <EmptyState icon="sparkles-outline" title="Nothing yet" body="Have an everyday chat or a practice interview. Things you share about yourself will appear here." />
      ) : null}

      {ORDER.map((kind) => {
        const group = items.filter((m) => m.kind === kind);
        if (!group.length) return null;
        return (
          <Card key={kind}>
            <View style={s.groupHead}>
              <Ionicons name={MEMORY_KIND[kind].icon} size={18} color={c.accent} />
              <Text style={s.groupTitle}>{MEMORY_KIND[kind].label}</Text>
            </View>
            {group.map((m) => (
              <View key={m.id} style={s.item}>
                <Text style={s.itemText}>{m.text}</Text>
                <Pressable
                  onPress={() => remove.mutate(m.id)}
                  disabled={remove.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Forget: ${m.text}`}
                  hitSlop={8}
                  style={({ pressed }) => [s.trash, pressed && s.pressed]}
                >
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </Pressable>
              </View>
            ))}
          </Card>
        );
      })}

      <Card style={s.explainer}>
        {MEMORY_EXPLAINER.map((p) => (
          <View key={p.text} style={s.point}>
            <Ionicons name={p.icon} size={18} color={c.textMuted} />
            <Text style={s.pointText}>{p.text}</Text>
          </View>
        ))}
      </Card>

      {items.length ? (
        confirmAll ? (
          <>
            <Body muted>Forget everything Talkel remembers about you? This can’t be undone.</Body>
            <Button label="Yes, forget everything" variant="danger" onPress={() => clear.mutate()} loading={clear.isPending} />
            <Button label="Keep it" variant="ghost" onPress={() => setConfirmAll(false)} />
          </>
        ) : (
          <Button label="Forget everything" icon="trash-outline" variant="ghost" onPress={() => setConfirmAll(true)} />
        )
      ) : null}
      <ErrorText>{remove.error ? friendlyError(remove.error) : clear.error ? friendlyError(clear.error) : null}</ErrorText>
    </Screen>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    flex: { flex: 1 },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    groupTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    item: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    itemText: { color: c.text, fontSize: 15, lineHeight: 21, flex: 1 },
    trash: { padding: 6, borderRadius: 999, backgroundColor: c.dangerSoft },
    pressed: { opacity: 0.6 },
    explainer: { gap: 12 },
    point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    pointText: { color: c.textMuted, fontSize: 14, lineHeight: 20, flex: 1 },
  }),
);
