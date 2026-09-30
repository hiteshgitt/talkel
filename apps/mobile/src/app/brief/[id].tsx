import type { CreateConversationResponse } from '@speakai/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { LEVEL_LABEL } from '@/components/pickers';
import { Body, Button, Card, ErrorText, Screen, Title } from '@/components/ui';
import { createdConversationKey, formatMinutes } from '@/lib/queries';
import { colors } from '@/theme';

/** Pre-conversation brief (PRD §24): the situation and objective — never the AI's questions. */
export default function BriefScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const created = qc.getQueryData<CreateConversationResponse>(createdConversationKey(id));

  if (!created) {
    return (
      <Screen>
        <ErrorText>This conversation setup has expired.</ErrorText>
        <Button label="Choose a scenario" onPress={() => router.replace('/practice')} />
      </Screen>
    );
  }

  const start = () =>
    router.replace({
      pathname: '/call',
      params: { conversationId: created.id, personaName: created.persona.name, title: created.brief.title },
    });

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: 'Your brief' }} />
      <Title>{created.brief.title}</Title>
      <Card>
        <Body>{created.brief.briefing}</Body>
      </Card>

      <View style={styles.facts}>
        <Fact label="You are" value={created.brief.userRole} />
        <Fact label="Your goal" value={created.brief.objective} />
        <Fact label="Talking to" value={`${created.persona.name} — ${created.persona.description}`} />
        <Fact label="Level · length" value={`${LEVEL_LABEL[created.difficulty]} · up to ${formatMinutes(created.durationSec)}`} />
      </View>

      <Body muted>Speak naturally. It’s fine to pause, ask them to repeat, or say you don’t know a word.</Body>
      <Button label="Start call" onPress={start} />
      <Button label="Change settings" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  facts: { gap: 14 },
  fact: { gap: 2 },
  factLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  factValue: { color: colors.text, fontSize: 16, lineHeight: 22 },
});
