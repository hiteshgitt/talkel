import Link from 'next/link';
import { Brand } from './brand';
import type { ReactNode } from 'react';

const FEATURES: { title: string; body: string }[] = [
  { title: 'A real phone call', body: 'Talk out loud in real time. Interrupt, pause, think — the AI answers like a person on the line, for 3, 5 or 10 minutes.' },
  { title: 'Practise for your own job', body: 'Type the role you’re applying for and your experience. The interviewer asks what that job really gets asked.' },
  { title: 'Missions with pressure', body: 'Characters with their own secret goal — a seller with a hidden floor price, a manager with a raise ceiling. Five levels, from Comfortable to Real world.' },
  { title: 'Feedback you can act on', body: 'An overall score, grammar fixes, better word choices, more natural phrasing, and your fluency: speed, filler words and pauses.' },
  { title: 'Catches Hinglish', body: 'Spots sentences translated word for word from Hindi and shows what a fluent speaker would say instead.' },
  { title: 'Explained in English or हिन्दी', body: 'The conversation stays in English. The feedback can be explained in Hindi when that helps it land.' },
  { title: 'Say it 3 ways', body: 'Take any sentence you said and see it natural, professional and casual.' },
  { title: 'Try that answer again', body: 'Replay one moment of the call, answer again, and compare your two answers side by side.' },
];

const SCENARIOS = ['Friendly chat', 'Job interview', 'Client meeting', 'Debate', 'Bargaining'];
const MISSIONS = [
  'Get the Job',
  'Negotiate Your Raise',
  'Calm an Angry Customer',
  'Pass the Visa Interview',
  'Pitch Your Idea',
  'Rebook a Cancelled Flight',
  'Face an Angry Manager',
  'Fix Your Hotel Problem',
  'Bargain Like a Local',
  'Win the Debate',
  'Make a New Friend',
];
const LEVELS = ['Comfortable', 'Natural', 'Challenging', 'Pressure', 'Real world'];

const FAQ: { q: string; a: string }[] = [
  { q: 'Is Talkel free?', a: 'Yes — you get 10 free minutes of conversation every day, with full feedback after every call. A Pro plan with more time and extra features is coming.' },
  { q: 'When can I get it?', a: 'Talkel is launching on Google Play soon. You can try the Android test version today from the download page.' },
  { q: 'What level of English do I need?', a: 'Any. Pick Beginner to Expert and the AI adjusts its vocabulary, speed and how hard it pushes back.' },
  { q: 'Is it a chatbot?', a: 'No typing. It’s a voice call: you speak, the AI speaks back in real time, in an Indian, American, British or Australian accent.' },
  { q: 'Do you store my voice?', a: 'No. Your voice is sent to our AI provider only while the call is on. Nothing is recorded unless you tap Record, and you can delete anything at any time.' },
];

export function Landing() {
  return (
    <div className="flex-1 overflow-x-hidden">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Brand />
        <nav className="flex items-center gap-5 text-sm">
          <a href="#features" className="hidden text-muted hover:text-fg sm:inline">
            Features
          </a>
          <a href="#how" className="hidden text-muted hover:text-fg sm:inline">
            How it works
          </a>
          <a href="#faq" className="hidden text-muted hover:text-fg sm:inline">
            FAQ
          </a>
          <Link href="/sign-in" className="text-muted hover:text-fg">
            Sign in
          </Link>
          <Link href="/download" className="rounded-full bg-accent px-4 py-2 font-semibold text-white hover:brightness-110">
            Download
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-16">
          <div className="space-y-6">
            <p className="inline-block rounded-full bg-raised px-3 py-1 text-xs font-semibold text-accent">Android app · launching soon</p>
            <h1 className="text-4xl font-bold leading-tight text-fg sm:text-5xl">Practise the English conversation you’re scared of — before it’s real.</h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted">
              Talkel is a real phone call with an AI partner. Rehearse your job interview, salary talk or tough client call, then see
              exactly what to fix.
            </p>
            <div className="flex flex-wrap gap-3">
              <CtaButton>Get early access</CtaButton>
              <a href="#how" className="rounded-full bg-raised px-6 py-3.5 font-semibold text-fg transition hover:brightness-125">
                See how it works
              </a>
            </div>
            <p className="text-sm text-muted">10 free minutes every day · No credit card</p>
          </div>
          <PhoneCall />
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-center gap-x-10 gap-y-3 px-4 py-6 text-center text-sm text-muted sm:px-6">
            <span>Indian characters and situations</span>
            <span>Indian, American, British or Australian accents</span>
            <span>Feedback in English or हिन्दी</span>
            <span>Beginner to Expert</span>
          </div>
        </section>

        <Section id="how" title="How it works" lead="Three steps, ten minutes a day.">
          <ol className="grid gap-4 sm:grid-cols-3">
            {[
              ['Pick a situation', 'A friendly chat, a job interview for your own role, or a mission like negotiating your raise.'],
              ['Talk it out', 'A live voice call with an AI character who reacts, asks follow-ups and pushes back.'],
              ['See what to fix', 'Your score, every mistake with the fix, better phrasing — then try that answer again.'],
            ].map(([title, body], i) => (
              <li key={title} className="rounded-2xl border border-line bg-surface p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">{i + 1}</span>
                <h3 className="mt-4 font-semibold text-fg">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="features" title="Everything you need to speak with confidence" lead="Built for the conversations that matter in Indian workplaces and everyday life.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-surface p-6">
                <h3 className="font-semibold text-fg">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Practise freely, or take on a mission" lead="Five open practice scenarios and eleven missions, each with five pressure levels.">
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            <div className="rounded-2xl border border-line bg-surface p-6">
              <h3 className="font-semibold text-fg">Practice</h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                {SCENARIOS.map((s) => (
                  <Chip key={s}>{s}</Chip>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-6">
              <h3 className="font-semibold text-fg">Missions</h3>
              <ul className="mt-4 flex flex-wrap gap-2">
                {MISSIONS.map((m) => (
                  <Chip key={m}>{m}</Chip>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-semibold text-fg">Levels:</span>
                {LEVELS.map((l, i) => (
                  <span key={l} className="rounded-full border border-line px-2.5 py-1">
                    {i + 1}. {l}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section title="Feedback that tells you exactly what to change" lead="After every call — usually within a minute.">
          <FeedbackCard />
        </Section>

        <Section title="Private by default" lead="Your practice stays yours.">
          <ul className="grid gap-4 sm:grid-cols-3">
            {[
              ['No audio stored', 'Your voice goes to our AI provider only during the call. Nothing is recorded unless you tap Record.'],
              ['Delete anything', 'Delete a conversation, a recording or your whole account at any time.'],
              ['No ads, no selling', 'We don’t sell your data or use it for advertising.'],
            ].map(([title, body]) => (
              <li key={title} className="rounded-2xl border border-line bg-surface p-6">
                <h3 className="font-semibold text-fg">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">
            Read our{' '}
            <Link href="/privacy" className="text-accent hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </Section>

        <Section title="Plans" lead="Start free. Upgrade when you want more.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Plan
              name="Free"
              price="₹0"
              items={['10 minutes of conversation every day', 'All practice scenarios and missions', 'Full feedback after every call', 'Try that answer again, Say it 3 ways']}
            />
            <Plan
              name="Pro"
              price="Coming soon"
              highlight
              items={['Much more practice time every day', 'Choose your partner and accent', 'Record calls and listen back', 'Everything in Free']}
            />
          </div>
        </Section>

        <Section id="faq" title="Questions" lead="">
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="cursor-pointer list-none font-semibold text-fg">
                  <span className="mr-2 inline-block text-accent transition group-open:rotate-45">+</span>
                  {f.q}
                </summary>
                <p className="mt-3 pl-5 leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="rounded-3xl bg-raised px-6 py-12 text-center">
            <h2 className="text-3xl font-bold text-fg">Your next interview, rehearsed tonight.</h2>
            <p className="mx-auto mt-3 max-w-lg text-muted">Try the Android test version today — free.</p>
            <div className="mt-6 flex justify-center">
              <CtaButton>Get early access</CtaButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
          <span className="flex items-center gap-3">
            <Brand size={24} />
            <span>© {new Date().getFullYear()}</span>
          </span>
          <nav className="flex flex-wrap gap-5">
            <Link href="/privacy" className="hover:text-fg">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-fg">
              Terms
            </Link>
            <Link href="/delete-account" className="hover:text-fg">
              Delete account
            </Link>
            <a href="mailto:talkel.app@gmail.com" className="hover:text-fg">
              talkel.app@gmail.com
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function CtaButton({ children }: { children: ReactNode }) {
  return (
    <Link href="/download" className="rounded-full bg-accent px-6 py-3.5 font-semibold text-white transition hover:brightness-110">
      {children}
    </Link>
  );
}

function Section({ id, title, lead, children }: { id?: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-8 px-4 py-16 sm:px-6">
      <h2 className="text-3xl font-bold text-fg">{title}</h2>
      {lead ? <p className="mt-2 text-muted">{lead}</p> : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <li className="rounded-full bg-raised px-3 py-1.5 text-sm text-fg">{children}</li>;
}

function Plan({ name, price, items, highlight }: { name: string; price: string; items: string[]; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl border p-6 ${highlight ? 'border-accent bg-raised' : 'border-line bg-surface'}`}>
      <div className="flex items-baseline justify-between">
        <h3 className="text-xl font-semibold text-fg">{name}</h3>
        <span className={highlight ? 'font-semibold text-accent' : 'font-semibold text-fg'}>{price}</span>
      </div>
      <ul className="mt-4 space-y-2 text-sm text-muted">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <span className="text-success">✓</span>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An illustration of the call screen (not a screenshot). */
function PhoneCall() {
  return (
    <div className="mx-auto w-full max-w-xs" aria-hidden>
      <div className="rounded-[2.5rem] border border-line bg-surface p-3 shadow-2xl shadow-black/40">
        <div className="rounded-[2rem] bg-bg px-6 pb-8 pt-6">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Job interview</span>
            <span className="rounded-full bg-danger/15 px-2 py-0.5 font-semibold text-danger">● REC</span>
          </div>
          <div className="mt-10 flex flex-col items-center gap-3">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-[#2b5bff] to-[#18e0e6] text-3xl font-bold text-white">R</div>
            <p className="text-lg font-semibold text-fg">Ruya</p>
            <p className="text-sm text-muted">Hiring manager · 03:12</p>
          </div>
          <div className="mt-8 rounded-2xl bg-surface p-4 text-sm leading-relaxed text-fg">
            “Tell me about a time a project didn’t go to plan. What did you do?”
          </div>
          <div className="mt-6 flex items-end justify-center gap-1" style={{ height: 28 }}>
            {[10, 18, 26, 14, 22, 28, 16, 20, 12, 24, 8].map((h, i) => (
              <span key={i} className="w-1.5 rounded-full bg-accent/70" style={{ height: h }} />
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-muted">Listening…</p>
          <div className="mt-8 flex justify-center gap-5">
            {['Mute', 'Speaker'].map((l) => (
              <span key={l} className="flex h-12 w-12 items-center justify-center rounded-full bg-raised text-[10px] text-muted">
                {l}
              </span>
            ))}
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-danger text-[10px] font-semibold text-white">End</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** An illustration of the feedback after a call (not real user data). */
function FeedbackCard() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-surface p-8 text-center">
        <span className="text-6xl font-bold text-fg">78</span>
        <span className="mt-1 text-sm text-muted">Overall score</span>
        <div className="mt-6 grid w-full grid-cols-3 gap-2 text-xs">
          {[
            ['112', 'words / min'],
            ['4', 'filler words'],
            ['2', 'long pauses'],
          ].map(([n, l]) => (
            <div key={l} className="rounded-xl bg-raised p-2">
              <div className="text-base font-semibold text-fg">{n}</div>
              <div className="text-muted">{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {[
          ['Grammar', 'I am working here since two years.', 'I have been working here for two years.'],
          ['Sounds translated', 'Please do the needful and revert back.', 'Could you take care of this and get back to me?'],
          ['More natural', 'I want to tell that I am interested.', 'I’d love to say I’m really interested.'],
        ].map(([kind, said, better]) => (
          <div key={kind} className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">{kind}</p>
            <p className="mt-2 text-muted line-through decoration-danger/70">{said}</p>
            <p className="mt-1 text-fg">{better}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
