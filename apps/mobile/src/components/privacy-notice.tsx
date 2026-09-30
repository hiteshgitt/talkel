import { Body, Card } from '@/components/ui';

/** The privacy notice users agree to (version CONSENT_VERSION in @speakai/contracts). */
export function PrivacyNotice() {
  return (
    <Card>
      <Body>• Your voice is sent to our AI provider (Google Gemini) during calls so it can reply.</Body>
      <Body>• We don’t store your audio — unless you tap “Record” during a call. Recordings are private to you, and you can delete them any time.</Body>
      <Body>• We store the text transcript of each conversation so we can give you feedback and track your progress.</Body>
      <Body>• You can delete conversations, recordings or your whole account at any time.</Body>
    </Card>
  );
}
