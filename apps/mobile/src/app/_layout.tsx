import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Button, ErrorText, Loading, Screen, Title } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { queryClient, useMe } from '@/lib/queries';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      <AppNavigator />
    </QueryClientProvider>
  );
}

/**
 * Three states, enforced with protected routes (not just hidden buttons):
 *   signed out → (auth) · signed in, not onboarded → onboarding · ready → tabs + call screens
 */
function AppNavigator() {
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session);
  const me = useMe(signedIn);

  if (isPending || (signedIn && me.isPending)) return <Loading />;
  if (signedIn && me.isError) {
    return (
      <Screen scroll={false} style={{ justifyContent: 'center' }}>
        <Title>Can’t load your account</Title>
        <ErrorText>{me.error instanceof Error ? me.error.message : 'Something went wrong.'}</ErrorText>
        <Button label="Try again" onPress={() => void me.refetch()} />
        <Button label="Sign out" variant="ghost" onPress={() => void authClient.signOut()} />
      </Screen>
    );
  }

  const onboarded = signedIn && me.data?.onboarded === true;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.bg },
        headerShown: false,
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scenario/[id]" />
        <Stack.Screen name="brief/[id]" />
        <Stack.Screen name="call" options={{ gestureEnabled: false }} />
        <Stack.Screen name="conversation/[id]" />
      </Stack.Protected>
    </Stack>
  );
}
