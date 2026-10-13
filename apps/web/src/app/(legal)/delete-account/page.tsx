import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, List, Mail, Section } from '../legal';

export const metadata: Metadata = {
  title: 'Delete your account — Talkel',
  description: 'How to delete your Talkel account and all its data, from the app, the website or by email.',
};

export default function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your account"
      intro="You can delete your Talkel account and all of its data at any time. Deletion is permanent and can’t be undone."
    >
      <Section title="In the app">
        <List
          items={[
            <>
              Open the <strong>Profile</strong> tab and tap <strong>Delete account</strong>.
            </>,
            'Enter your password (if you signed in with Google, you may be asked to sign in again first).',
            <>
              Tick <strong>I understand</strong> and tap <strong>Permanently delete my account</strong>.
            </>,
          ]}
        />
      </Section>

      <Section title="On the website">
        <p>
          <Link href="/sign-in">Sign in</Link>, open <Link href="/account">your account page</Link>, choose{' '}
          <strong>Delete my account…</strong>, confirm, and tap <strong>Permanently delete my account</strong>.
        </p>
      </Section>

      <Section title="By email">
        <p>
          If you can’t sign in, email <Mail /> from the email address of your account and ask us to delete it. We may ask you to
          confirm the request, and we complete it within 30 days.
        </p>
      </Section>

      <Section title="What gets deleted">
        <p>Everything linked to your account:</p>
        <List
          items={[
            'your account details and learning profile;',
            'all conversations, transcripts, feedback, scores and progress;',
            'call recordings;',
            'personal memories and settings.',
          ]}
        />
        <p>
          It is removed from our active systems straight away, and from our providers’ backups within 30 days. We send a
          confirmation email when it’s done. If you only want to remove some data, you can instead delete single conversations,
          recordings or memories in the app and keep your account.
        </p>
      </Section>
    </LegalPage>
  );
}
