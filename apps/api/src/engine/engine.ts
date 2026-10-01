/**
 * Conversation Engine: turns a published scenario version + persona + learner settings into
 * everything a live call needs. Pure (no I/O) and deterministic for a given rng/clock.
 */
import { createHash } from 'node:crypto';
import type { Accent, EnglishLevel, LearningGoal } from '@speakai/contracts';
import { z } from 'zod';
import {
  ACCENT,
  CORE,
  DIFFICULTY,
  LAYER_VERSIONS,
  learnerLayer,
  LIVE_CORRECTION,
  NO_CORRECTION,
  PRESSURE,
  REPLAY,
  replayOpeningCue,
  SAFETY,
  TOOLS_GUIDANCE,
  TURN_TAKING,
  WRAP_UP_CUE,
} from './layers.js';
import { openingCue } from './openings.js';
import { renderTemplate, type Rng, rollScenarioState, type ScenarioKind } from './scenario-kinds.js';
import { type ToolDeclaration, toolsFor } from './tools.js';

export interface ScenarioVersionInput {
  id: string;
  version: number;
  kind: string;
  title: string;
  briefing: string;
  userRole: string;
  objective: string;
  promptTemplate: string;
  params: unknown;
  goals: unknown;
}

export interface PersonaInput {
  id: string;
  version: number;
  name: string;
  promptFragment: string;
}

export interface PrepareInput {
  scenario: ScenarioVersionInput;
  persona: PersonaInput;
  difficulty: EnglishLevel;
  accent: Accent;
  liveCorrection: boolean;
  learnerGoals: readonly LearningGoal[];
  /** Missions: pressure level 1–5 (null/undefined for practice conversations). */
  missionLevel?: number | null;
  /** Recurring mistake categories from the learning profile (PRD §35). */
  learnerWeakSpots?: readonly string[];
  timeZone: string;
  now?: Date;
  rng?: Rng;
  /** Casual situations used recently by this user, to avoid repeats. */
  recentSituations?: readonly string[];
  /** Replays: reuse the original conversation's situation instead of rolling a new one… */
  fixedState?: { values: Record<string, string | number>; hidden: readonly string[] };
  /** …and ask this question (the AI's line before the replayed answer). */
  replayQuestion?: string;
}

export interface PreparedConversation {
  instructions: string;
  instructionsHash: string;
  promptVersions: Record<string, string | number>;
  /** Full state incl. hidden values — server-side only. */
  scenarioState: Record<string, string | number>;
  hiddenKeys: readonly string[];
  /** What the user sees before the call (PRD §24). */
  brief: { title: string; briefing: string; userRole: string; objective: string };
  goals: Array<{ id: string; description: string; label?: string }>;
  openingCue: string;
  wrapUpCue: string;
  tools: ToolDeclaration[];
  turnTaking: (typeof TURN_TAKING)[EnglishLevel];
  /** When the AI may end the call: normal conversations need ~45 s and two answers; replays just one answer. */
  endPolicy: 'conversation' | 'single_answer';
}

const Goals = z.array(z.object({ id: z.string().regex(/^[a-z_]+$/), description: z.string(), label: z.string().optional() }));

export function prepareConversation(input: PrepareInput): PreparedConversation {
  const rng = input.rng ?? Math.random;
  const now = input.now ?? new Date();
  const kind = input.scenario.kind as ScenarioKind;
  const rolled = input.fixedState ?? rollScenarioState(kind, input.scenario.params, rng, { avoidSituations: input.recentSituations });
  const replay = input.replayQuestion !== undefined;
  const goals = Goals.parse(input.scenario.goals);
  const render = (t: string) => renderTemplate(t, rolled.values);


  const instructions = [
    CORE,
    input.liveCorrection ? LIVE_CORRECTION : NO_CORRECTION,
    SAFETY,
    render(input.scenario.promptTemplate),
    input.persona.promptFragment,
    ACCENT[input.accent],
    DIFFICULTY[input.difficulty],
    input.missionLevel ? PRESSURE[Math.min(5, Math.max(1, input.missionLevel)) as 1 | 2 | 3 | 4 | 5] : null,
    replay ? null : learnerLayer(input.learnerGoals, input.learnerWeakSpots),
    TOOLS_GUIDANCE,
    replay ? REPLAY : null,
  ]
    .filter((s): s is string => Boolean(s))
    .join('\n\n');

  return {
    instructions,
    instructionsHash: createHash('sha256').update(instructions).digest('hex'),
    promptVersions: {
      ...LAYER_VERSIONS,
      scenarioVersionId: input.scenario.id,
      scenarioVersion: input.scenario.version,
      personaId: input.persona.id,
      personaVersion: input.persona.version,
      ...(replay ? { replay: LAYER_VERSIONS.replay } : {}),
    },
    scenarioState: rolled.values,
    hiddenKeys: rolled.hidden,
    brief: {
      title: input.scenario.title,
      briefing: render(input.scenario.briefing),
      userRole: render(input.scenario.userRole),
      objective: render(input.scenario.objective),
    },
    goals: replay ? [] : goals,
    openingCue: replay ? replayOpeningCue(input.replayQuestion!) : openingCue(kind, rolled.values, { rng, now, timeZone: input.timeZone }),
    // A replay is a single answer: no "wrap up" nudge.
    wrapUpCue: replay ? '' : WRAP_UP_CUE,
    tools: toolsFor(kind),
    turnTaking: TURN_TAKING[input.difficulty],
    endPolicy: replay ? 'single_answer' : 'conversation',
  };
}

/** State safe to show the user: hidden keys (e.g. floor price, the AI's secret concern) removed. */
export function publicState(state: Record<string, unknown>, hiddenKeys: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(state).filter(([k]) => !hiddenKeys.includes(k)));
}
