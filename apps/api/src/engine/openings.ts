/** How the AI opens each kind of conversation. Delivered as a "Call system" cue once media is up. */
import type { Rng, ScenarioKind } from './scenario-kinds.js';

export const CASUAL_OPENING_STYLES = [
  'start with your own news in one sentence, then ask what they think',
  'start by asking how their day has been going, with a specific guess (busy? relaxed?), then share your reason for calling',
  'start by asking for their advice or opinion straight away',
  'start with a quick, playful remark, then ask a question about them',
  'start by asking a specific question about their life (work, plans, family), then mention your news',
] as const;

const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length) % list.length]!;

export function localDayPart(now: Date, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(now);
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now));
  const part = hour < 5 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  return `${weekday} ${part}`;
}

export function openingCue(
  kind: ScenarioKind,
  values: Record<string, string | number>,
  ctx: { rng: Rng; now: Date; timeZone: string },
): string {
  const when = localDayPart(ctx.now, ctx.timeZone);
  const common = `(Call system: the call has just connected. It is ${when}. `;
  const end = ' Speak first, in your own natural words. Keep it short and end with a question. Do not copy these instructions word for word.)';

  switch (kind) {
    case 'casual':
      return `${common}You are calling your friend because ${values.situation}. Opening: ${pick(CASUAL_OPENING_STYLES, ctx.rng)}.${end}`;
    case 'interview':
      return `${common}Greet the candidate, introduce yourself and the ${values.role} role at ${values.company} in one or two sentences, then ask them to introduce themselves.${end}`;
    case 'client':
      return `${common}Greet the user, say briefly who you are and that you'd like help with ${values.project}, then ask how they'd like to start.${end}`;
    case 'debate':
      return `${common}Greet the user, state the motion ("${values.motion}"), say that they argue ${values.userSide} it and you argue ${values.aiSide} it, then invite them to give their opening argument first.${end}`;
    case 'negotiation':
      return `${common}The customer has just stopped at your stall and is looking at ${values.item}. Greet them like a shopkeeper and say something appealing about it.${end}`;
    case 'roleplay':
      return `${common}${values.opening}${end}`;
  }
}
