import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Screen, Title } from '@/components/ui';
import { api, friendlyError } from '@/lib/api';
import { configProblem } from '@/lib/config';
import { createdConversationKey, formatMinutes, useCatalog, useMe, useQuota } from '@/lib/queries';
import { nativeCallingProblem } from '@/lib/runtime';
import { preferredPersonaSlug } from '@/lib/voice';
import { colors } from '@/theme';

function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const catalog = useCatalog();
  const quota = useQuota();

  const friendly = catalog.data?.scenarios.find((s) => s.slug === 'friendly-conversation');
  const persona = catalog.data?.personas.find((p) => p.slug === preferredPersonaSlug(me));
  const remaining = quota.data?.remainingSec ?? 0;
  const problem = configProblem() ?? nativeCallingProblem();

  // One tap: a relaxed catch-up call with the preferred partner, using the saved defaults.
  const quickStart = useMutation({
    mutationFn: () => api.createConversation({ scenarioId: friendly!.id, personaId: persona!.id }),
    onSuccess: (created) => {
      qc.setQueryData(createdConversationKey(created.id), created);
      router.push({ pathname: '/brief/[id]', params: { id: created.id } });
    },
  });

  const firstName = (me?.profile.displayName ?? me?.user.name ?? '').split(' ')[0];
  const used = quota.data ? quota.data.dailyLimitSec - quota.data.remainingSec : 0;
  const pct = quota.data ? Math.min(1, used / quota.data.dailyLimitSec) : 0;

  return (
    <Screen>
      <View style={styles.header}>
        <Body muted>{greeting()}</Body>
        <Title>{firstName ? `Hi ${firstName} 👋` : 'Hi 👋'}</Title>
      </View>

      <Card style={styles.hero}>
        <Text style={styles.heroEyebrow}>Ready when you are</Text>
        <Text style={styles.heroTitle}>{persona ? `Have a quick chat with ${persona.name}` : 'Have a quick chat'}</Text>
        <Body muted>A relaxed catch-up call with a friend. Just talk — nobody corrects you during the call.</Body>
        <ErrorText>{problem ?? (quickStart.error ? friendlyError(quickStart.error) : null)}</ErrorText>
        <Button
          label="Start conversation"
          onPress={() => quickStart.mutate()}
          loading={quickStart.isPending}
          disabled={Boolean(problem) || !friendly || !persona || remaining < 30}
        />
      </Card>

      {quota.data ? (
        <Card>
          <Text style={styles.cardTitle}>Today’s practice</Text>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.round(pct * 100)}%` }]} />
          </View>
          <Body muted>
            {remaining > 0
              ? `${formatMinutes(used)} used · ${formatMinutes(remaining)} left of your ${formatMinutes(quota.data.dailyLimitSec)} free time`
              : `You’ve used all ${formatMinutes(quota.data.dailyLimitSec)} of today’s free time. It resets at midnight.`}
          </Body>
        </Card>
      ) : null}

      <Button label="Job interview, debate, bargaining…" variant="secondary" onPress={() => router.push('/practice')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginTop: 8 },
  hero: { gap: 12, paddingVertical: 22 },
  heroEyebrow: { color: colors.accent, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  heroTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceRaised, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: colors.userSpeaking },
});
