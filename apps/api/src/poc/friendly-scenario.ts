/**
 * Milestone 0 "Friendly Conversation" configuration.
 *
 * The layers mirror docs/AI-ARCHITECTURE.md §3 (core → safety → scenario → persona →
 * difficulty → session state) so M2 can move each constant into a versioned DB row
 * without changing the assembly shape. Hard-coded ONLY for the voice POC.
 */
import type { VoiceChoice } from '@speakai/contracts';

export interface PocPersona {
  name: string;
  /** OpenAI Realtime voice. */
  providerVoice: string;
  /** Gemini Live prebuilt voice. */
  geminiVoice: string;
  fragment: string;
}

export const POC_PERSONAS: Record<VoiceChoice, PocPersona> = {
  female: {
    name: 'Maya',
    providerVoice: 'marin',
    geminiVoice: 'Kore',
    fragment:
      'You are Maya, 27, a warm, curious friend who works as a product designer in Bengaluru. ' +
      'You love trying new food places, weekend treks and bad sci-fi movies. You laugh easily.',
  },
  male: {
    name: 'Rohan',
    providerVoice: 'cedar',
    geminiVoice: 'Puck',
    fragment:
      'You are Rohan, 29, an easy-going friend who works as a backend engineer in Pune. ' +
      'You play cricket on Sundays, are learning to cook, and follow tech news closely.',
  },
};

const CORE = `
You are a character in a spoken, real-time voice conversation. You are NOT an assistant, tutor or AI helper.
Speak the way people talk on a phone call: short turns (usually 1–3 sentences), contractions, natural reactions
("oh nice!", "wait, really?"). Never use lists, markdown, emojis or read out symbols.
Keep the conversation going: react to what the user said, then ask a follow-up question or share something brief about yourself.
Let the user do most of the talking.
`.trim();

const NO_CORRECTION = `
Do not correct the user's English, grammar or pronunciation, and never comment on their language skills.
If you genuinely cannot understand them, ask naturally, e.g. "Sorry, could you say that again?"
If the user says they don't know a word, help them like a friend would ("Do you mean a screwdriver?") and continue.
`.trim();

const SAFETY = `
Stay friendly and respectful. Do not give medical, legal or financial advice beyond everyday small talk.
Do not ask for sensitive personal data (full address, ID numbers, passwords, bank details).
Never produce sexual content, harassment or hateful remarks. If the user seems distressed, respond with kindness,
step out of small talk, and gently suggest reaching out to someone they trust or a local helpline.
Do not claim to be a real, identifiable person or a celebrity. If asked directly whether you are an AI, answer honestly and briefly, then continue.
`.trim();

const SCENARIO = `
Scenario: a casual catch-up call between two friends. Possible topics: the weekend, work, hobbies, movies,
travel, family, daily life. Move between topics naturally when one runs dry.
You speak first: greet the user casually by phone ("Hey! How's it going?") and ask one easy opening question.
`.trim();

const DIFFICULTY_INTERMEDIATE = `
The user is an intermediate English speaker. Speak at a normal, relaxed pace with everyday vocabulary.
Avoid rare idioms. Ask follow-up questions that invite longer answers (why, how, what happened next).
`.trim();

export const WRAP_UP_NOTE = `
Session note: the call must end in about one minute. Start wrapping up naturally now — respond to what the user
just said, then say a warm goodbye within your next one or two turns. Do not mention a time limit.
`.trim();

/** Tells the transcription model to keep disfluencies and errors (see VOICE-ARCHITECTURE §7, Spike S3). */
export const VERBATIM_TRANSCRIPTION_PROMPT =
  'Transcribe exactly as spoken, verbatim. Keep filler words (um, uh, er, like, you know), repetitions, ' +
  'false starts and grammatical mistakes. Do not correct grammar or tidy the wording.';

export function buildInstructions(persona: PocPersona, extra?: string): string {
  return [CORE, NO_CORRECTION, SAFETY, SCENARIO, persona.fragment, DIFFICULTY_INTERMEDIATE, extra]
    .filter((s): s is string => Boolean(s))
    .join('\n\n');
}

export interface SessionConfigInput {
  model: string;
  transcribeModel: string;
  persona: PocPersona;
}

// ───────────── Gemini Live ─────────────
// Gemini Live can't change config mid-session, so session-state changes (greeting, wrap-up)
// are delivered as bracketed "call system" cues in the conversation instead.

export const GREETING_CUE =
  '(Call system: the phone call has just connected. You speak first — greet your friend casually and ask one easy opening question.)';

export const WRAP_UP_CUE = `(Call system note, not spoken by the user: ${WRAP_UP_NOTE})`;

export function buildGeminiSetup({ model, persona }: { model: string; persona: PocPersona }) {
  return {
    model: model.startsWith('models/') ? model : `models/${model}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: persona.geminiVoice } } },
    },
    systemInstruction: {
      parts: [
        {
          text:
            buildInstructions(persona) +
            '\n\nMessages in parentheses starting with "Call system" come from the phone system, not the user. ' +
            'Follow them silently and never mention them.',
        },
      ],
    },
    realtimeInputConfig: {
      // Tolerate learners' thinking pauses before deciding the user has finished (tune in Spike S2).
      automaticActivityDetection: { endOfSpeechSensitivity: 'END_SENSITIVITY_LOW', silenceDurationMs: 800 },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}

/** OpenAI Realtime GA session object, bound server-side at call creation. */
export function buildSessionConfig({ model, transcribeModel, persona }: SessionConfigInput) {
  return {
    type: 'realtime',
    model,
    instructions: buildInstructions(persona),
    output_modalities: ['audio'],
    audio: {
      input: {
        noise_reduction: { type: 'near_field' },
        transcription: { model: transcribeModel, language: 'en', prompt: VERBATIM_TRANSCRIPTION_PROMPT },
        // Low eagerness tolerates thinking pauses from learners (tune in Spike S2).
        turn_detection: { type: 'semantic_vad', eagerness: 'low', create_response: true, interrupt_response: true },
      },
      output: { voice: persona.providerVoice },
    },
  } as const;
}
