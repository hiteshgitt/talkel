import Ionicons from '@expo/vector-icons/Ionicons';
import type { CustomTopic } from '@speakai/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText } from '@/components/ui';
import { api, friendlyError } from '@/lib/api';
import { TOPICS_KEY } from '@/lib/queries';
import { makeStyles, useColors } from '@/theme';

/** On the setup screen of a custom topic: who you'll talk to, what to do, and edit/delete. */
export function TopicCard({ topic }: { topic: CustomTopic }) {
  const s = useStyles();
  const c = useColors();
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.deleteTopic(topic.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: TOPICS_KEY });
      router.back();
    },
  });

  return (
    <Card>
      <View style={s.row}>
        <Ionicons name="person-circle-outline" size={20} color={c.accent} />
        <Text style={s.who}>You’ll talk to {topic.aiCharacter}</Text>
      </View>
      <Body>{topic.briefing}</Body>
      <View style={s.goals}>
        {topic.goals.map((g) => (
          <View key={g} style={s.row}>
            <Ionicons name="flag-outline" size={16} color={c.textMuted} />
            <Text style={s.goal}>{g}</Text>
          </View>
        ))}
      </View>
      {confirm ? (
        <>
          <Body muted>
            Delete this topic?{topic.practised > 0 ? ' Your past conversations on it stay in History.' : ''}
          </Body>
          <View style={s.actions}>
            <Button compact label="Cancel" variant="secondary" onPress={() => setConfirm(false)} />
            <Button compact label="Delete" variant="danger" icon="trash-outline" loading={remove.isPending} onPress={() => remove.mutate()} />
          </View>
        </>
      ) : (
        <View style={s.actions}>
          <Button compact label="Edit" variant="secondary" icon="create-outline" onPress={() => router.push({ pathname: '/topic/edit', params: { id: topic.id } })} />
          <Button compact label="Delete" variant="ghost" icon="trash-outline" onPress={() => setConfirm(true)} />
        </View>
      )}
      <ErrorText>{remove.error ? friendlyError(remove.error) : null}</ErrorText>
    </Card>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    who: { color: c.text, fontSize: 16, fontWeight: '700', flexShrink: 1 },
    goals: { gap: 6 },
    goal: { color: c.textMuted, fontSize: 14, flexShrink: 1 },
    actions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  }),
);
