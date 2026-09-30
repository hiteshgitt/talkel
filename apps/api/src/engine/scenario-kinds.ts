/**
 * Per-kind scenario parameters (validated) and per-session randomisation.
 * This schema + "roll" function is the only scenario-specific code: scenario text lives in the DB.
 */
import { z } from 'zod';

export type Rng = () => number;

const pick = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length) % list.length]!;

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const CasualParams = z.object({ situations: z.array(z.string().min(3)).min(1) });
const InterviewParams = z.object({
  roles: z.array(z.object({ role: z.string(), company: z.string(), companyNote: z.string(), focus: z.string() })).min(1),
});
const ClientParams = z.object({
  projects: z
    .array(
      z.object({
        client: z.string(),
        project: z.string(),
        details: z.string(),
        deadline: z.string(),
        budget: z.string(),
        concern: z.string(),
      }),
    )
    .min(1),
});
const DebateParams = z.object({ motions: z.array(z.string().min(5)).min(1) });
const NegotiationParams = z.object({
  currency: z.literal('INR'),
  items: z
    .array(
      z
        .object({
          item: z.string(),
          place: z.string(),
          askPrice: z.number().int().positive(),
          floorPrice: z.number().int().positive(),
          userBudget: z.number().int().positive(),
        })
        .refine((i) => i.floorPrice < i.askPrice, 'floorPrice must be below askPrice'),
    )
    .min(1),
});

export type ScenarioKind = 'casual' | 'interview' | 'client' | 'debate' | 'negotiation';

/**
 * Values for {{placeholders}} in scenario text. `hidden` keys are used in the AI instructions
 * but must never be sent to the client (e.g. the seller's floor price).
 */
export interface RolledState {
  values: Record<string, string | number>;
  hidden: readonly string[];
}

export function rollScenarioState(
  kind: string,
  params: unknown,
  rng: Rng,
  opts: { avoidSituations?: readonly string[] } = {},
): RolledState {
  switch (kind as ScenarioKind) {
    case 'casual': {
      const p = CasualParams.parse(params);
      const fresh = p.situations.filter((s) => !opts.avoidSituations?.includes(s));
      return { values: { situation: pick(fresh.length ? fresh : p.situations, rng) }, hidden: ['situation'] };
    }
    case 'interview': {
      const r = pick(InterviewParams.parse(params).roles, rng);
      return { values: { ...r }, hidden: ['focus'] };
    }
    case 'client': {
      const pr = pick(ClientParams.parse(params).projects, rng);
      return { values: { ...pr }, hidden: ['concern', 'budget', 'details'] };
    }
    case 'debate': {
      const motion = pick(DebateParams.parse(params).motions, rng);
      const userFor = rng() < 0.5;
      return {
        values: { motion, userSide: userFor ? 'for' : 'against', aiSide: userFor ? 'against' : 'for' },
        hidden: [],
      };
    }
    case 'negotiation': {
      const i = pick(NegotiationParams.parse(params).items, rng);
      return {
        values: {
          ...i,
          askPriceText: inr(i.askPrice),
          floorPriceText: inr(i.floorPrice),
          userBudgetText: inr(i.userBudget),
          currentOffer: i.askPrice,
        },
        hidden: ['floorPrice', 'floorPriceText'],
      };
    }
    default:
      throw new Error(`Unknown scenario kind: ${kind}`);
  }
}

/** Replaces {{key}} with state values. Throws on a missing key so broken content fails loudly in tests. */
export function renderTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = values[key];
    if (v === undefined) throw new Error(`Template placeholder {{${key}}} has no value`);
    return String(v);
  });
}

/** Clamp for the negotiation tool: the AI can never sell below its floor price. */
export function clampOffer(price: number, floorPrice: number, askPrice: number): number {
  return Math.min(askPrice, Math.max(floorPrice, Math.round(price)));
}

export { inr };
