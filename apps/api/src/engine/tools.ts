/**
 * Tools the realtime model can call during a conversation. All are NON_BLOCKING with SILENT
 * responses, so bookkeeping never adds latency to the AI's spoken reply.
 */
import { z } from 'zod';
import { clampOffer, inr, type ScenarioKind } from './scenario-kinds.js';

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters?: { type: 'OBJECT'; properties: Record<string, { type: string; description: string }>; required: string[] };
  behavior: 'NON_BLOCKING';
}

/**
 * Deliberately minimal: every tool the realtime model may call costs response latency.
 * Goal achievement is judged after the call by the evaluation model (PRD §76), not here.
 */
export function toolsFor(kind: ScenarioKind): ToolDeclaration[] {
  const tools: ToolDeclaration[] = [
    {
      name: 'end_conversation',
      description: 'Call AFTER you have said goodbye, when the conversation has reached its natural end.',
      parameters: {
        type: 'OBJECT',
        properties: { reason: { type: 'STRING', description: 'objective_completed or natural_end' } },
        required: ['reason'],
      },
      behavior: 'NON_BLOCKING',
    },
  ];
  if (kind === 'negotiation') {
    tools.push({
      name: 'record_offer',
      description: 'Record the price you (the seller) just offered, in rupees, every time you state a new price.',
      parameters: {
        type: 'OBJECT',
        properties: { price: { type: 'NUMBER', description: 'Your new price in rupees' } },
        required: ['price'],
      },
      behavior: 'NON_BLOCKING',
    });
  }
  return tools;
}

export interface ToolContext {
  values: Record<string, string | number>;
  goalIds: readonly string[];
  goalsAchieved: ReadonlySet<string>;
}

export interface ToolOutcome {
  /** Sent back to the model (it never reaches the user). */
  response: Record<string, unknown>;
  /** Changes to persist in the session's scenario state. */
  stateChanges?: Record<string, string | number>;
  goalAchieved?: string;
  endRequested?: 'OBJECTIVE_COMPLETED' | 'AI_NATURAL_END';
}

const EndArgs = z.object({ reason: z.string().optional() });
const GoalArgs = z.object({ goal_id: z.string() });
const OfferArgs = z.object({ price: z.coerce.number().finite() });

/** Validates and applies one tool call. Invalid input returns an error to the model instead of throwing. */
export function handleToolCall(name: string, args: unknown, ctx: ToolContext): ToolOutcome {
  switch (name) {
    case 'end_conversation': {
      const a = EndArgs.safeParse(args ?? {});
      const completed = a.success && a.data.reason === 'objective_completed';
      return { response: { ok: true }, endRequested: completed ? 'OBJECTIVE_COMPLETED' : 'AI_NATURAL_END' };
    }
    case 'mark_goal_achieved': {
      const a = GoalArgs.safeParse(args);
      if (!a.success || !ctx.goalIds.includes(a.data.goal_id)) {
        return { response: { ok: false, error: `Unknown goal id. Valid: ${ctx.goalIds.join(', ')}` } };
      }
      if (ctx.goalsAchieved.has(a.data.goal_id)) return { response: { ok: true, alreadyRecorded: true } };
      return { response: { ok: true }, goalAchieved: a.data.goal_id };
    }
    case 'record_offer': {
      const a = OfferArgs.safeParse(args);
      const floor = Number(ctx.values.floorPrice);
      const ask = Number(ctx.values.askPrice);
      if (!a.success || !Number.isFinite(floor) || !Number.isFinite(ask)) {
        return { response: { ok: false, error: 'price must be a number' } };
      }
      const price = clampOffer(a.data.price, floor, ask);
      if (price !== Math.round(a.data.price)) {
        // Server-side guardrail: correct the model if it tried to go below its floor.
        return {
          response: { ok: false, error: `You cannot go below ${inr(floor)}. Correct yourself naturally and offer ${inr(price)} or more.` },
          stateChanges: { currentOffer: price },
        };
      }
      return { response: { ok: true, currentOffer: inr(price) }, stateChanges: { currentOffer: price } };
    }
    default:
      return { response: { ok: false, error: `Unknown tool ${name}` } };
  }
}
