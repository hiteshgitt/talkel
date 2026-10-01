import { GrammarCategory } from '@speakai/contracts';
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Loading, Screen, Title } from '@/components/ui';
import { api, friendlyError } from '@/lib/api';
import { MISTAKE_LABEL } from '@/lib/labels';
import { makeStyles, useColors } from '@/theme';
import { IconBadge } from '@/components/art';
import Ionicons from '@expo/vector-icons/Ionicons';

/** Every correction of one mistake type, so the learner can see the pattern. */
export default function MistakesScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { category } = useLocalSearchParams<{ category: string }>();
  const q = useQuery({ queryKey: ['progress', 'mistakes', category], queryFn: () => api.mistakes(category) });
  const parsed = GrammarCategory.safeParse(category);
  const title = parsed.success ? MISTAKE_LABEL[parsed.data] : 'Mistakes';

  if (q.isPending) return <Loading />;

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: '' }} />
      <View style={styles.head}>
        <IconBadge name="create-outline" tint={colors.danger} size={44} />
        <View style={styles.flex}>
          <Title>{title}</Title>
        </View>
      </View>
      {q.isError ? (
        <>
          <ErrorText>{friendlyError(q.error)}</ErrorText>
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </>
      ) : null}
      {q.data ? (
        <>
          <Body muted>
            {q.data.items.length === 1 ? '1 example' : `${q.data.items.length} examples`} from your conversations, newest first. Say the
            corrected version out loud a few times.
          </Body>
          {q.data.items.map((e, i) => (
            <Card key={i}>
              <Text style={styles.wrong}>{e.original}</Text>
              <View style={styles.inline}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <Text style={[styles.right, styles.flex]}>{e.corrected}</Text>
              </View>
              {e.explanation ? <Text style={styles.muted}>{e.explanation}</Text> : null}
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/conversation/[id]', params: { id: e.conversationId } })}
                style={({ pressed }) => [styles.source, pressed && styles.pressed]}
              >
                <View style={styles.sourceRow}>
                  <Text style={styles.sourceText}>
                    {e.scenarioTitle} · {new Date(e.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.accent} />
                </View>
              </Pressable>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wrong: { color: c.danger, fontSize: 16, textDecorationLine: 'line-through' },
  right: { color: c.userSpeaking, fontSize: 17, fontWeight: '600' },
  muted: { color: c.textMuted, fontSize: 14, lineHeight: 20 },
  source: { marginTop: 6 },
  sourceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sourceText: { color: c.accent, fontSize: 13, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  }),
);
