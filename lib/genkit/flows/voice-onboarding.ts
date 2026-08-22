// @ts-nocheck
import { z } from 'zod';
import { getGenkitAi, DEFAULT_GEMINI_MODEL } from '../config';
import { VoiceAgentDecisionSchema } from '../../schemas/ai-schemas';

const ai = getGenkitAi();

export const voiceOnboardingFlow = ai.defineFlow(
  {
    name: 'silverhandsVoiceOnboarding',
    inputSchema: z.object({
      userSpeech: z.string(),
      conversationHistory: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() })),
      currentProfile: z.record(z.string(), z.unknown()).optional(),
    }),
    outputSchema: VoiceAgentDecisionSchema,
  },
  async (input) => {
    const { text } = await ai.generate({
      model: DEFAULT_GEMINI_MODEL,
      prompt: `You are Jarvis for SilverHands onboarding. User: "${input.userSpeech}"`,
      output: { schema: VoiceAgentDecisionSchema },
    });
    try {
      const parsed = VoiceAgentDecisionSchema.safeParse(JSON.parse(text || '{}'));
      if (parsed.success) return parsed.data;
    } catch {}
    return {
      intent: 'unknown',
      extractedFields: {},
      corrections: [],
      missingFields: ['name'],
      nextAction: 'clarify',
      response: 'Could you please repeat that?',
    };
  }
);
