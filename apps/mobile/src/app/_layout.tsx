import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'SpeakAI' }} />
        <Stack.Screen name="call" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="transcript/[callId]" options={{ title: 'Transcript' }} />
      </Stack>
    </>
  );
}
