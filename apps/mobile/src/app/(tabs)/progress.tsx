import { Body, Card, Screen, Title } from '@/components/ui';
import { useMe } from '@/lib/queries';

const LEVEL_LABEL: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  UPPER_INTERMEDIATE: 'Upper intermediate',
  ADVANCED: 'Advanced',
  EXPERT: 'Expert',
};

/** Real progress data (speaking time, skills, mistakes) comes with conversation analysis (M3). */
export default function ProgressScreen() {
  const { data: me } = useMe();
  const level = me?.profile.selfReportedLevel;

  return (
    <Screen>
      <Title>Progress</Title>
      <Card>
        <Body muted>Your level (self-assessed)</Body>
        <Body>{level ? LEVEL_LABEL[level] : 'Not set'}</Body>
      </Card>
      <Card>
        <Body>Speaking time, skill trends and your most common mistakes will show here once feedback after each call is available.</Body>
        <Body muted>Coming in a later update.</Body>
      </Card>
    </Screen>
  );
}
