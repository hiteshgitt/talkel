import { CONSENT_VERSION } from '@speakai/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PrivacyNotice } from '@/components/privacy-notice';
import { IconBadge } from '@/components/art';
import { Body, Button, Choice, ErrorText, Screen, Title } from '@/components/ui';
import { api, friendlyError } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { ME_KEY } from '@/lib/queries';
import { useColors } from '@/theme';

/** Shown once when the privacy notice changed since the user last agreed. */
export default function ConsentScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const [agreed, setAgreed] = useState(false);
  const accept = useMutation({
    mutationFn: () => api.acceptConsent(CONSENT_VERSION),
    onSuccess: (me) => qc.setQueryData(ME_KEY, me),
  });

  return (
    <Screen style={{ paddingTop: 32 }}>
      <IconBadge name="shield-checkmark-outline" tint={c.accent} size={56} />
      <Title>We’ve updated our privacy notice</Title>
      <Body muted>What changed: you can now choose to record a call and listen to it later. Nothing is recorded unless you tap “Record”.</Body>
      <PrivacyNotice />
      <Choice role="checkbox" label="I agree" description="I understand how my voice, recordings and transcripts are used." selected={agreed} onPress={() => setAgreed((a) => !a)} />
      <ErrorText>{accept.error ? friendlyError(accept.error) : null}</ErrorText>
      <Button label="Continue" icon="checkmark" onPress={() => accept.mutate()} loading={accept.isPending} disabled={!agreed} />
      <Button label="Sign out" variant="ghost" onPress={() => void authClient.signOut()} />
    </Screen>
  );
}
