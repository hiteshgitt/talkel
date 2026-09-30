import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Body, Button, ErrorText, Loading, Screen, Title } from '@/components/ui';
import { LEVEL_LABEL } from '@/components/pickers';
import { friendlyError } from '@/lib/api';
import { formatMinutes, useCatalog, useQuota } from '@/lib/queries';
import { colors, radius } from '@/theme';

export default function PracticeScreen() {
  const catalog = useCatalog();
  const quota = useQuota();

  if (catalog.isPending) return <Loading />;
  if (catalog.isError) {
    return (
      <Screen>
        <Title>Practice</Title>
        <ErrorText>{friendlyError(catalog.error)}</ErrorText>
        <Button label="Try again" onPress={() => void catalog.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Practice</Title>
      {quota.data ? (
        <Body muted>
          {quota.data.remainingSec > 0 ? `${formatMinutes(quota.data.remainingSec)} of free practice left today` : 'You’ve used today’s free practice time. It resets at midnight.'}
        </Body>
      ) : null}

      {catalog.data.scenarios.map((s) => (
        <Pressable
          key={s.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/scenario/[id]', params: { id: s.id } })}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.category}>{s.category.name}</Text>
            <Text style={styles.meta}>
              ~{s.estimatedMinutes} min · from {LEVEL_LABEL[s.minLevel]}
            </Text>
          </View>
          <Text style={styles.title}>{s.title}</Text>
          <Text style={styles.tagline}>{s.tagline}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18, gap: 6 },
  pressed: { opacity: 0.7 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  category: { color: colors.accent, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  meta: { color: colors.textMuted, fontSize: 12 },
  title: { color: colors.text, fontSize: 20, fontWeight: '700' },
  tagline: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
});
