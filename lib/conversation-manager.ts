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

  // 4. Check for targeted corrections (e.g. "No, actually 4 years", "My skill is Pottery not Tailoring", "Sorry, I meant Chennai")
  if (
    text.startsWith('no,') ||
    text.startsWith('actually') ||
    text.startsWith('sorry') ||
    text.includes('i meant') ||
    text.includes(' meant ') ||
    text.includes('make that') ||
    text.includes('change that') ||
    text.includes('i moved') ||
    text.includes("don't do") ||
    text.includes("not doing") ||
    text.includes("remove ") ||
    text.includes("no longer") ||
    text.includes('i have only') ||
    text.includes('my experience is') ||
    text.includes('my skill is') ||
    text.includes('not that') ||
    text.includes('that is wrong') ||
    text.includes('i only have') ||
    text.includes('instead of') ||
    text.includes('instead')
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
  const nameLower = profile.name.toLowerCase();
  if (
    nameLower.includes('like to') || 
    nameLower.includes('cooking') || 
    nameLower.includes('cleaning') || 
    nameLower.includes('tailor') ||
    nameLower.includes('experience') || 
    nameLower.includes('years') || 
    profile.name.split(' ').length > 3
  ) {
    return false;
  }

  const skills = Array.isArray(profile.skills) ? profile.skills : [];
  if (skills.length === 0) return false;
  for (const sk of skills) {
    if (!sk.name || sk.name.toLowerCase().includes('experience') || sk.name.toLowerCase().includes('i have of')) {
      return false;
    }
    if (sk.experience_years === null || sk.experience_years === undefined || isNaN(Number(sk.experience_years))) {
      return false;
    }
  }

  if (!profile.location || !profile.location.trim()) return false;
  const locLower = profile.location.toLowerCase();
  if (
    locLower === 'zero' || 
    locLower === 'none' || 
    locLower === 'nil' || 
    locLower === 'unknown' || 
    /^\d+$/.test(locLower) ||
    locLower.includes('cooking') ||
    locLower.includes('cleaning')
  ) {
    return false;
  }

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

  const nameLower = (profile.name || '').toLowerCase();
  const isInvalidName = !profile.name || !profile.name.trim() || 
    nameLower.includes('like to') || 
    nameLower.includes('cooking') || 
    nameLower.includes('cleaning') || 
    nameLower.includes('tailor') ||
    nameLower.includes('experience') || 
    nameLower.includes('years') || 
    profile.name.split(' ').length > 3;

  if (isInvalidName) {
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

  const locLower = (profile.location || '').toLowerCase();
  const isInvalidLocation = !profile.location || !profile.location.trim() || 
    locLower === 'zero' || 
    locLower === 'none' || 
    locLower === 'nil' || 
    locLower === 'unknown' || 
    /^\d+$/.test(locLower) ||
    locLower.includes('cooking') ||
    locLower.includes('cleaning');

  if (isInvalidLocation) {
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

  // Determine current onboarding stage to give Gemini precise context
  const stageName = !currentProfile.name
    ? 'STAGE_1_NAME'
    : (!currentProfile.skills || currentProfile.skills.length === 0)
      ? 'STAGE_2_SKILLS'
      : (currentProfile.skills.some(s => s.experience_years === null))
        ? 'STAGE_3_EXPERIENCE'
        : !currentProfile.location
          ? 'STAGE_4_LOCATION'
          : 'STAGE_5_CONFIRM';

  const skillNeedingExp = currentProfile.skills?.find(s => s.experience_years === null)?.name || null;

  const prompt = `
You are Jarvis — the warm, patient, voice-first onboarding assistant for SilverHands, a livelihood platform for senior Indian creators and artisans.
Your role: extract profile information from elderly Indian users speaking naturally (with accents, ASR errors, mixed language), and ask the next question conversationally.

CURRENT PROFILE STATE:
${JSON.stringify(currentProfile, null, 2)}

CURRENT ONBOARDING STAGE: ${stageName}
${skillNeedingExp ? `SKILL NEEDING EXPERIENCE: "${skillNeedingExp}"` : ''}

CONVERSATION HISTORY (last ${Math.min(history.length, 6)} turns):
${history.slice(-6).map(h => `${h.role === 'assistant' ? 'Jarvis' : 'User'}: "${h.text}"`).join('\n') || '(First message)'}

LAST JARVIS QUESTION:
"${lastAssistantMessage}"

USER JUST SAID:
"${userSpeech}"

INSTRUCTIONS:
1. Classify the user's INTENT: "confirm_yes" | "confirm_no" | "correct_previous" | "ask_question" | "provide_information" | "add_information".
2. Extract any profile information the user has provided.
3. If confirming ("Yes", "That's right", etc.), do NOT extract new skills or fields — just confirm.
4. If the user asks a question about SilverHands, answer warmly and pivot to the next missing field.
5. For "assistant_response": Write a UNIQUE, WARM, conversational follow-up question for the NEXT stage.
   - Do NOT repeat the last question verbatim. Rephrase or ask from a different angle.
   - For STAGE_1_NAME: Ask for the user's name in a friendly, welcoming way.
   - For STAGE_2_SKILLS: Ask about their skills, crafts, or expertise — mention SilverHands connects them with learners.
   - For STAGE_3_EXPERIENCE: Ask specifically about years of experience in "${skillNeedingExp || 'their skill'}" in a natural, encouraging way.
   - For STAGE_4_LOCATION: Ask which city or locality they live or work in.
   - For STAGE_5_CONFIRM: Summarize what you have and ask if it is correct.
   - Keep the tone warm, respectful, and suitable for senior citizens.
   - Never say "Sorry" or "Unfortunately" unnecessarily.

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
  // INTENT BRANCH 3: TARGETED CORRECTIONS ("Actually 4 years", "Moved to Bangalore", "No cooking", etc.)
  // =========================================================================
  if (intent === 'correct_previous') {
    nextAction = 'confirm';
    let appliedCorrection = false;
    const lowerSpeech = cleanSpeech.toLowerCase();

    // 1. Check for Skill Removal (e.g. "I don't do painting anymore", "remove painting")
    if (lowerSpeech.includes("don't do") || lowerSpeech.includes("not doing") || lowerSpeech.includes("remove") || lowerSpeech.includes("no longer do")) {
      const skillsBefore = updatedProfile.skills || [];
      const filtered = skillsBefore.filter(s => !lowerSpeech.includes(s.name.toLowerCase().split(' ')[0]));
      if (filtered.length < skillsBefore.length) {
        updatedProfile.skills = filtered;
        appliedCorrection = true;
      }
    }

    // 2. Check for Skill Replacement (e.g. "No, I meant tailoring, not cooking")
    if (!appliedCorrection && (lowerSpeech.includes(" meant ") || lowerSpeech.includes("not ")) && (lowerSpeech.includes("tailor") || lowerSpeech.includes("pottery") || lowerSpeech.includes("cook") || lowerSpeech.includes("teach"))) {
      const normNew = normalizeSkill(cleanSpeech).normalized;
      if (normNew && updatedProfile.skills && updatedProfile.skills.length > 0) {
        updatedProfile.skills[0].name = normNew;
        appliedCorrection = true;
      }
    }

    // 3. Check for Experience Updates (e.g. "Actually make that 7 years", "painting 7 years")
    if (!appliedCorrection) {
      const expRes = normalizeExperience(cleanSpeech);
      if (expRes.experience_years !== null && updatedProfile.skills && updatedProfile.skills.length > 0) {
        // Check if a specific skill was mentioned in the correction
        let matchedIdx = -1;
        for (let i = 0; i < updatedProfile.skills.length; i++) {
          const firstWord = updatedProfile.skills[i].name.toLowerCase().split(' ')[0];
          if (lowerSpeech.includes(firstWord)) {
            matchedIdx = i;
            break;
          }
        }
        if (matchedIdx !== -1) {
          updatedProfile.skills[matchedIdx].experience_years = expRes.experience_years;
        } else {
          updatedProfile.skills[0].experience_years = expRes.experience_years;
        }
        appliedCorrection = true;
      }
    }

    // 4. Check for Location Updates (e.g. "Actually I moved to Bangalore", "Coimbatore not Chennai")
    if (!appliedCorrection) {
      const locVal = validateAndParseLocation(cleanSpeech);
      if (!locVal.needs_clarification && (locVal.city || locVal.locality)) {
        updatedProfile.location = locVal.formatted_address;
        appliedCorrection = true;
      }
    }

    // 5. Check for Name Updates (e.g. "My name is Haresh not Harish")
    if (!appliedCorrection) {
      const nameRes = normalizeName(cleanSpeech);
      if (nameRes.name) {
        updatedProfile.name = nameRes.name;
        appliedCorrection = true;
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
      assistantResponse = `Got it, I have updated that. Here is your current profile: your skills are ${skillSummary}, and you are located in ${updatedProfile.location}. Is that correct?`;
    } else {
      nextAction = 'collect_information';
      if (missingState.skillNeedingExperience) {
        assistantResponse = `Updated. How many years of experience do you have in ${missingState.skillNeedingExperience.name}?`;
      } else if (missingState.missing.includes('location')) {
        assistantResponse = `Updated. Which city or locality in India are you located in?`;
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
  // INTENT BRANCH 5: PROVIDE OR ADD INFORMATION (Strict Sequential Timeline Gating)
  // Timeline: Stage 1 (Name) -> Stage 2 (Skills) -> Stage 3 (Experience) -> Stage 4 (Location) -> Stage 5 (Confirm)
  // =========================================================================

  // --- STAGE 1: NAME EXTRACTION GATE ---
  const isExplicitNameIntro = /^(?:my\s+name\s+is|i\s+am|i'?m|myself|this\s+is|call\s+me)\s+[a-z]+/i.test(cleanSpeech);
  const wasAskedName = (lastAssistantMessage || '').toLowerCase().includes('name') || !updatedProfile.name;

  if (llmResult?.extracted_name) {
    const norm = normalizeName(llmResult.extracted_name).name;
    if (norm) updatedProfile.name = norm;
  } else if (!updatedProfile.name && (isExplicitNameIntro || wasAskedName)) {
    const hasSkillsOrVerbs = cleanSpeech.toLowerCase().includes('cook') || 
      cleanSpeech.toLowerCase().includes('clean') || 
      cleanSpeech.toLowerCase().includes('tailor') || 
      cleanSpeech.toLowerCase().includes('stitch') || 
      cleanSpeech.toLowerCase().includes('pottery') || 
      cleanSpeech.toLowerCase().includes('teach') || 
      cleanSpeech.toLowerCase().includes('like to') || 
      cleanSpeech.toLowerCase().includes('experience') || 
      cleanSpeech.toLowerCase().includes('years');

    if (isExplicitNameIntro || !hasSkillsOrVerbs) {
      const norm = normalizeName(cleanSpeech).name;
      if (norm) {
        updatedProfile.name = norm;
      }
    }
  }

  // TIMELINE BARRIER 1: Without a valid Name, no skills, experience, or location can be collected.
  if (!updatedProfile.name) {
    const NAME_QUESTIONS = [
      "Welcome to SilverHands! I'm here to help you set up your profile. Could you please tell me your full name?",
      "Hello! I'm Jarvis, your SilverHands guide. To get started, may I know your name?",
      "Welcome! Let's create your SilverHands profile together. What is your name?",
      "Namaste! I'm Jarvis. Before we begin, could you kindly share your full name?",
      "Hi there! I'm delighted to help you join SilverHands. What should I call you?"
    ];
    const nameQuestion = llmResult?.assistant_response ||
      NAME_QUESTIONS[Math.floor(Math.random() * NAME_QUESTIONS.length)];
    return {
      action: {
        intent,
        understanding: cleanSpeech,
        extracted_name: null,
        extracted_skills: [],
        extracted_location: null,
        missing_fields: ['name', 'skills', 'experience', 'location'],
        next_action: 'collect_information',
        assistant_response: nameQuestion,
        completed: false
      },
      updatedProfile
    };
  }

  // --- STAGE 2: SKILLS EXTRACTION GATE ---
  // Only accessible when Name is verified.
  const wasAskedLocation = (lastAssistantMessage || '').toLowerCase().includes('city') ||
    (lastAssistantMessage || '').toLowerCase().includes('locality') ||
    (lastAssistantMessage || '').toLowerCase().includes('located') ||
    (lastAssistantMessage || '').toLowerCase().includes('where');
  const wasAskedSkill = (lastAssistantMessage || '').toLowerCase().includes('skill') || 
    (lastAssistantMessage || '').toLowerCase().includes('craft') || 
    (lastAssistantMessage || '').toLowerCase().includes('offer') ||
    (lastAssistantMessage || '').toLowerCase().includes('teach') ||
    (lastAssistantMessage || '').toLowerCase().includes('subject');

  const shouldExtractSkills = wasAskedSkill || 
    intent === 'add_information' || 
    (!wasAskedLocation && (!updatedProfile.skills || updatedProfile.skills.length === 0));

  if (shouldExtractSkills) {
    if (Array.isArray(llmResult?.extracted_skills) && llmResult.extracted_skills.length > 0) {
      for (const gSkill of llmResult.extracted_skills) {
        const norm = normalizeSkill(gSkill.name || '').normalized;
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
        const norm = normalizeSkill(eSkill.name || '').normalized;
        if (norm && norm.length >= 3) {
          const existingIdx = (updatedProfile.skills || []).findIndex(s => s.name.toLowerCase() === norm.toLowerCase());
          if (existingIdx !== -1) {
            if (eSkill.experience_years !== null) {
              updatedProfile.skills![existingIdx].experience_years = eSkill.experience_years;
            }
          } else {
            updatedProfile.skills!.push({
              name: norm,
              type: eSkill.type || (updatedProfile.skills!.length === 0 ? 'primary' : 'additional'),
              experience_years: eSkill.experience_years
            });
          }
        }
      }
    }
  } else {
    // If not adding new skills, check if user provided inline experience for existing skills
    const extractedList = normalizeSkillsList(cleanSpeech);
    for (const eSkill of extractedList) {
      const existingIdx = (updatedProfile.skills || []).findIndex(s => s.name.toLowerCase() === eSkill.name.toLowerCase());
      if (existingIdx !== -1 && eSkill.experience_years !== null) {
        updatedProfile.skills![existingIdx].experience_years = eSkill.experience_years;
      }
    }
  }

  // TIMELINE BARRIER 2: Without at least one verified skill, cannot collect experience or location.
  if (!updatedProfile.skills || updatedProfile.skills.length === 0) {
    const n = updatedProfile.name || 'there';
    const SKILL_QUESTIONS = [
      `It's lovely to meet you, ${n}! What skills or crafts have you mastered over the years?`,
      `Wonderful, ${n}! SilverHands connects talented people with eager learners. What do you enjoy making, teaching, or creating?`,
      `Great to have you here, ${n}! Could you tell me about the skills or arts you practice?`,
      `Thank you, ${n}! What are the things you are best at — a craft, a skill, or something you love to teach?`,
      `${n}, I would love to know more about your expertise. What skills or activities define your work?`
    ];
    const skillQuestion = llmResult?.assistant_response ||
      SKILL_QUESTIONS[Math.floor(Math.random() * SKILL_QUESTIONS.length)];
    return {
      action: {
        intent,
        understanding: cleanSpeech,
        extracted_name: updatedProfile.name,
        extracted_skills: [],
        extracted_location: null,
        missing_fields: ['skills', 'experience', 'location'],
        next_action: 'collect_information',
        assistant_response: skillQuestion,
        completed: false
      },
      updatedProfile
    };
  }

  // --- STAGE 3: EXPERIENCE EXTRACTION GATE ---
  // Only accessible when Skills are present.
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

  // Check if any skill is still missing experience
  const missingStatusAfterExp = calculateMissingFields(updatedProfile);
  if (missingStatusAfterExp.missing.includes('experience') && missingStatusAfterExp.skillNeedingExperience) {
    const skillName = missingStatusAfterExp.skillNeedingExperience.name;
    const EXP_QUESTIONS = [
      `That's impressive! How many years have you been practising ${skillName}?`,
      `Wonderful! Could you tell me how long you have been doing ${skillName}?`,
      `Great skill! How many years of experience do you have in ${skillName}?`,
      `${skillName} sounds amazing! How many years have you spent mastering it?`,
      `I'd love to know — how long have you been involved in ${skillName}?`
    ];
    const expQuestion = llmResult?.assistant_response ||
      EXP_QUESTIONS[Math.floor(Math.random() * EXP_QUESTIONS.length)];
    return {
      action: {
        intent,
        understanding: cleanSpeech,
        extracted_name: updatedProfile.name,
        extracted_skills: updatedProfile.skills,
        extracted_location: null,
        missing_fields: missingStatusAfterExp.missing,
        next_action: 'collect_information',
        assistant_response: expQuestion,
        completed: false
      },
      updatedProfile
    };
  }

  // --- STAGE 4: LOCATION EXTRACTION GATE ---
  // Only accessible when Name, Skills, and Experience are all verified.
  let locationClarificationMsg: string | null = null;
  const isPureNumber = /^(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s*(?:years?|yrs?)?$/i.test(cleanSpeech.trim());

  if (!isPureNumber) {
    const locVal = validateAndParseLocation(llmResult?.extracted_location || cleanSpeech);
    if (!locVal.needs_clarification && (locVal.city || locVal.locality)) {
      updatedProfile.location = locVal.formatted_address;
    } else if (locVal.needs_clarification) {
      locationClarificationMsg = locVal.clarification_question || null;
    }
  }

  // Synchronize legacy top-level fields for backwards compatibility
  if (updatedProfile.skills && updatedProfile.skills.length > 0) {
    updatedProfile.skill = updatedProfile.skills[0].name;
    updatedProfile.experience_years = updatedProfile.skills[0].experience_years;
  }

  // TIMELINE BARRIER 4: Check if Location is still missing
  if (!updatedProfile.location) {
    const LOC_QUESTIONS = [
      `Almost done! Which city or locality in India do you live or work in?`,
      `We're nearly there! Could you tell me your city or area so learners nearby can find you?`,
      `One last thing — which part of India are you based in?`,
      `Great, ${updatedProfile.name}! Which city or town are you from?`,
      `To help connect you with local learners, could you share your city or locality?`
    ];
    const locQuestion = locationClarificationMsg ||
      llmResult?.assistant_response ||
      LOC_QUESTIONS[Math.floor(Math.random() * LOC_QUESTIONS.length)];
    return {
      action: {
        intent,
        understanding: cleanSpeech,
        extracted_name: updatedProfile.name,
        extracted_skills: updatedProfile.skills,
        extracted_location: null,
        missing_fields: ['location'],
        next_action: locationClarificationMsg ? 'clarify' : 'collect_information',
        assistant_response: locQuestion,
        completed: false
      },
      updatedProfile
    };
  }

  // --- STAGE 5: SUMMARY & CONFIRMATION ---
  nextAction = 'confirm';
  const skillSummary = (updatedProfile.skills || []).map(s => `${s.name} (${s.experience_years} year${s.experience_years === 1 ? '' : 's'})`).join(', ');
  if (!assistantResponse) {
    const CONFIRM_QUESTIONS = [
      `${updatedProfile.name}, here is your profile: skills — ${skillSummary}, location — ${updatedProfile.location}. Does everything look correct?`,
      `Perfect, ${updatedProfile.name}! I have noted: ${skillSummary}, based in ${updatedProfile.location}. Shall I save this?`,
      `Let me read that back — ${updatedProfile.name}, specialising in ${skillSummary}, located in ${updatedProfile.location}. Is that right?`,
      `Thank you, ${updatedProfile.name}! Your profile shows ${skillSummary} in ${updatedProfile.location}. Is everything accurate?`
    ];
    assistantResponse = llmResult?.assistant_response ||
      CONFIRM_QUESTIONS[Math.floor(Math.random() * CONFIRM_QUESTIONS.length)];
  }

  return {
    action: {
      intent,
      understanding: cleanSpeech,
      extracted_name: updatedProfile.name,
      extracted_skills: updatedProfile.skills,
      extracted_location: updatedProfile.location,
      missing_fields: [],
      next_action: nextAction,
      assistant_response: assistantResponse,
      completed: false
    },
    updatedProfile
  };
}
