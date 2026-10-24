'use client';

import Image from 'next/image';
import Link from 'next/link';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { Brand } from './brand';
import { ThemeToggle } from './theme-toggle';
import 'lenis/dist/lenis.css';

gsap.registerPlugin(ScrollTrigger);

const LogoStage = dynamic(() => import('./logo-stage').then((mod) => mod.LogoStage), {
  ssr: false,
  loading: () => <LogoFallback />,
});

const CONTACT = 'talkel@ruyalab.com';

type GlyphName = 'phone' | 'briefcase' | 'target' | 'chart' | 'languages' | 'message' | 'layers' | 'replay' | 'pin' | 'wave' | 'shield' | 'lock';

const FEATURES: { title: string; body: string; icon: GlyphName }[] = [
  {
    title: 'A real phone call',
    body: 'Talk out loud in real time. Interrupt, pause, think — the AI answers like a person on the line, for 3, 5 or 10 minutes.',
    icon: 'phone',
  },
  {
    title: 'Practise for your own job',
    body: 'Type the role you’re applying for and your experience. The interviewer asks what that job really gets asked.',
    icon: 'briefcase',
  },
  {
    title: 'Missions with pressure',
    body: 'Characters with their own secret goal — a seller with a hidden floor price, a manager with a raise ceiling. Five levels, from Comfortable to Real world.',
    icon: 'target',
  },
  {
    title: 'Feedback you can act on',
    body: 'An overall score, grammar fixes, better word choices, more natural phrasing, and your fluency: speed, filler words and pauses.',
    icon: 'chart',
  },
  {
    title: 'Catches Hinglish',
    body: 'Spots sentences translated word for word from Hindi and shows what a fluent speaker would say instead.',
    icon: 'languages',
  },
  {
    title: 'Explained in English or हिन्दी',
    body: 'The conversation stays in English. The feedback can be explained in Hindi when that helps it land.',
    icon: 'message',
  },
  {
    title: 'Say it 3 ways',
    body: 'Take any sentence you said and see it natural, professional and casual.',
    icon: 'layers',
  },
  {
    title: 'Try that answer again',
    body: 'Replay one moment of the call, answer again, and compare your two answers side by side.',
    icon: 'replay',
  },
];

type CallPreview = {
  kind: 'practice' | 'mission';
  name: string;
  who: string;
  role: string;
  line: string;
};

const CALLS: CallPreview[] = [
  { kind: 'practice', name: 'Friendly chat', who: 'Meera', role: 'A new friend', line: 'You mentioned your weekend. What did you actually do — start anywhere.' },
  { kind: 'practice', name: 'Job interview', who: 'Ruya', role: 'Hiring manager', line: 'Tell me about a time a project didn’t go to plan. What did you do?' },
  { kind: 'practice', name: 'Client meeting', who: 'Kabir', role: 'Your client', line: 'The deadline moved up. Walk me through what you’d change first.' },
  { kind: 'practice', name: 'Debate', who: 'Anika', role: 'The other side', line: 'You say remote work is better. Give me one reason I can’t dismiss.' },
  { kind: 'practice', name: 'Bargaining', who: 'Imran', role: 'The seller', line: 'That’s the price on the tag. Why should I come down?' },
  { kind: 'mission', name: 'Get the Job', who: 'Ruya', role: 'Hiring manager', line: 'Everyone says they’re a team player. Tell me about a time you weren’t.' },
  { kind: 'mission', name: 'Negotiate Your Raise', who: 'Arjun', role: 'Your manager', line: 'I hear you. This band tops out lower than that. What else matters?' },
  { kind: 'mission', name: 'Calm an Angry Customer', who: 'Neha', role: 'The customer', line: 'I’ve been on hold for twenty minutes. This is the third time.' },
  { kind: 'mission', name: 'Pass the Visa Interview', who: 'Officer Shah', role: 'Visa officer', line: 'Why this trip, and why are you coming back?' },
  { kind: 'mission', name: 'Pitch Your Idea', who: 'Vikram', role: 'The investor', line: 'You have one minute. What is it, and who is it for?' },
  { kind: 'mission', name: 'Rebook a Cancelled Flight', who: 'Desk', role: 'Airline staff', line: 'That flight is gone. The next one with seats is tomorrow evening.' },
  { kind: 'mission', name: 'Face an Angry Manager', who: 'Arjun', role: 'Your manager', line: 'This was due this morning. I don’t want the history — I want a plan.' },
  { kind: 'mission', name: 'Fix Your Hotel Problem', who: 'Front desk', role: 'The hotel', line: 'The room you booked is occupied. We can move you to a smaller one.' },
  { kind: 'mission', name: 'Bargain Like a Local', who: 'Imran', role: 'The seller', line: 'For you, special price. But I can’t go lower than this.' },
  { kind: 'mission', name: 'Win the Debate', who: 'Anika', role: 'The other side', line: 'That’s a feeling, not an argument. Where’s the example?' },
  { kind: 'mission', name: 'Make a New Friend', who: 'Meera', role: 'Someone new', line: 'I don’t usually talk to people at these things. What brought you here?' },
];

const SCENARIOS = CALLS.filter((call) => call.kind === 'practice');
const MISSIONS = CALLS.filter((call) => call.kind === 'mission');
const LEVELS = [
  { name: 'Comfortable', tone: 'Slow, simple, plenty of time to think' },
  { name: 'Natural', tone: 'A normal conversation, with follow-ups' },
  { name: 'Challenging', tone: 'Harder vocabulary and a faster pace' },
  { name: 'Pressure', tone: 'They push back and don’t let you off easily' },
  { name: 'Real world', tone: 'Interruptions, stakes, and a hidden goal' },
] as const;
const DURATIONS = [3, 5, 10] as const;

const FAQ: { q: string; a: string }[] = [
  { q: 'Is Talkel free?', a: 'Yes — you get 10 free minutes of conversation every day, with full feedback after every call. A Pro plan with more time and extra features is coming.' },
  { q: 'When can I get it?', a: 'Talkel is launching on Google Play soon. You can try the Android test version today from the download page.' },
  { q: 'What level of English do I need?', a: 'Any. Pick Beginner to Expert and the AI adjusts its vocabulary, speed and how hard it pushes back.' },
  { q: 'Is it a chatbot?', a: 'No typing. It’s a voice call: you speak, the AI speaks back in real time, in an Indian, American, British or Australian accent.' },
  { q: 'Do you store my voice?', a: 'No. Your voice is sent to our AI provider only while the call is on. Nothing is recorded unless you tap Record, and you can delete anything at any time.' },
];

const NAV = [
  { href: '#how', label: 'How it works' },
  { href: '#practice', label: 'Practice' },
  { href: '#features', label: 'Features' },
  { href: '#faq', label: 'FAQ' },
];

export function Landing() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = root.current;
    if (!scope) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bar = scope.querySelector<HTMLElement>('[data-progress]');
    const paintChrome = (scroll: number) => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.transform = `scaleX(${max > 0 ? scroll / max : 0})`;
    };

    let lenis: Lenis | null = null;
    const onNativeScroll = () => {
      const scroll = window.scrollY;
      paintChrome(scroll);
    };

    if (!reduced) {
      lenis = new Lenis({ lerp: 0.085, smoothWheel: true, syncTouch: false, anchors: { offset: -84 } });
      lenis.on('scroll', (instance) => {
        ScrollTrigger.update();
        paintChrome(instance.scroll);
      });
      const tick = (time: number) => lenis?.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      const ctx = gsap.context(() => {
        gsap.from('[data-hero]', { y: 28, autoAlpha: 0, duration: 1, stagger: 0.08, ease: 'power3.out', delay: 0.05 });
        scope.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
          gsap.from(el, {
            y: 32,
            autoAlpha: 0,
            duration: 0.85,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          });
        });
        const line = scope.querySelector('[data-how-line]');
        if (line) {
          gsap.fromTo(line, { scaleX: 0 }, {
            scaleX: 1,
            ease: 'none',
            scrollTrigger: { trigger: '#how', start: 'top 70%', end: 'bottom 65%', scrub: 0.4 },
          });
        }
        scope.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
          const target = Number(el.dataset.count ?? '0');
          const value = { n: 0 };
          gsap.to(value, {
            n: target,
            duration: 1.35,
            ease: 'power2.out',
            scrollTrigger: { trigger: el, start: 'top 85%', once: true },
            onUpdate: () => {
              el.textContent = String(Math.round(value.n));
            },
          });
        });
      }, scope);

      return () => {
        ctx.revert();
        gsap.ticker.remove(tick);
        lenis?.destroy();
      };
    }

    window.addEventListener('scroll', onNativeScroll, { passive: true });
    onNativeScroll();
    return () => window.removeEventListener('scroll', onNativeScroll);
  }, []);

  return (
    <div ref={root} className="flex-1 overflow-x-clip bg-bg text-fg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <header data-header className="site-header page-wrap fixed z-30 py-3">
        <TopBar />
        <div data-progress className="absolute inset-x-8 bottom-0 h-px origin-left bg-gradient-to-r from-accent to-glow" style={{ transform: 'scaleX(0)' }} />
      </header>

      <main id="main">
        <section className="page-wrap grid items-center gap-[var(--space-block)] pt-[clamp(104px,9vw,140px)] pb-[clamp(36px,4vw,72px)] lg:grid-cols-[1.05fr_0.95fr]">
          <div className="order-2 min-w-0 lg:order-1">
            <p data-hero className="text-sm font-medium text-accent">Android app · launching soon</p>
            <h1 data-hero className="hero-title mt-[clamp(12px,1.2vw,18px)]">
              Practise the conversation you’re <span className="text-accent">scared of</span> — before it’s real.
            </h1>
            <p data-hero className="mt-[clamp(16px,1.4vw,24px)] max-w-[46ch] text-[length:var(--lead-size)] leading-relaxed text-muted">
              Talkel is a real phone call with an AI partner. Rehearse your job interview, salary talk or tough client call, then see exactly what to fix.
            </p>
            <div data-hero className="mt-[clamp(20px,1.8vw,28px)] flex max-w-full flex-wrap gap-3">
              <CtaButton>Get early access</CtaButton>
              <a href="#how" className="rounded-full border border-line bg-surface px-[clamp(18px,1.4vw,28px)] py-[clamp(12px,0.8vw,16px)] font-medium text-fg transition hover:border-accent">
                See how it works
              </a>
            </div>
          </div>
          <div data-hero className="relative order-1 min-w-0 lg:order-2">
            <div className="pointer-events-none absolute inset-[12%] rounded-full bg-accent/15 blur-3xl" />
            <div className="mark-stage">
              <LogoStage />
            </div>
            <p className="mt-2 text-center text-sm text-muted">Drag the mark to turn it</p>
          </div>
        </section>

        <Marquee />

        <section className="border-y border-line">
          <ul className="page-wrap grid gap-[clamp(14px,1.4vw,24px)] py-[clamp(16px,1.4vw,24px)] text-sm text-muted sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ['pin', 'Indian characters and situations'],
                ['wave', 'Indian, American, British or Australian accents'],
                ['languages', 'Feedback in English or हिन्दी'],
                ['chart', 'Beginner to Expert'],
              ] as const
            ).map(([icon, item]) => (
              <li key={item} className="flex items-center gap-3">
                <Glyph name={icon} compact />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <Section id="how" index="01" title="How it works" lead="Three steps, ten minutes a day.">
          <div className="relative">
            <div data-how-line className="absolute top-4 right-4 left-4 hidden h-px origin-left bg-gradient-to-r from-accent to-glow sm:block" />
            <ol className="grid gap-4 sm:grid-cols-3">
              {[
                ['Pick a situation', 'A friendly chat, a job interview for your own role, or a mission like negotiating your raise.'],
                ['Talk it out', 'A live voice call with an AI character who reacts, asks follow-ups and pushes back.'],
                ['See what to fix', 'Your score, every mistake with the fix, better phrasing — then try that answer again.'],
              ].map(([title, body], index) => (
                <li key={title} data-reveal className="border-t border-line pt-5">
                  <div className="flex items-center gap-3">
                    <Glyph name={index === 0 ? 'target' : index === 1 ? 'phone' : 'chart'} />
                    <span className="text-sm font-medium text-accent">0{index + 1}</span>
                  </div>
                  <h3 className="mt-4 font-semibold text-fg">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </Section>

        <Section id="practice" index="02" title="Practise freely, or take on a mission" lead="Five open practice scenarios and eleven missions, each with five pressure levels.">
          <Studio />
        </Section>

        <Section id="features" index="03" title="Everything you need to speak with confidence" lead="Built for the conversations that matter in Indian workplaces and everyday life.">
          <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {FEATURES.map((feature) => (
              <Spotlight key={feature.title}>
                <Glyph name={feature.icon} />
                <h3 className="mt-4 font-semibold text-fg">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
              </Spotlight>
            ))}
          </div>
        </Section>

        <Section index="04" title="Feedback that tells you exactly what to change" lead="After every call — usually within a minute.">
          <FeedbackCard />
        </Section>

        <Section index="05" title="Private by default" lead="Your practice stays yours.">
          <ul className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ['shield', 'No audio stored', 'Your voice goes to our AI provider only during the call. Nothing is recorded unless you tap Record.'],
                ['replay', 'Delete anything', 'Delete a conversation, a recording or your whole account at any time.'],
                ['lock', 'No ads, no selling', 'We don’t sell your data or use it for advertising.'],
              ] as const
            ).map(([icon, title, body]) => (
              <li key={title}>
                <Spotlight>
                  <Glyph name={icon} />
                  <h3 className="mt-4 font-semibold text-fg">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
                </Spotlight>
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

        <Section index="06" title="Plans" lead="Start free. Upgrade when you want more.">
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

        <Section id="faq" index="07" title="Questions" lead="">
          <div className="divide-y divide-line rounded-3xl border border-line bg-surface/80">
            {FAQ.map((item) => (
              <details key={item.q} className="group px-5 py-4">
                <summary className="cursor-pointer list-none font-semibold text-fg">
                  <span className="mr-3 inline-grid h-6 w-6 place-items-center rounded-full border border-line text-accent transition group-open:rotate-45">+</span>
                  {item.q}
                </summary>
                <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 group-open:grid-rows-[1fr]">
                  <p className="overflow-hidden pl-9 leading-relaxed text-muted">{item.a}</p>
                </div>
              </details>
            ))}
          </div>
        </Section>

        <section className="page-wrap border-t border-line py-[clamp(56px,6vw,96px)] text-center">
          <Image src="/logo-mark.png" alt="" width={72} height={72} className="mx-auto" />
          <h2 className="section-title mx-auto mt-4 max-w-[16em]">Your next interview, rehearsed tonight.</h2>
          <p className="mx-auto mt-3 max-w-[36ch] text-[length:var(--lead-size)] text-muted">Try the Android test version today — free.</p>
          <div className="mt-8 flex justify-center">
            <CtaButton>Get early access</CtaButton>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="page-wrap flex flex-wrap items-center justify-between gap-4 py-[clamp(20px,1.8vw,32px)] text-sm text-muted">
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
            <a href={`mailto:${CONTACT}`} className="hover:text-fg">
              {CONTACT}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function TopBar() {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
      <Brand />
      <nav className="hidden items-center justify-center gap-[clamp(16px,1.6vw,32px)] lg:flex">
        {NAV.map((item) => (
          <a key={item.href} href={item.href} className="nav-link text-muted transition hover:text-fg">
            {item.label}
          </a>
        ))}
      </nav>
      <div className="flex items-center justify-end gap-2">
        <details className="relative lg:hidden">
          <summary className="nav-link cursor-pointer list-none rounded-full border border-line px-3 py-2 text-fg">Menu</summary>
          <nav
            className="absolute right-0 mt-2 grid w-52 gap-1 rounded-2xl border border-line bg-surface p-2 shadow-2xl"
            onClick={(event) => {
              const menu = event.currentTarget.parentElement;
              if (menu instanceof HTMLDetailsElement) menu.open = false;
            }}
          >
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="nav-link rounded-xl px-3 py-2 text-fg hover:bg-raised">
                {item.label}
              </a>
            ))}
            <Link href="/sign-in" className="nav-link rounded-xl px-3 py-2 text-fg hover:bg-raised">
              Sign in
            </Link>
          </nav>
        </details>
        <ThemeToggle />
        <Link href="/sign-in" className="nav-link hidden rounded-full border border-line px-4 py-2 text-fg transition hover:border-accent lg:inline-flex">
          Sign in
        </Link>
        <Magnetic>
          <Link href="/download" className="nav-link rounded-full bg-accent px-4 py-2 text-white transition hover:brightness-110">
            Download
          </Link>
        </Magnetic>
      </div>
    </div>
  );
}

function LogoFallback() {
  return (
    <div className="grid h-full place-items-center">
      <Image src="/logo-mark.png" alt="" width={200} height={200} className="h-auto w-[42%] max-w-[180px]" />
    </div>
  );
}

function Magnetic({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  function onMove(event: PointerEvent<HTMLSpanElement>) {
    if (event.pointerType !== 'mouse' || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = event.clientX - rect.left - rect.width / 2;
    const y = event.clientY - rect.top - rect.height / 2;
    ref.current.style.transform = `translate(${x * 0.22}px, ${y * 0.35}px)`;
  }
  return (
    <span ref={ref} className="inline-flex transition-transform duration-200 ease-out" onPointerMove={onMove} onPointerLeave={() => { if (ref.current) ref.current.style.transform = ''; }}>
      {children}
    </span>
  );
}

function CtaButton({ children }: { children: ReactNode }) {
  return (
    <Magnetic>
      <Link href="/download" className="rounded-full bg-accent px-6 py-3.5 font-semibold text-white shadow-[0_16px_40px_-16px_rgba(110,139,255,0.95)] transition hover:brightness-110">
        {children}
      </Link>
    </Magnetic>
  );
}

function Section({ id, index, title, lead, children }: { id?: string; index: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} className="page-wrap scroll-mt-28 border-t border-line py-[clamp(56px,5.5vw,96px)]">
      <p className="text-sm font-medium text-accent">{index}</p>
      <h2 data-reveal className="section-title mt-2 max-w-[18em]">{title}</h2>
      {lead ? <p className="mt-3 max-w-[52ch] text-[length:var(--lead-size)] text-muted">{lead}</p> : null}
      <div className="mt-[clamp(28px,2.4vw,44px)]">{children}</div>
    </section>
  );
}

function Marquee() {
  const items = [...SCENARIOS, ...MISSIONS];
  const loop = [...items, ...items];
  return (
    <div className="overflow-hidden py-[clamp(14px,1vw,20px)]">
      <ul className="animate-marquee flex w-max items-center gap-8 pr-8">
        {loop.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex items-center gap-8 text-sm text-muted">
            <span className="h-1 w-1 rounded-full bg-glow" />
            {item.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Studio() {
  const [name, setName] = useState('Job interview');
  const [level, setLevel] = useState(1);
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(5);
  const call = CALLS.find((item) => item.name === name) ?? CALLS[1];
  const pressure = LEVELS[level] ?? LEVELS[1];

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,280px)_1fr]">
      <Phone call={call} duration={duration} levelName={pressure.name} pace={1.15 - level * 0.14} />
      <div className="space-y-7">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">Call length</p>
          <div className="mt-3 flex gap-2">
            {DURATIONS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={duration === minutes}
                onClick={() => setDuration(minutes)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${duration === minutes ? 'bg-accent text-white' : 'bg-raised text-fg hover:brightness-125'}`}
              >
                {minutes} min
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">Pressure</p>
            <p className="text-sm text-fg">{pressure.name}</p>
          </div>
          <input
            className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-raised accent-accent"
            type="range"
            min={0}
            max={LEVELS.length - 1}
            step={1}
            value={level}
            aria-valuetext={pressure.name}
            onChange={(event) => setLevel(Number(event.target.value))}
          />
          <p className="mt-2 text-sm text-muted">{pressure.tone}</p>
        </div>
        <ChoiceRow label="Practice" options={SCENARIOS.map((item) => item.name)} value={name} onChange={setName} />
        <ChoiceRow label="Missions" options={MISSIONS.map((item) => item.name)} value={name} onChange={setName} />
      </div>
    </div>
  );
}

function ChoiceRow({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">{label}</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option === value;
          return (
            <li key={option}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(option)}
                className={`rounded-full px-3 py-1.5 text-sm transition ${selected ? 'bg-fg text-bg' : 'bg-raised text-fg hover:brightness-125'}`}
              >
                {option}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Phone({ call, duration, levelName, pace }: { call: CallPreview; duration: number; levelName: string; pace: number }) {
  const bars = [10, 18, 26, 14, 22, 28, 16, 20, 12, 24, 8];
  return (
    <div className="mx-auto w-full max-w-[280px]">
      <div className="rounded-[2.4rem] border border-line bg-surface p-3 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]">
        <div className="rounded-[1.9rem] bg-bg px-5 pt-5 pb-7">
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span>{call.name}</span>
            <span className="rounded-full bg-danger/15 px-2 py-0.5 font-semibold text-danger">● REC</span>
          </div>
          <div className="mt-8 flex flex-col items-center gap-2">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-[#2b5bff] to-[#18e0e6] text-2xl font-bold text-white shadow-[0_0_40px_-8px_rgba(58,215,224,0.8)]">
              {call.who.slice(0, 1)}
            </div>
            <p className="text-lg font-semibold text-fg">{call.who}</p>
            <p className="text-sm text-muted">{call.role} · {duration} min</p>
            <p className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted">{levelName}</p>
          </div>
          <p key={call.line} aria-live="polite" className="rise mt-6 rounded-2xl bg-surface p-4 text-sm leading-relaxed text-fg">
            “{call.line}”
          </p>
          <div className="mt-5 flex h-8 items-end justify-center gap-1">
            {bars.map((height, index) => (
              <span key={index} className="eq-bar w-1.5 rounded-full bg-accent/80" style={{ height, animationDuration: `${pace}s`, animationDelay: `${index * 0.08}s` }} />
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-muted">Listening…</p>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted">Illustration — pick a situation to hear the kind of line you’ll face.</p>
    </div>
  );
}

function Glyph({ name, compact = false }: { name: GlyphName; compact?: boolean }) {
  const paths: Record<GlyphName, ReactNode> = {
    phone: <path d="M8 4h2.2a1 1 0 0 1 1 .8l.6 2.6a1 1 0 0 1-.5 1.1L9.6 9.6a12 12 0 0 0 4.8 4.8l1.1-1.7a1 1 0 0 1 1.1-.5l2.6.6a1 1 0 0 1 .8 1V17a2 2 0 0 1-2.2 2A14 14 0 0 1 5 6.2 2 2 0 0 1 7 4h1z" />,
    briefcase: <><rect x="3.5" y="7" width="17" height="12" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12h17" /></>,
    target: <><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="3" /><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5" /></>,
    chart: <path d="M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-6" strokeLinecap="round" />,
    languages: <path d="M4 6h9M8.5 6c0 6-3 9-5.5 11M6 10c1.2 2.2 3 4 6 5.2M13 18l3.2-8L19.5 18M14.2 15.5h4.1" strokeLinecap="round" strokeLinejoin="round" />,
    message: <path d="M5 6.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H9l-4 3v-3H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" />,
    layers: <path d="M12 4 4 8l8 4 8-4-8-4zM4 12l8 4 8-4M4 16l8 4 8-4" strokeLinejoin="round" />,
    replay: <path d="M4.5 12a7.5 7.5 0 1 0 2-5.1M4.5 4.5V8H8" strokeLinecap="round" strokeLinejoin="round" />,
    pin: <><path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" /><circle cx="12" cy="11" r="2" /></>,
    wave: <path d="M3 12c1.5-3 2.5-3 4 0s2.5 3 4 0 2.5-3 4 0 2.5 3 4 0" strokeLinecap="round" />,
    shield: <path d="M12 3.5 5 6.5v5.2c0 4.2 2.8 7.2 7 8.8 4.2-1.6 7-4.6 7-8.8V6.5L12 3.5z" />,
    lock: <><rect x="6" y="10" width="12" height="9" rx="1.5" /><path d="M8.5 10V8a3.5 3.5 0 0 1 7 0v2" /></>,
  };
  return (
    <span className={`grid shrink-0 place-items-center rounded-2xl bg-accent/12 text-accent ${compact ? 'h-8 w-8 rounded-xl' : 'h-10 w-10'}`}>
      <svg viewBox="0 0 24 24" className={compact ? 'h-4 w-4' : 'h-5 w-5'} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        {paths[name]}
      </svg>
    </span>
  );
}

function Spotlight({ children, className = '' }: { children: ReactNode; className?: string }) {
  function onMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
  }
  return (
    <div
      data-reveal
      onPointerMove={onMove}
      className={`spotlight relative h-full overflow-hidden rounded-3xl border border-line bg-surface/80 p-6 ${className}`}
    >
      {children}
    </div>
  );
}

function FeedbackCard() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <div data-reveal className="flex flex-col items-center justify-center rounded-3xl border border-line bg-surface/80 p-8 text-center">
        <span data-count="78" className="font-display text-7xl text-fg">78</span>
        <span className="mt-1 text-sm text-muted">Overall score</span>
        <div className="mt-6 grid w-full grid-cols-3 gap-2 text-xs">
          {[
            ['112', 'words / min'],
            ['4', 'filler words'],
            ['2', 'long pauses'],
          ].map(([n, label]) => (
            <div key={label} className="rounded-xl bg-raised p-2">
              <div data-count={n} className="text-base font-semibold text-fg">{n}</div>
              <div className="text-muted">{label}</div>
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
          <div key={kind} data-reveal className="rounded-3xl border border-line bg-surface/80 p-5">
            <p className="text-xs font-semibold tracking-[0.16em] text-accent uppercase">{kind}</p>
            <p className="mt-2 text-muted line-through decoration-danger/70">{said}</p>
            <p className="mt-1 text-fg">{better}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Plan({ name, price, items, highlight }: { name: string; price: string; items: string[]; highlight?: boolean }) {
  const card = (
    <div className={`h-full rounded-[1.4rem] p-6 ${highlight ? 'bg-bg' : 'border border-line bg-surface/80'}`}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-display text-3xl text-fg">{name}</h3>
        <span className={highlight ? 'font-semibold text-glow' : 'font-semibold text-fg'}>{price}</span>
      </div>
      <ul className="mt-5 space-y-2 text-sm text-muted">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-success">✓</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
  if (!highlight) return <div data-reveal>{card}</div>;
  return (
    <div data-reveal className="pro-frame rounded-[1.45rem] p-px">
      {card}
    </div>
  );
}
