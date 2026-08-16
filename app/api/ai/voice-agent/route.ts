import { NextResponse } from 'next/server';
import { ProfileState } from '@/lib/voice-agent';

const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const preferredOllamaModel = process.env.OLLAMA_MODEL || 'qwen3:4b';

// Candidate models to attempt sequentially in local Ollama instance
const OLLAMA_MODELS_TO_TRY = Array.from(new Set([
  preferredOllamaModel,
  'qwen3:4b',
  'llama3.2:latest',
  'qwen2.5-coder:3b',
  'gemma4:latest',
  'gemma2:2b',
  'qwen2.5'
]));

export async function POST(req: Request) {
  try {
    const { current_profile, conversation_history, user_speech } = await req.json();

    const current: ProfileState = current_profile || {
      name: null,
      skill: null,
      experience_years: null,
      location: null,
      language: null,
      services: [],
      availability: null
    };

    const speechText: string = (user_speech || '').trim();

    const prompt = `
You are the SilverHands onboarding AI assistant for senior citizens in India.
Your goal is to build a user profile by having a natural, warm, one-question-at-a-time voice conversation in 100% clean English.

CURRENT PROFILE STATE:
${JSON.stringify(current, null, 2)}

USER JUST SAID:
"${speechText}"

CONVERSATION HISTORY:
${JSON.stringify(conversation_history || [], null, 2)}

YOUR INSTRUCTIONS:
1. Extract any profile information from the user's speech:
   - "name": full or first name (string)
   - "skill": main skill, craft, or teaching topic (string)
   - "experience_years": number of years of experience (number or null)
   - "location": city or neighborhood in India (string)
   - "language": spoken language (string)
   - "services": array of strings (e.g. ["Online Classes", "Recipe Videos", "Handmade Items"])
   - "availability": available days or times (string)

2. Determine the NEXT single question to ask:
   - Ask only ONE question at a time.
   - Be extremely polite, respectful, clear, and use ONLY 100% English (e.g., "Welcome to SilverHands", "Thank you"). Do not use any non-English words.
   - Do NOT ask for information that is already collected in the CURRENT PROFILE STATE.
   - Priority order of questions:
     1) Name (if missing)
     2) Skill/What they offer (if missing)
     3) Experience years (if missing)
     4) Location/City (if missing)
     5) Confirmation ("I have summarized your profile... Is everything correct?")

3. If the user is answering the final confirmation ("Is everything correct?") and says "Yes", "Correct", "Looks good", or "Sure", mark "completed": true.

RETURN ONLY VALID JSON WITH EXACTLY THIS FORMAT:
{
  "extracted_data": {
    "name": string | null,
    "skill": string | null,
    "experience_years": number | null,
    "location": string | null,
    "language": string | null,
    "services": string[],
    "availability": string | null
  },
  "next_question": "Text of the single next question for the AI to speak in 100% clean English",
  "confirmation_mode": boolean,
  "completed": boolean
}
`;

    // 1. Try Local Ollama Engine first with sub-second response optimization
    const candidateModels = Array.from(new Set(['qwen3:4b', 'llama3.2:latest', ...OLLAMA_MODELS_TO_TRY]));

    for (const modelCandidate of candidateModels) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const ollamaRes = await fetch(`${ollamaHost}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: modelCandidate,
            prompt: prompt,
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

        if (ollamaRes.ok) {
          const ollamaData = await ollamaRes.json();
          const jsonMatch = (ollamaData.response || '').match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            const updatedProfile: ProfileState = mergeProfileState(current, parsed.extracted_data);
            console.log(`[VoiceAgent] Successfully processed turn via Local Ollama model: ${modelCandidate}`);
            return NextResponse.json({
              success: true,
              provider: `ollama-${modelCandidate}`,
              model: modelCandidate,
              turn: {
                extracted_data: parsed.extracted_data || {},
                next_question: parsed.next_question || "Could you tell me more about your skills?",
                updated_profile: updatedProfile,
                completed: Boolean(parsed.completed),
                confirmation_mode: Boolean(parsed.confirmation_mode)
              }
            });
          }
        }
      } catch (ollamaErr) {
        // Fast timeout - proceed immediately to next or fallback
      }
    }

    // 2. Deterministic Rule-Based Fallback Parser
    const fallbackTurn = processFallbackTurn(current, speechText);
    return NextResponse.json({
      success: true,
      provider: 'rule-engine',
      turn: fallbackTurn
    });

  } catch (err) {
    console.error('Voice Agent API handler error:', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

function mergeProfileState(current: ProfileState, extracted: Partial<ProfileState>): ProfileState {
  const merged = { ...current };

  if (extracted.name) merged.name = extracted.name;
  if (extracted.skill) merged.skill = extracted.skill;
  if (extracted.experience_years !== undefined && extracted.experience_years !== null) {
    merged.experience_years = Number(extracted.experience_years);
  }
  if (extracted.location) merged.location = extracted.location;
  if (extracted.language) merged.language = extracted.language;
  if (extracted.availability) merged.availability = extracted.availability;

  if (Array.isArray(extracted.services) && extracted.services.length > 0) {
    const set = new Set([...merged.services, ...extracted.services]);
    merged.services = Array.from(set);
  }

  return merged;
}

function processFallbackTurn(current: ProfileState, speech: string) {
  const lower = speech.toLowerCase();
  const extracted: Partial<ProfileState> = {};
  let completed = false;
  let confirmationMode = false;
  let nextQuestion = "";

  // Step 1: Extract details based on speech content
  if (!current.name) {
    if (lower.includes('name is') || lower.includes('i am') || lower.length > 2) {
      const cleanedName = speech.replace(/my name is|i am|iam/gi, '').trim();
      extracted.name = cleanedName.length > 0 ? cleanedName : "there";
    }
  } else if (!current.skill) {
    extracted.skill = speech;
    extracted.services = ["Online Classes", "Recipe Videos", "Homemade Products"];
  } else if (current.experience_years === null) {
    const match = speech.match(/\d+/);
    extracted.experience_years = match ? parseInt(match[0], 10) : 30;
  } else if (!current.location) {
    extracted.location = speech.length > 2 ? speech : "New Delhi";
  }

  const updated = mergeProfileState(current, extracted);

  // Step 2: Determine next question in 100% clean English
  if (!updated.name) {
    nextQuestion = "Welcome to SilverHands! I will help you create your profile using voice. What is your name?";
  } else if (!updated.skill) {
    nextQuestion = `Thank you, ${updated.name}. What is something you are very good at?`;
  } else if (updated.experience_years === null) {
    nextQuestion = `That sounds wonderful! How many years of experience do you have in ${updated.skill}?`;
  } else if (!updated.location) {
    nextQuestion = `Great! Which city or area in India do you live in?`;
  } else if (lower.includes('yes') || lower.includes('correct') || lower.includes('good') || lower.includes('ok')) {
    completed = true;
    nextQuestion = `Wonderful! Your profile has been created successfully, ${updated.name}!`;
  } else {
    confirmationMode = true;
    nextQuestion = `${updated.name}, I have summarized your profile: ${updated.skill} expert with ${updated.experience_years} years experience in ${updated.location}. Is everything correct?`;
  }

  return {
    extracted_data: extracted,
    next_question: nextQuestion,
    updated_profile: updated,
    completed,
    confirmation_mode: confirmationMode
  };
}
