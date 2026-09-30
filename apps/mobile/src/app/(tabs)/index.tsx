import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Body, Button, Card, ErrorText, Screen, Title } from '@/components/ui';
import { configProblem } from '@/lib/config';
import { useMe } from '@/lib/queries';
import { nativeCallingProblem } from '@/lib/runtime';
import { PERSONAS, preferredVoice } from '@/lib/voice';
import { colors } from '@/theme';

function greeting(date = new Date()): string {
  const h = date.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const { data: me } = useMe();
  const voice = preferredVoice(me);
  const persona = PERSONAS[voice];
  const problem = configProblem() ?? nativeCallingProblem();
  const firstName = (me?.profile.displayName ?? me?.user.name ?? '').split(' ')[0];

  return (
    <Screen>
      <View style={styles.header}>
        <Body muted>{greeting()}</Body>
        <Title>{firstName ? `Hi ${firstName} 👋` : 'Hi 👋'}</Title>
      </View>

      <Card style={styles.hero}>
        <Text style={styles.heroEyebrow}>Ready when you are</Text>
        <Text style={styles.heroTitle}>Have a quick chat with {persona.name}</Text>
        <Body muted>A relaxed catch-up call with a friend. Just talk — nobody corrects you during the call.</Body>
        <ErrorText>{problem}</ErrorText>
        <Button
          label="Start conversation"
          onPress={() => router.push({ pathname: '/call', params: { voice } })}
          disabled={Boolean(problem)}
        />
      </Card>

      <Card>
        <Text style={styles.cardTitle}>Tip</Text>
        <Body muted>
          Hold the phone to your ear like a normal call, or use headphones. It’s fine to pause and think — the AI waits.
        </Body>
      </Card>

      <Button label="More ways to practise" variant="secondary" onPress={() => router.push('/practice')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 4, marginTop: 8 },
  hero: { gap: 12, paddingVertical: 22 },
  heroEyebrow: { color: colors.accent, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  heroTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
