/**
 * SilverHands Genkit governance layer.
 * Lazy-loaded to keep Next.js type-check memory bounded.
 */
// @ts-nocheck

import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

export const DEFAULT_GEMINI_MODEL = 'googleai/gemini-2.5-flash';

let _ai: ReturnType<typeof genkit> | null = null;

export function getGenkitAi() {
  if (!_ai) {
    _ai = genkit({
      plugins: [
        googleAI({
          apiKey: process.env.GEMINI_API_KEY,
        }),
      ],
    });
  }
  return _ai;
}

/** @deprecated use getGenkitAi() */
export const ai = new Proxy({} as ReturnType<typeof genkit>, {
  get(_target, prop) {
    return (getGenkitAi() as Record<string | symbol, unknown>)[prop];
  },
});
