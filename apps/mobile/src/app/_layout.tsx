import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { Button, ErrorText, Loading, Screen, Title } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { queryClient, useMe } from '@/lib/queries';
import { useColors } from '@/theme';

export default function RootLayout() {
  const c = useColors();
  // Navigation chrome (headers, transitions) follows the phone's light/dark setting too.
  const navTheme = useMemo(() => {
    const base = c.scheme === 'dark' ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, primary: c.accent, background: c.bg, card: c.bg, text: c.text, border: c.border } };
  }, [c]);
  useEffect(() => {
    // The window background shows briefly during transitions and keyboard animations.
    void SystemUI.setBackgroundColorAsync(c.bg).catch(() => undefined);
  }, [c.bg]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={navTheme}>
        <StatusBar style="auto" />
        <AppNavigator />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/**
 * Three states, enforced with protected routes (not just hidden buttons):
 *   signed out → (auth) · signed in, not onboarded → onboarding · ready → tabs + call screens
 */
function AppNavigator() {
  const c = useColors();
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
  const consentOk = onboarded && me.data?.consentRequired === false;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: c.bg },
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded && !consentOk}>
        <Stack.Screen name="consent" />
      </Stack.Protected>
      <Stack.Protected guard={consentOk}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scenario/[id]" />
        <Stack.Screen name="brief/[id]" />
        <Stack.Screen name="call" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="conversation/[id]" />
        <Stack.Screen name="mistakes/[category]" />
        <Stack.Screen name="mission/[id]" />
      </Stack.Protected>
    </Stack>
  );
}
