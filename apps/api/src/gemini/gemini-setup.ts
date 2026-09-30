import type { PreparedConversation } from '../engine/engine.js';

/** BidiGenerateContentSetup for one conversation, from the engine's prepared output. */
export function buildGeminiSetup(input: {
  model: string;
  voiceName: string;
  prepared: Pick<PreparedConversation, 'instructions' | 'tools' | 'turnTaking'>;
}) {
  const { prepared } = input;
  return {
    model: input.model.startsWith('models/') ? input.model : `models/${input.model}`,
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: input.voiceName } } },
    },
    systemInstruction: { parts: [{ text: prepared.instructions }] },
    tools: prepared.tools.length ? [{ functionDeclarations: prepared.tools }] : [],
    realtimeInputConfig: {
      automaticActivityDetection: {
        endOfSpeechSensitivity: prepared.turnTaking.endSensitivity,
        silenceDurationMs: prepared.turnTaking.silenceMs,
      },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}
