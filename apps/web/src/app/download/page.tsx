import type { Metadata } from 'next';
import Link from 'next/link';
import { Brand } from '@/components/brand';
import { EARLY_ACCESS_APK } from '@/lib/early-access';

export const metadata: Metadata = {
  title: 'Try Talkel early — Android test version',
  description: 'Download the Talkel test version for Android and practise real English conversations with AI before launch.',
};

const STEPS: { title: string; body: string }[] = [
  { title: 'Download the app file', body: `Tap the button above on your Android phone. The file is about ${EARLY_ACCESS_APK.sizeMb} MB, so Wi-Fi is best.` },
  {
    title: 'Allow the install',
    body: 'Open the downloaded file. If Android asks, allow your browser to “install unknown apps”. Because Talkel isn’t on the Play Store yet, Google Play Protect may show a warning — tap “More details” and “Install anyway”.',
  },
  { title: 'Create your account', body: 'Open Talkel, sign up with your email, and confirm the email we send you.' },
  { title: 'Start talking', body: 'Allow the microphone when asked, pick a situation and start your first call. You get 10 free minutes every day.' },
];

export default function DownloadPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:py-16">
      <Brand />
      <p className="mt-10 w-fit rounded-full bg-raised px-3 py-1 text-xs font-semibold text-accent">Early access · Android test version</p>
      <h1 className="mt-4 text-3xl font-bold text-fg sm:text-4xl">Try Talkel before everyone else</h1>
      <p className="mt-4 text-lg leading-relaxed text-muted">
        Practise real English conversations with an AI partner — interviews, salary talks, everyday situations — and get feedback on
        exactly what to fix.
      </p>

      <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <a
          href={EARLY_ACCESS_APK.url}
          className="block w-full rounded-full bg-accent px-6 py-4 text-center font-semibold text-white transition hover:brightness-110"
        >
          Download for Android ({EARLY_ACCESS_APK.sizeMb} MB)
        </a>
        <p className="mt-3 text-center text-xs text-muted">Test version, built {EARLY_ACCESS_APK.builtOn} · Android phones only · iPhone coming later</p>
      </div>

      <h2 className="mt-12 text-xl font-semibold text-fg">How to install</h2>
      <ol className="mt-4 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{i + 1}</span>
            <div>
              <h3 className="font-semibold text-fg">{s.title}</h3>
              <p className="mt-1 leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-12 rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold text-fg">Good to know</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-muted marker:text-line">
          <li>This is an early test version: you may find bugs, and features can change.</li>
          <li>
            Installed a test version before 14 October 2026? This one installs as a separate app — sign in with the same account,
            then delete the old Talkel.
          </li>
          <li>
            When Talkel launches on Google Play, uninstall this version and install it from the Play Store. Your account, conversations
            and progress are saved online, so nothing is lost.
          </li>
          <li>
            Found a problem or have an idea? Email <a href="mailto:talkel.app@gmail.com" className="text-accent hover:underline">talkel.app@gmail.com</a>.
          </li>
        </ul>
      </div>

      <nav className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-sm text-muted">
        <Link href="/" className="hover:text-fg">
          About Talkel
        </Link>
        <Link href="/privacy" className="hover:text-fg">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-fg">
          Terms
        </Link>
      </nav>
    </main>
  );
}
