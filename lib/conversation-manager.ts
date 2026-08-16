// Jarvis-Style Conversational Manager for SilverHands
// Architecture: Strict Intent Gate -> Targeted Handlers -> Deterministic Knowledge State & Validator

import { ProfileState, ProfileSkill, ConversationTurn } from './voice-agent';
import { 
  normalizeName, 
  normalizeSkillsList, 
  normalizeSkill, 
  normalizeExperience, 
  isConfirmationResponse,
  parseCorrectionIntent 
} from './semantic-extractor';
import { validateAndParseLocation } from './location-validator';

export type ConversationIntent = 
  | 'confirm_yes' 
  | 'confirm_no' 
  | 'correct_previous' 
  | 'ask_question' 
  | 'provide_information' 
  | 'add_information' 
  | 'change_topic' 
  | 'refusal' 
  | 'greeting' 
  | 'clarify';

export interface ConversationalAction {
  intent: ConversationIntent;
  understanding: string;
  extracted_name?: string | null;
  extracted_skills?: ProfileSkill[];
  extracted_experience?: number | null;
  extracted_location?: string | null;
  corrections?: {
    field: string;
    skill_name?: string;
    old_value?: any;
    new_value: any;
  }[];
  missing_fields: ('name' | 'skills' | 'experience' | 'location')[];
  next_action: 'collect_information' | 'clarify' | 'confirm' | 'correct_previous_answer' | 'answer_user_question' | 'finish_onboarding';
  assistant_response: string;
  completed: boolean;
}

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Deterministic intent classifier that gates extraction before any entity parsing.
 */
export function classifyIntent(speech: string, lastAssistantMessage: string = ''): ConversationIntent {
  const text = (speech || '').toLowerCase().trim();
  if (!text) return 'provide_information';

  // 1. Check for questions / inquiries about platform
  if (
    text.startsWith('can i') ||
    text.startsWith('how do i') ||
    text.startsWith('what is') ||
    text.startsWith('is it possible') ||
    text.startsWith('before that') ||
    text.startsWith('tell me about') ||
    text.includes('teach online') ||
    text.includes('online teaching') ||
    text.includes('how to teach') ||
    text.includes('get paid') ||
    text.includes('how does silverhands work')
  ) {
    return 'ask_question';
  }

  // 2. Check for explicit confirmation responses (Yes / Confirmation)
  const conf = isConfirmationResponse(text);
  if (conf.isConfirmed) {
    return 'confirm_yes';
  }

  // 3. Check for new additional information declarations (e.g. "I also teach mathematics", "Actually I also know embroidery")
  if (
    text.includes('i also') ||
    text.includes('also teach') ||
    text.includes('also know') ||
    text.includes('also do') ||
    text.includes('also make') ||
    text.includes('along with that') ||
    text.includes('and also') ||
    text.includes('as well as')
  ) {
    return 'add_information';
  }

  // 4. Check for targeted corrections (e.g. "No, actually 4 years", "My skill is Pottery not Tailoring")
  if (
    text.startsWith('no,') ||
    text.startsWith('actually, it') ||
    text.startsWith('actually i have') ||
    text.startsWith('actually it is') ||
    text.includes('i have only') ||
    text.includes('my experience is') ||
    text.includes('my skill is') ||
    text.includes('not that') ||
    text.includes('that is wrong') ||
    text.includes('i only have') ||
    text.includes('instead of')
  ) {
    return 'correct_previous';
  }

  // 5. Check for bare rejections (No / Incorrect)
  if (conf.isRejected) {
    return 'confirm_no';
  }

  // 6. Default to providing information
  return 'provide_information';
}

/**
 * Deterministic Profile Completion Validator.
 * NEVER delegates completion decisions to LLM text generation.
 */
export function isProfileComplete(profile: ProfileState): boolean {
  if (!profile.name || !profile.name.trim()) return false;
  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  if (skills.length === 0) return false;
  for (const sk of skills) {
    if (sk.experience_years === null || sk.experience_years === undefined || isNaN(Number(sk.experience_years))) {
      return false;
    }
  }
  if (!profile.location || !profile.location.trim()) return false;
  return true;
}

/**
 * Calculates missing fields deterministically from profile knowledge state.
 */
export function calculateMissingFields(profile: ProfileState): {
  missing: ('name' | 'skills' | 'experience' | 'location')[];
  skillNeedingExperience: ProfileSkill | null;
  skillIndex: number;
} {
  const missing: ('name' | 'skills' | 'experience' | 'location')[] = [];
  let skillNeedingExp: ProfileSkill | null = null;
  let missingIndex = -1;

  if (!profile.name || !profile.name.trim()) {
    missing.push('name');
  }

  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  if (skills.length === 0) {
    missing.push('skills');
  } else {
    for (let i = 0; i < skills.length; i++) {
      if (skills[i].experience_years === null || skills[i].experience_years === undefined || isNaN(Number(skills[i].experience_years))) {
        if (!missing.includes('experience')) {
          missing.push('experience');
        }
        if (!skillNeedingExp) {
          skillNeedingExp = skills[i];
          missingIndex = i;
        }
      }
    }
  }

  if (!profile.location || !profile.location.trim()) {
    missing.push('location');
  }

  return {
    missing,
    skillNeedingExperience: skillNeedingExp,
    skillIndex: missingIndex
  };
}

/**
 * Calls Gemini 2.5 Flash with full conversation history and structured schema.
 */
async function callGeminiConversationAgent(
  userSpeech: string,
  currentProfile: ProfileState,
  history: ConversationTurn[],
  lastAssistantMessage: string
): Promise<any | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `
You are the SilverHands Jarvis-style Conversational Onboarding Assistant for Indian elder creators.
Your job is to understand the user's intent, extract structured profile entities, handle questions/corrections, and converse naturally.

CURRENT VERIFIED/CANDIDATE PROFILE STATE:
${JSON.stringify(currentProfile, null, 2)}

PREVIOUS CONVERSATION HISTORY:
${history.map(h => `${h.role === 'assistant' ? 'AI' : 'User'}: "${h.text}"`).join('\n') || '(Conversation just started)'}

LAST ASSISTANT QUESTION/MESSAGE:
"${lastAssistantMessage}"

NEW USER SPEECH:
"${userSpeech}"

INSTRUCTIONS:
1. Classify the user's INTENT: "confirm_yes" | "confirm_no" | "correct_previous" | "ask_question" | "provide_information" | "add_information".
2. If the user is CONFIRMING (e.g. "Yes", "Everything is correct"), do NOT extract skills or profile fields.
3. If the user asks a QUESTION (e.g. "Can I teach online?"), answer warmly about SilverHands, then pivot to what is missing.
4. If the user CORRECTS something (e.g. "No, 4 years"), output the exact correction object.
5. If the user provides multiple pieces of information at once (name, skills, experience, location), extract all of them.

RETURN STRICT JSON ONLY:
{
  "intent": "confirm_yes" | "confirm_no" | "correct_previous" | "ask_question" | "provide_information" | "add_information",
  "user_question_answer": string | null,
  "extracted_name": string | null,
  "extracted_skills": [
    {
      "name": "Tailoring & Stitching",
      "type": "primary" | "additional",
      "experience_years": number | null
    }
  ],
  "extracted_location": string | null,
  "corrections": [
    {
      "field": "name" | "skill" | "experience" | "location",
      "skill_name": string | null,
      "new_value": string | number
    }
  ],
  "assistant_response": string
}
`;

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!res.ok) {
      console.warn(`[Gemini API Notice] status: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (rawJson) {
      return JSON.parse(rawJson);
    }
  } catch (err) {
    console.warn('[Gemini Engine Notice]:', err);
  }

  return null;
}

/**
 * Core Jarvis Conversation Engine
 * Gated by Intent -> Targeted Handlers -> Deterministic Validation
 */
export async function manageConversationTurn(
  userSpeech: string,
  candidateProfile: ProfileState,
  history: ConversationTurn[] = [],
  lastAssistantMessage: string = '',
  mockLlmResult: any = null
): Promise<{
  action: ConversationalAction;
  updatedProfile: ProfileState;
}> {
  const cleanSpeech = (userSpeech || '').trim();
  const updatedProfile: ProfileState = {
    ...candidateProfile,
    skills: Array.isArray(candidateProfile.skills) ? [...candidateProfile.skills] : []
  };

  // Step 1: Call Gemini if available, or use mock if provided (100% offline testable)
  let llmResult: any = mockLlmResult;
  if (!llmResult) {
    llmResult = await callGeminiConversationAgent(cleanSpeech, updatedProfile, history, lastAssistantMessage);
  }

  // Step 2: Gated Intent Classification
  const deterministicIntent = classifyIntent(cleanSpeech, lastAssistantMessage);
  const intent: ConversationIntent = llmResult?.intent || deterministicIntent;

  let assistantResponse = llmResult?.assistant_response || '';
  let nextAction: ConversationalAction['next_action'] = 'collect_information';

  // =========================================================================
  // INTENT BRANCH 1: CONFIRMATION YES ("Yes", "Everything is correct", etc.)
  // =========================================================================
  if (intent === 'confirm_yes') {
    // CRITICAL: DO NOT EXTRACT ENTITIES ON CONFIRMATION!
    // "Yes" or "Everything is correct" must NEVER touch skills/location/name.
    const complete = isProfileComplete(updatedProfile);
    if (complete) {
      nextAction = 'finish_onboarding';
      if (!assistantResponse) {
        assistantResponse = `Wonderful, ${updatedProfile.name}! Your profile has been confirmed and saved successfully.`;
      }
      return {
        action: {
          intent: 'confirm_yes',
          understanding: cleanSpeech,
          extracted_name: updatedProfile.name,
          extracted_skills: updatedProfile.skills,
          extracted_location: updatedProfile.location,
          missing_fields: [],
          next_action: 'finish_onboarding',
          assistant_response: assistantResponse,
          completed: true
        },
        updatedProfile
      };
    } else {
      // Incomplete profile attempted confirmation
      const missingState = calculateMissingFields(updatedProfile);
      nextAction = 'collect_information';
      if (!assistantResponse) {
        if (missingState.missing.includes('skills')) assistantResponse = `What skills or crafts do you practice?`;
        else if (missingState.missing.includes('experience') && missingState.skillNeedingExperience) {
          assistantResponse = `How many years of experience do you have in ${missingState.skillNeedingExperience.name}?`;
        } else if (missingState.missing.includes('location')) assistantResponse = `Which city or locality in India are you based in?`;
      }
      return {
        action: {
          intent: 'confirm_yes',
          understanding: cleanSpeech,
          missing_fields: missingState.missing,
          next_action: nextAction,
          assistant_response: assistantResponse,
          completed: false
        },
        updatedProfile
      };
    }
  }

  // =========================================================================
  // INTENT BRANCH 2: BARE REJECTION NO ("No", "Incorrect", etc.)
  // =========================================================================
  if (intent === 'confirm_no') {
    // DO NOT EXTRACT SKILLS OR WIPE PROFILE
    nextAction = 'correct_previous_answer';
    if (!assistantResponse) {
      assistantResponse = "No problem at all. What would you like to correct — your skills, experience, or location?";
    }
    return {
      action: {
        intent: 'confirm_no',
        understanding: cleanSpeech,
        missing_fields: calculateMissingFields(updatedProfile).missing,
        next_action: 'correct_previous_answer',
        assistant_response: assistantResponse,
        completed: false
      },
      updatedProfile
    };
  }

  // =========================================================================
  // INTENT BRANCH 3: CORRECTION ("No, actually 4 years", "My skill is Pottery", etc.)
  // =========================================================================
  if (intent === 'correct_previous') {
    nextAction = 'confirm';
    let appliedCorrection = false;

    // Check LLM corrections
    if (Array.isArray(llmResult?.corrections) && llmResult.corrections.length > 0) {
      for (const c of llmResult.corrections) {
        if (c.field === 'name' && c.new_value) {
          updatedProfile.name = String(c.new_value);
          appliedCorrection = true;
        } else if (c.field === 'experience' && (typeof c.new_value === 'number' || !isNaN(Number(c.new_value)))) {
          const numVal = Number(c.new_value);
          if (c.skill_name && updatedProfile.skills) {
            const sk = updatedProfile.skills.find(s => s.name.toLowerCase().includes(c.skill_name!.toLowerCase()));
            if (sk) sk.experience_years = numVal;
          } else if (updatedProfile.skills && updatedProfile.skills.length > 0) {
            updatedProfile.skills[0].experience_years = numVal;
          }
          appliedCorrection = true;
        } else if (c.field === 'location' && c.new_value) {
          const loc = validateAndParseLocation(String(c.new_value));
          if (loc.formatted_address) updatedProfile.location = loc.formatted_address;
          appliedCorrection = true;
        }
      }
    }

    // Deterministic fallback correction parser
    if (!appliedCorrection) {
      const parsedCorr = parseCorrectionIntent(cleanSpeech);
      if (parsedCorr.intent === 'inline_correction' && parsedCorr.targetField && parsedCorr.extractedValue !== undefined) {
        if (parsedCorr.targetField === 'experience_years') {
          const numVal = Number(parsedCorr.extractedValue);
          if (updatedProfile.skills && updatedProfile.skills.length > 0) {
            updatedProfile.skills[0].experience_years = numVal;
          }
        } else if (parsedCorr.targetField === 'skill') {
          const norm = normalizeSkill(String(parsedCorr.extractedValue)).normalized || String(parsedCorr.extractedValue);
          if (updatedProfile.skills && updatedProfile.skills.length > 0) {
            updatedProfile.skills[0].name = norm;
          }
        } else if (parsedCorr.targetField === 'location') {
          const loc = validateAndParseLocation(String(parsedCorr.extractedValue));
          if (loc.formatted_address) updatedProfile.location = loc.formatted_address;
        } else if (parsedCorr.targetField === 'name') {
          updatedProfile.name = String(parsedCorr.extractedValue);
        }
      }
    }

    // Update legacy backwards-compatibility fields
    if (updatedProfile.skills && updatedProfile.skills.length > 0) {
      updatedProfile.skill = updatedProfile.skills[0].name;
      updatedProfile.experience_years = updatedProfile.skills[0].experience_years;
    }

    const missingState = calculateMissingFields(updatedProfile);
    if (missingState.missing.length === 0) {
      nextAction = 'confirm';
      const skillSummary = (updatedProfile.skills || []).map(s => `${s.name} (${s.experience_years} years)`).join(', ');
      if (!assistantResponse) {
        assistantResponse = `Got it, I have updated that. Here is your current profile: ${skillSummary}, located in ${updatedProfile.location}. Is that correct?`;
      }
    } else {
      nextAction = 'collect_information';
      if (!assistantResponse) {
        if (missingState.skillNeedingExperience) {
          assistantResponse = `Updated. How many years of experience do you have in ${missingState.skillNeedingExperience.name}?`;
        } else if (missingState.missing.includes('location')) {
          assistantResponse = `Updated. Which city or locality are you located in?`;
        }
      }
    }

    return {
      action: {
        intent: 'correct_previous',
        understanding: cleanSpeech,
        extracted_name: updatedProfile.name,
        extracted_skills: updatedProfile.skills,
        extracted_location: updatedProfile.location,
        missing_fields: missingState.missing,
        next_action: nextAction,
        assistant_response: assistantResponse,
        completed: false
      },
      updatedProfile
    };
  }

  // =========================================================================
  // INTENT BRANCH 4: ASK QUESTION ("Can I teach online?", etc.)
  // =========================================================================
  if (intent === 'ask_question') {
    // DO NOT EXTRACT QUESTION AS A SKILL
    let questionAnswer = llmResult?.user_question_answer || '';
    if (!questionAnswer) {
      if (cleanSpeech.toLowerCase().includes('online') || cleanSpeech.toLowerCase().includes('teach')) {
        questionAnswer = "Yes! SilverHands allows creators to offer both in-person sessions and online classes.";
      } else {
        questionAnswer = "SilverHands helps experienced creators and elders offer workshops, lessons, and handmade crafts.";
      }
    }

    const missingState = calculateMissingFields(updatedProfile);
    let pivot = '';
    if (missingState.missing.includes('name')) pivot = "First, what is your name?";
    else if (missingState.missing.includes('skills')) pivot = "What skills or subjects would you like to teach or offer?";
    else if (missingState.missing.includes('experience') && missingState.skillNeedingExperience) {
      pivot = `How many years of experience do you have in ${missingState.skillNeedingExperience.name}?`;
    } else if (missingState.missing.includes('location')) pivot = "Which city or locality in India are you based in?";
    else pivot = "Is your profile information correct?";

    assistantResponse = `${questionAnswer} ${pivot}`.trim();

    return {
      action: {
        intent: 'ask_question',
        understanding: cleanSpeech,
        missing_fields: missingState.missing,
        next_action: 'answer_user_question',
        assistant_response: assistantResponse,
        completed: false
      },
      updatedProfile
    };
  }

  // =========================================================================
  // INTENT BRANCH 5: PROVIDE OR ADD INFORMATION (Multi-Entity Extraction)
  // =========================================================================
  // 1. Name Extraction
  if (llmResult?.extracted_name) {
    const norm = normalizeName(llmResult.extracted_name).name;
    if (norm) updatedProfile.name = norm;
  } else if (!updatedProfile.name) {
    const norm = normalizeName(cleanSpeech).name;
    if (norm && !norm.toLowerCase().includes('tailor') && !norm.toLowerCase().includes('teach')) {
      updatedProfile.name = norm;
    }
  }

  // 2. Skills Extraction (Supports Multiple Skills & Inline Per-Skill Experience)
  if (Array.isArray(llmResult?.extracted_skills) && llmResult.extracted_skills.length > 0) {
    for (const gSkill of llmResult.extracted_skills) {
      const norm = normalizeSkill(gSkill.name || '').normalized || gSkill.name;
      if (norm && norm.length >= 3) {
        const existingIdx = (updatedProfile.skills || []).findIndex(s => s.name.toLowerCase() === norm.toLowerCase());
        if (existingIdx !== -1) {
          if (typeof gSkill.experience_years === 'number') {
            updatedProfile.skills![existingIdx].experience_years = gSkill.experience_years;
          }
        } else {
          updatedProfile.skills!.push({
            name: norm,
            type: gSkill.type || (updatedProfile.skills!.length === 0 ? 'primary' : 'additional'),
            experience_years: typeof gSkill.experience_years === 'number' ? gSkill.experience_years : null
          });
        }
      }
    }
  } else {
    // Deterministic fallback multi-skill extractor
    const extractedList = normalizeSkillsList(cleanSpeech);
    for (const eSkill of extractedList) {
      const existingIdx = (updatedProfile.skills || []).findIndex(s => s.name.toLowerCase() === eSkill.name.toLowerCase());
      if (existingIdx !== -1) {
        if (eSkill.experience_years !== null) {
          updatedProfile.skills![existingIdx].experience_years = eSkill.experience_years;
        }
      } else {
        updatedProfile.skills!.push(eSkill);
      }
    }
  }

  // 3. Single-Skill Experience Extraction (When answering a single targeted experience question)
  const isMultiClause = cleanSpeech.split(',').length > 1 || cleanSpeech.toLowerCase().includes(' and ') || cleanSpeech.toLowerCase().includes('also');
  const missingStatusBeforeExp = calculateMissingFields(updatedProfile);
  if (!isMultiClause && missingStatusBeforeExp.missing.includes('experience') && missingStatusBeforeExp.skillNeedingExperience) {
    const expRes = normalizeExperience(cleanSpeech);
    if (expRes.experience_years !== null) {
      const idx = missingStatusBeforeExp.skillIndex;
      if (updatedProfile.skills && updatedProfile.skills[idx]) {
        updatedProfile.skills[idx].experience_years = expRes.experience_years;
      }
    }
  }

  // 4. Location Extraction
  if (llmResult?.extracted_location) {
    const locVal = validateAndParseLocation(llmResult.extracted_location);
    if (!locVal.needs_clarification && (locVal.city || locVal.locality)) {
      updatedProfile.location = locVal.formatted_address;
    }
  } else if (!updatedProfile.location) {
    const locVal = validateAndParseLocation(cleanSpeech);
    if (!locVal.needs_clarification && (locVal.city || locVal.locality)) {
      updatedProfile.location = locVal.formatted_address;
    }
  }

  // Synchronize legacy top-level fields for backwards compatibility
  if (updatedProfile.skills && updatedProfile.skills.length > 0) {
    updatedProfile.skill = updatedProfile.skills[0].name;
    updatedProfile.experience_years = updatedProfile.skills[0].experience_years;
  }

  // Calculate missing fields deterministically
  const missingState = calculateMissingFields(updatedProfile);

  if (missingState.missing.length === 0) {
    nextAction = 'confirm';
    const skillSummary = (updatedProfile.skills || []).map(s => `${s.name} (${s.experience_years} years)`).join(', ');
    if (!assistantResponse) {
      assistantResponse = `${updatedProfile.name}, here is what I have recorded: your skills are ${skillSummary}, and you are located in ${updatedProfile.location}. Is everything correct?`;
    }
  } else {
    nextAction = 'collect_information';
    if (!assistantResponse) {
      if (missingState.missing.includes('name')) {
        assistantResponse = "Welcome to SilverHands! What is your name?";
      } else if (missingState.missing.includes('skills')) {
        assistantResponse = `Nice to meet you, ${updatedProfile.name}! What skills, crafts, or work do you offer?`;
      } else if (missingState.missing.includes('experience') && missingState.skillNeedingExperience) {
        // Targeted skill-specific experience inquiry
        assistantResponse = `How many years of experience do you have in ${missingState.skillNeedingExperience.name}?`;
      } else if (missingState.missing.includes('location')) {
        assistantResponse = `Great. Which city or locality in India do you live or work in?`;
      }
    }
  }

  return {
    action: {
      intent,
      understanding: cleanSpeech,
      extracted_name: updatedProfile.name,
      extracted_skills: updatedProfile.skills,
      extracted_location: updatedProfile.location,
      missing_fields: missingState.missing,
      next_action: nextAction,
      assistant_response: assistantResponse,
      completed: false
    },
    updatedProfile
  };
}
