import { router } from 'expo-router';
import { Body, Button, Card, Screen, Title } from '@/components/ui';

/** Conversation history is stored from Milestone 2; until then this is an honest empty state. */
export default function HistoryScreen() {
  return (
    <Screen>
      <Title>History</Title>
      <Card>
        <Body>Your past conversations and their transcripts will appear here.</Body>
        <Body muted>Saving conversations to your account arrives in the next update. For now, you see the transcript right after each call.</Body>
      </Card>
      <Button label="Start a conversation" onPress={() => router.push('/practice')} />
    </Screen>
  );
}
