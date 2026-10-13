import type { Metadata } from 'next';
import Link from 'next/link';
import { LEGAL, LegalPage, List, Mail, Section } from '../legal';

export const metadata: Metadata = {
  title: 'Privacy policy — Talkel',
  description: 'What Talkel collects, why, who processes it, and how to access or delete your data.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro="Talkel is an app for practising spoken English with an AI conversation partner. This policy explains what we collect, why, who helps us process it, and the choices you have. We collect only what the app needs to work."
    >
      <Section title="Who we are">
        <p>
          Talkel is operated by {LEGAL.operator} based in {LEGAL.location} (“Talkel”, “we”, “us”). For anything about your data —
          including questions, requests or complaints — email <Mail />. We act as the data fiduciary for your personal data under
          India’s Digital Personal Data Protection Act, 2023.
        </p>
      </Section>

      <Section title="What we collect">
        <List
          items={[
            <>
              <strong>Account details:</strong> your name, email address and password (stored only as a secure hash). If you sign in
              with Google, we receive your name, email address and profile picture from Google.
            </>,
            <>
              <strong>Learning profile:</strong> what you tell us during setup and in settings — your English level, goals, native
              language, feedback language, time zone and preferences.
            </>,
            <>
              <strong>Your voice during calls:</strong> while a call is active, your microphone audio is streamed to our AI provider so
              the AI partner can understand and answer you. We do <strong>not</strong> store this audio unless you choose to record
              the call (see below).
            </>,
            <>
              <strong>Conversation content:</strong> the text transcript of each conversation, the scenario you practised, any job
              details you chose to enter (for example your job title or experience), and the feedback, scores, mistakes and
              suggestions we generate from it.
            </>,
            <>
              <strong>Call recordings (optional, Pro):</strong> only if you tap “Record” during a call. A recording contains both your
              voice and the AI’s voice. It is private to you.
            </>,
            <>
              <strong>Personal memory (optional, off by default):</strong> if you turn it on, short facts the AI learns from your chats
              (for example “is preparing for an interview”) so later conversations feel personal.
            </>,
            <>
              <strong>Usage and technical data:</strong> call length and minutes used, call-quality measurements, your IP address and
              device/browser type for sign-in sessions and security (such as rate limiting), and basic server logs.
            </>,
          ]}
        />
        <p>We do not use advertising trackers, we do not sell your data, and we do not use your data to target ads.</p>
      </Section>

      <Section title="Why we use it">
        <List
          items={[
            'To run your account and keep it secure (sign-in, email verification, password reset).',
            'To hold the conversation itself, and to give you feedback on grammar, vocabulary and fluency afterwards.',
            'To track your progress, recommend what to practise next, and personalise conversations if you turned memory on.',
            'To apply your plan’s limits (such as daily practice minutes) and prevent abuse.',
            'To send account emails — verification, welcome, password reset, password changed and account deletion. We don’t send marketing emails.',
            'To find and fix problems and improve the app.',
          ]}
        />
        <p>
          We process your data on the basis of the consent you give when you create your account and agree to this policy, and
          where needed to provide the service you asked for. You can withdraw consent at any time by deleting your data or your
          account.
        </p>
      </Section>

      <Section title="Who processes your data for us">
        <p>We use these service providers. Each one only gets what it needs to do its job:</p>
        <List
          items={[
            <>
              <strong>Google (Gemini API)</strong> — receives your voice during calls and conversation transcripts, to generate the AI
              partner’s replies and your feedback. Google processes this under its Gemini API terms. Depending on the service tier we
              use, Google may use this content to improve its products.
            </>,
            <>
              <strong>Supabase</strong> — our database and file storage (account data, transcripts, feedback and recordings). Servers
              in South Korea.
            </>,
            <>
              <strong>Render</strong> — runs our server. Servers in Singapore.
            </>,
            <>
              <strong>Vercel</strong> and <strong>Cloudflare</strong> — host our website and route traffic to our server.
            </>,
            <>
              <strong>Brevo</strong> — sends our account emails (your email address, name and the email content).
            </>,
            <>
              <strong>Google Sign-In</strong> — only if you choose to sign in with Google.
            </>,
          ]}
        />
        <p>
          Because these providers operate outside India, your data may be processed in other countries. We only use providers that
          protect it with appropriate security measures. We may also disclose data if the law requires us to.
        </p>
      </Section>

      <Section title="How long we keep it">
        <List
          items={[
            'Your account, transcripts, feedback and progress: until you delete them or your account.',
            'Recordings: until you delete the recording, the conversation, or your account.',
            'Personal memory: until you delete a memory, turn memory off (which forgets everything), or delete your account.',
            'Sign-in sessions expire after 30 days of inactivity.',
            'When you delete your account, we delete your data from our active systems straight away. Copies in our providers’ backups are removed within 30 days.',
          ]}
        />
      </Section>

      <Section title="Your rights and choices">
        <p>You can do most of this yourself, inside the app:</p>
        <List
          items={[
            <>
              <strong>See and download your data:</strong> Profile → Your data → Download my data.
            </>,
            <>
              <strong>Correct it:</strong> edit your profile and settings at any time.
            </>,
            <>
              <strong>Delete it:</strong> delete single conversations, recordings or memories, or your whole account. See{' '}
              <Link href="/delete-account">how to delete your account</Link>.
            </>,
            <>
              <strong>Withdraw consent</strong> by deleting your data or account, and <strong>nominate</strong> someone to exercise
              your rights if you die or become unable to — email us.
            </>,
          ]}
        />
        <p>
          For anything else, or if you are unhappy with how we handled your data, email our grievance contact at <Mail />. We reply
          within 30 days. If you are not satisfied, you may complain to the Data Protection Board of India.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Data is encrypted in transit (HTTPS). Passwords are stored as secure hashes. Recordings are stored privately and are only
          ever streamed to their owner after we check who is asking. No system is perfectly secure, but we take reasonable steps to
          protect your data and will tell you and the authorities about a breach as the law requires.
        </p>
      </Section>

      <Section title="Age limit">
        <p>
          Talkel is for people aged 18 and over. We do not knowingly collect data from anyone under 18. If you believe someone under
          18 has an account, email <Mail /> and we will delete it.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If we change this policy in a way that matters, we will tell you in the app and ask you to agree again before you continue.
          The date at the top shows when it last changed.
        </p>
      </Section>
    </LegalPage>
  );
}
