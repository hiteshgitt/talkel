import { redirect } from 'next/navigation';
import { AppHeader } from '@/components/app-header';
import { Card } from '@/components/ui';
import { getMe } from '@/lib/server-api';

const LEVEL: Record<string, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  UPPER_INTERMEDIATE: 'Upper intermediate',
  ADVANCED: 'Advanced',
  EXPERT: 'Expert',
};

const GOAL: Record<string, string> = {
  daily_conversation: 'Everyday conversation',
  job_interviews: 'Job interviews',
  work_meetings: 'Work meetings',
  client_calls: 'Client calls',
  presentations: 'Presentations',
  travel: 'Travel',
  exams_migration: 'Exams / migration',
  confidence: 'Speaking confidence',
};

export default async function DashboardPage() {
  const me = await getMe();
  if (!me) redirect('/sign-in');

  const name = (me.profile.displayName ?? me.user.name).split(' ')[0];

  return (
    <>
      <AppHeader me={me} />
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold">Hi {name} 👋</h1>
          <p className="text-muted">{me.user.email}</p>
        </div>

        {!me.onboarded ? (
          <Card className="border border-accent/40">
            <h2 className="font-semibold">Finish setting up in the app</h2>
            <p className="mt-1 text-sm text-muted">
              Open the Talkel Android app and sign in to choose your level, goals and feedback language. Conversations happen in the app.
            </p>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-sm text-muted">Level (self-assessed)</p>
            <p className="mt-1 text-lg font-semibold">{me.profile.selfReportedLevel ? LEVEL[me.profile.selfReportedLevel] : 'Not set'}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Feedback language</p>
            <p className="mt-1 text-lg font-semibold">{me.settings.feedbackLanguage === 'hi' ? 'हिन्दी (Hindi)' : 'English'}</p>
          </Card>
          <Card>
            <p className="text-sm text-muted">Goals</p>
            <p className="mt-1 text-sm">{me.profile.goals.length ? me.profile.goals.map((g) => GOAL[g] ?? g).join(', ') : 'Not set'}</p>
          </Card>
        </div>

        <Card>
          <h2 className="font-semibold">Your progress</h2>
          <p className="mt-1 text-sm text-muted">
            Conversation history, speaking time, skill trends and your common mistakes will appear here as you practise. Coming in the next updates.
          </p>
        </Card>
      </main>
    </>
  );
}
