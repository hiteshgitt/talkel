import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Brand } from '@/components/brand';
import { ThemeToggle } from '@/components/theme-toggle';
import { EARLY_ACCESS_APK } from '@/lib/early-access';

export const metadata: Metadata = {
  title: 'Try Talkel early — Android test version',
  description: 'Download the Talkel test version for Android and practise real English conversations with AI before launch.',
};

const CONTACT = 'talkel@ruyalab.com';

const STEPS: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: 'Download the app file',
    body: `Tap the button above on your Android phone. The file is about ${EARLY_ACCESS_APK.sizeMb} MB, so Wi-Fi is best.`,
    icon: <path d="M12 4v10M8 10l4 4 4-4M5 18h14" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: 'Allow the install',
    body: 'Open the downloaded file. If Android asks, allow your browser to “install unknown apps”. Because Talkel isn’t on the Play Store yet, Google Play Protect may show a warning — tap “More details” and “Install anyway”.',
    icon: <path d="M12 3.5 5 6.5v5.2c0 4.2 2.8 7.2 7 8.8 4.2-1.6 7-4.6 7-8.8V6.5L12 3.5z" />,
  },
  {
    title: 'Create your account',
    body: 'Open Talkel, sign up with your email, and confirm the email we send you.',
    icon: <path d="M4 7h16v10H4zM4 8l8 6 8-6" strokeLinejoin="round" />,
  },
  {
    title: 'Start talking',
    body: 'Allow the microphone when asked, pick a situation and start your first call. You get 10 free minutes every day.',
    icon: <path d="M8 4h2.2a1 1 0 0 1 1 .8l.6 2.6a1 1 0 0 1-.5 1.1L9.6 9.6a12 12 0 0 0 4.8 4.8l1.1-1.7a1 1 0 0 1 1.1-.5l2.6.6a1 1 0 0 1 .8 1V17a2 2 0 0 1-2.2 2A14 14 0 0 1 5 6.2 2 2 0 0 1 7 4h1z" />,
  },
];

const NOTES: { title: string; body: ReactNode; icon: ReactNode }[] = [
  {
    title: 'It’s an early test',
    body: 'You may find bugs, and features can change.',
    icon: <path d="M12 8v5M12 16.5h.01M12 3.5 2.8 19h18.4L12 3.5z" strokeLinejoin="round" strokeLinecap="round" />,
  },
  {
    title: 'Updating an older test',
    body: 'Installed a test version before 14 October 2026? This one installs as a separate app — sign in with the same account, then delete the old Talkel.',
    icon: <path d="M4.5 12a7.5 7.5 0 1 0 2-5.1M4.5 4.5V8H8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: 'When it reaches the Play Store',
    body: 'Uninstall this version and install Talkel from Google Play. Your account, conversations and progress are saved online, so nothing is lost.',
    icon: <path d="M12 4 4 8l8 4 8-4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4" strokeLinejoin="round" />,
  },
  {
    title: 'Tell us what you find',
    body: (
      <>
        Found a problem or have an idea? Email{' '}
        <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">
          {CONTACT}
        </a>
        .
      </>
    ),
    icon: <path d="M5 6.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-4 3v-3H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />,
  },
];

export default function DownloadPage() {
  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <header className="site-header page-wrap sticky z-30 py-3">
        <div className="flex items-center justify-between gap-3">
          <Brand />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/sign-in" className="nav-link hidden rounded-full border border-line px-4 py-2 text-fg transition hover:border-accent sm:inline-flex">
              Sign in
            </Link>
            <Link href="/" className="nav-link rounded-full border border-line px-4 py-2 text-fg transition hover:border-accent">
              Home
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="page-wrap grid items-center gap-[clamp(28px,3vw,56px)] py-[clamp(40px,5vw,88px)] lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="text-sm font-medium text-accent">Early access · Android test version</p>
            <h1 className="hero-title mt-[clamp(12px,1.2vw,18px)] max-w-[14em]">
              Try Talkel
              <br />
              <span className="text-accent">before everyone else</span>
            </h1>
            <p className="mt-[clamp(16px,1.4vw,24px)] max-w-[46ch] text-[length:var(--lead-size)] leading-relaxed text-muted">
              Practise real English conversations with an AI partner — interviews, salary talks, everyday situations — and get feedback on exactly what to fix.
            </p>
            <div className="mt-[clamp(22px,2vw,32px)] flex flex-wrap items-center gap-3">
              <a
                href={EARLY_ACCESS_APK.url}
                className="rounded-full bg-accent px-6 py-3.5 font-semibold text-white shadow-[0_16px_40px_-16px_rgba(110,139,255,0.95)] transition hover:brightness-110"
              >
                Download for Android
              </a>
              <a href="#install" className="rounded-full border border-line bg-surface px-6 py-3.5 font-medium text-fg transition hover:border-accent">
                How to install
              </a>
            </div>
            <p className="mt-4 text-sm text-muted">
              Test version, built {EARLY_ACCESS_APK.builtOn} · {EARLY_ACCESS_APK.sizeMb} MB · Android phones only · iPhone coming later
            </p>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute inset-[18%] rounded-full bg-accent/15 blur-3xl" />
            <div className="relative rounded-[2rem] border border-line bg-surface/80 p-[clamp(24px,2.4vw,40px)]">
              <Image src="/logo-mark.png" alt="" width={220} height={220} className="mx-auto h-auto w-[46%] max-w-[180px]" priority />
              <dl className="mt-8 grid grid-cols-3 gap-3 text-center">
                {[
                  [String(EARLY_ACCESS_APK.sizeMb), 'MB file'],
                  ['Android', 'phones only'],
                  ['10 min', 'free each day'],
                ].map(([value, label]) => (
                  <div key={label} className="rounded-2xl bg-raised px-2 py-3">
                    <dt className="font-display text-[clamp(1rem,1.15vw,1.35rem)] font-medium text-fg">{value}</dt>
                    <dd className="mt-1 text-xs text-muted">{label}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section id="install" className="page-wrap scroll-mt-28 border-t border-line py-[clamp(56px,5.5vw,96px)]">
          <p className="text-sm font-medium text-accent">01</p>
          <h2 className="section-title mt-2 max-w-[14em]">How to install</h2>
          <p className="mt-3 max-w-[46ch] text-[length:var(--lead-size)] text-muted">Four steps on your Android phone. Wi-Fi is the easier way to get the file.</p>
          <ol className="mt-[clamp(28px,2.4vw,44px)] grid gap-[clamp(20px,2vw,32px)] sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-t border-line pt-5">
                <div className="flex items-center gap-3">
                  <Icon>{step.icon}</Icon>
                  <span className="text-sm font-medium text-accent">0{index + 1}</span>
                </div>
                <h3 className="mt-4 font-semibold text-fg">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="page-wrap border-t border-line py-[clamp(56px,5.5vw,96px)]">
          <p className="text-sm font-medium text-accent">02</p>
          <h2 className="section-title mt-2 max-w-[14em]">Good to know</h2>
          <ul className="mt-[clamp(28px,2.4vw,44px)] grid gap-4 sm:grid-cols-2">
            {NOTES.map((note) => (
              <li key={note.title} className="rounded-3xl border border-line bg-surface/80 p-6">
                <Icon>{note.icon}</Icon>
                <h3 className="mt-4 font-semibold text-fg">{note.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{note.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="page-wrap flex flex-wrap items-center justify-between gap-4 py-[clamp(20px,1.8vw,32px)] text-sm text-muted">
          <span className="flex items-center gap-3">
            <Brand size={24} />
            <span>© {new Date().getFullYear()}</span>
            <span aria-hidden="true">·</span>
            <a href="https://ruyalab.com/" className="hover:text-fg">
              Built by Ruyalab
            </a>
          </span>
          <nav className="flex flex-wrap gap-5">
            <Link href="/" className="hover:text-fg">
              About Talkel
            </Link>
            <Link href="/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-fg">
              Terms
            </Link>
            <Link href="/delete-account" className="hover:text-fg">
              Delete account
            </Link>
            <a href={`mailto:${CONTACT}`} className="hover:text-fg">
              {CONTACT}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent/12 text-accent">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        {children}
      </svg>
    </span>
  );
}
