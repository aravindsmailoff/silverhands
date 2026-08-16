export interface GeneratedListingDraft {
  title: string;
  description: string;
  suggested_price: number;
  type: 'skill' | 'product';
  unit: 'session' | 'item';
  category: 'cooking' | 'tailoring' | 'tutoring' | 'gardening' | 'handicrafts';
}

const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const preferredOllamaModel = process.env.OLLAMA_MODEL || 'qwen3:4b';

// Candidate models installed locally or available in Ollama
const OLLAMA_MODELS_TO_TRY = Array.from(new Set([
  preferredOllamaModel,
  'qwen3:4b',
  'llama3.2:latest',
  'qwen2.5-coder:3b',
  'gemma4:latest',
  'gemma2:2b',
  'qwen2.5'
]));

let cachedWorkingModel: string | null = null;

/**
 * Helper to execute prompts against local Ollama API with sub-second response optimization
 */
async function generateWithOllama(prompt: string): Promise<string | null> {
  const modelsToAttempt = cachedWorkingModel 
    ? [cachedWorkingModel, ...OLLAMA_MODELS_TO_TRY.filter(m => m !== cachedWorkingModel)]
    : OLLAMA_MODELS_TO_TRY;

  for (const modelCandidate of modelsToAttempt) {
    try {
      const controller = new AbortController();
      // 8s timeout – gives local Ollama enough time to respond
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(`${ollamaHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: modelCandidate,
          prompt,
          stream: false,
          format: 'json',
          options: {
            num_predict: 180,
            temperature: 0.1,
            top_p: 0.8,
            num_ctx: 1024
          }
        })
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.response) {
          cachedWorkingModel = modelCandidate;
          return data.response;
        }
      }
    } catch (err) {
      // Continue trying next candidate model
    }
  }
  return null;
}

/**
 * Extracts structured listing details from unstructured elder voice transcript
 * using local Ollama AI engine with rule-based fallback.
 */
export async function generateListingFromTranscript(transcript: string): Promise<GeneratedListingDraft> {
  const prompt = `
You are an empathetic assistant helping senior citizens and homemakers in India turn their spoken voice transcripts into clear, beautiful marketplace listings.

Voice Transcript: "${transcript}"

Extract the listing details and return strictly valid JSON matching this exact structure with no markdown backticks:
{
  "title": "A short catchy title (max 10 words in clear English/Hinglish)",
  "description": "A warm, clear 2-3 sentence description highlighting elder craftsmanship or teaching experience",
  "suggested_price": number (in INR, e.g. 300),
  "type": "skill" or "product",
  "unit": "session" (if skill/class) or "item" (if handmade product),
  "category": "cooking", "tailoring", "tutoring", "gardening", or "handicrafts"
}
`;

  const ollamaResponse = await generateWithOllama(prompt);

  if (ollamaResponse) {
    try {
      const cleanedJson = ollamaResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);

      return {
        title: parsed.title || 'Elder Skilled Offering',
        description: parsed.description || transcript,
        suggested_price: Number(parsed.suggested_price) || 300,
        type: parsed.type === 'product' ? 'product' : 'skill',
        unit: parsed.unit === 'item' ? 'item' : 'session',
        category: parsed.category || 'cooking'
      };
    } catch (err) {
      console.warn('[Ollama] Error parsing Ollama JSON output, using fallback parser:', err);
    }
  } else {
    console.log('[Ollama] Ollama connection unavailable or candidate models timed out. Using fallback parser.');
  }

  // Fallback intelligent heuristic parser when Ollama is unreachable
  const lower = transcript.toLowerCase();
  const isProduct = lower.includes('product') || lower.includes('pickle') || lower.includes('dupatta') || lower.includes('sweater') || lower.includes('craft') || lower.includes('item') || lower.includes('sell');
  
  const priceMatch = transcript.match(/(\d+)\s*(rupees|rs|inr|₹)/i) || transcript.match(/₹?\s*(\d+)/);
  const price = priceMatch ? parseInt(priceMatch[1], 10) : (isProduct ? 350 : 400);

  let category: GeneratedListingDraft['category'] = 'cooking';
  if (lower.includes('stitch') || lower.includes('tailor') || lower.includes('sew') || lower.includes('alter')) category = 'tailoring';
  else if (lower.includes('teach') || lower.includes('tutor') || lower.includes('math') || lower.includes('class')) category = 'tutoring';
  else if (lower.includes('plant') || lower.includes('garden') || lower.includes('bonsai') || lower.includes('soil')) category = 'gardening';
  else if (lower.includes('handicraft') || lower.includes('embroidery') || lower.includes('knit') || lower.includes('wood')) category = 'handicrafts';

  return {
    title: transcript.length > 50 ? transcript.slice(0, 48) + '...' : (transcript || 'Elder Special Workshop'),
    description: transcript || 'Handcrafted elder service listed with care and dedication.',
    suggested_price: price,
    type: isProduct ? 'product' : 'skill',
    unit: isProduct ? 'item' : 'session',
    category
  };
}

/**
 * Auto-generates a rich, detailed video lesson description directly from what the user said in the video via Ollama.
 */
export async function generateVideoDescriptionFromSpeech(spokenText: string, creatorName: string = 'Creator'): Promise<{ title: string; description: string }> {
  // Clean speech noise & filler prefixes
  let cleanedText = spokenText
    .replace(/^let'?s\s+talk\s+about\s+/i, '')
    .replace(/^i\s+want\s+to\s+show\s+/i, '')
    .replace(/^today\s+i\s+am\s+showing\s+/i, '')
    .replace(/^uh\s+|^um\s+/gi, '')
    .trim();

  if (!cleanedText) {
    cleanedText = spokenText.trim() || 'Creator Video Lesson';
  }

  const formattedText = cleanedText.charAt(0).toUpperCase() + cleanedText.slice(1);

  const prompt = `
You are an AI Video Description Editor for SilverHands senior platform.
The senior creator spoke: "${formattedText}"
Creator Name: "${creatorName}"

TASK: Generate a clean title and 1-2 sentence description matching the exact topic or recipe spoken by the creator.
EXAMPLE:
If spoken text is "how to make sandwiches at home", output:
{
  "title": "How to Make Sandwiches at Home",
  "description": "In this video lesson, senior creator ${creatorName} demonstrates step-by-step instructions on how to make delicious sandwiches at home."
}

Return ONLY valid JSON with no markdown backticks:
{
  "title": "Clean Title (max 7 words)",
  "description": "1-2 sentence description matching the exact spoken topic."
}
`;

  const ollamaResponse = await generateWithOllama(prompt);

  if (ollamaResponse) {
    try {
      const cleanedJson = ollamaResponse.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);

      return {
        title: parsed.title || formattedText.slice(0, 45),
        description: parsed.description || `In this video lesson, senior creator ${creatorName} demonstrates: "${formattedText}".`
      };
    } catch (err) {
      console.warn('[Ollama] Error parsing video description JSON output:', err);
    }
  }

  // Reliable fallback: always returns something readable
  return {
    title: formattedText.length > 45 ? formattedText.slice(0, 42) + '...' : (formattedText || 'Senior Lesson Video'),
    description: `In this video lesson, senior creator ${creatorName} shares step-by-step guidance on: "${formattedText || 'traditional skills and techniques'}".`
  };
}

