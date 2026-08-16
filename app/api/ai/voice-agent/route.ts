import { NextResponse } from 'next/server';
import { ProfileState, ProfileSkill, ConversationState, AgentTurnResponse } from '@/lib/voice-agent';
import { validateAndParseLocation } from '@/lib/location-validator';
import {
  normalizeName,
  normalizeSkill,
  normalizeSkillsList,
  normalizeExperience,
  isConfirmationResponse,
  parseCorrectionIntent
} from '@/lib/semantic-extractor';

const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const preferredOllamaModel = process.env.OLLAMA_MODEL || 'qwen3:4b';

const OLLAMA_MODELS_TO_TRY = Array.from(new Set([
  preferredOllamaModel,
  'qwen2.5:3b',
  'qwen2.5',
  'qwen2.5:1.5b',
  'qwen3:4b',
  'qwen2.5-coder:3b',
  'llama3.2:latest',
  'gemma2:2b'
]));

export async function POST(req: Request) {
  try {
    const {
      conversation_state,
      current_question,
      confirmed_profile,
      candidate_profile,
      conversation_history,
      user_speech,
      target_field,
      active_skill_index
    } = await req.json();

    const state: ConversationState = conversation_state || 'ASKING_NAME';
    const activeIndex: number = typeof active_skill_index === 'number' ? active_skill_index : 0;
    const candidate: ProfileState = candidate_profile || {
      name: null,
      skills: [],
      skill: null,
      experience_years: null,
      location: null,
      language: null,
      services: [],
      availability: null
    };

    if (!Array.isArray(candidate.skills)) {
      candidate.skills = candidate.skill
        ? [{ name: candidate.skill, experience_years: candidate.experience_years ?? null, type: 'primary' }]
        : [];
    }

    const speechText: string = (user_speech || '').trim();

    if (!speechText) {
      return NextResponse.json({
        success: true,
        provider: 'fallback-empty',
        turn: {
          extracted_data: {},
          next_question: current_question || "Welcome to SilverHands! I will help you create your profile using voice. What is your name?",
          updated_profile: candidate,
          completed: false,
          confirmation_mode: state === 'CONFIRMING_PROFILE',
          conversation_state: state,
          target_field: target_field || null,
          active_skill_index: activeIndex
        }
      });
    }

    // Step 1: Call Gemini / Ollama for semantic interpretation
    let llmResult: any = null;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (geminiApiKey) {
      try {
        const prompt = buildLlmPrompt(state, current_question, confirmed_profile, candidate, speechText, activeIndex, conversation_history);
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
            })
          }
        );
        if (geminiRes.ok) {
          const gemData = await geminiRes.json();
          const textOut = gemData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textOut) {
            llmResult = JSON.parse(textOut);
            console.log('[VoiceAgent] Gemini multi-skill semantic output:', llmResult);
          }
        }
      } catch (geminiErr) {
        console.warn('[VoiceAgent] Gemini attempt notice:', geminiErr);
      }
    }

    if (!llmResult) {
      const prompt = buildLlmPrompt(state, current_question, confirmed_profile, candidate, speechText, activeIndex, conversation_history);
      for (const modelCandidate of OLLAMA_MODELS_TO_TRY) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);

          const ollamaRes = await fetch(`${ollamaHost}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              model: modelCandidate,
              prompt,
              stream: false,
              format: 'json',
              options: { num_predict: 250, temperature: 0.1 }
            })
          });
          clearTimeout(timeoutId);

          if (ollamaRes.ok) {
            const ollamaData = await ollamaRes.json();
            const jsonMatch = (ollamaData.response || '').match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              llmResult = JSON.parse(jsonMatch[0]);
              console.log(`[VoiceAgent] Extracted via Ollama (${modelCandidate}):`, llmResult);
              break;
            }
          }
        } catch (_) {}
      }
    }

    // Step 2: Pass through Authoritative Stateful Conversation Engine with multi-skill question queue
    const turn: AgentTurnResponse = processStatefulTurn(state, current_question, candidate, speechText, target_field, activeIndex, llmResult);

    return NextResponse.json({
      success: true,
      provider: llmResult ? 'hybrid-llm-validated' : 'deterministic-state-engine',
      turn
    });

  } catch (err) {
    console.error('Voice Agent API handler error:', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}

function buildLlmPrompt(
  conversationState: ConversationState,
  currentQuestion: string,
  confirmedProfile: ProfileState | null,
  candidateProfile: ProfileState,
  speechText: string,
  activeSkillIndex: number,
  conversationHistory: any[]
): string {
  return `
You are the semantic understanding layer of a voice-based profile onboarding system for Indian elder creators.
Your job is NOT to copy the speech transcript verbatim.
Understand what the user means and extract all structured entities.

CURRENT CONVERSATION STATE:
${conversationState}

CURRENT ACTIVE SKILL INDEX:
${activeSkillIndex}

CURRENT QUESTION:
"${currentQuestion || ''}"

CURRENT CANDIDATE PROFILE:
${JSON.stringify(candidateProfile, null, 2)}

LATEST USER TRANSCRIPT:
"${speechText}"

CRITICAL EXTRACTION RULES:
1. MULTIPLE SKILLS: The user may provide one or multiple skills in a single answer (e.g., "I do tailoring and I also teach mathematics", "I know tailoring, embroidery and blouse stitching", "I play badminton and I coach children").
   - Extract EVERY distinct skill, craft, profession, service, or work activity mentioned into the "skills" array.
   - NEVER stop after identifying the first skill.
   - Do not merge unrelated skills into one string.
   - Normalize each skill independently in Title Case (e.g. "Tailoring & Stitching", "Mathematics Teaching", "Badminton", "Embroidery & Handcraft", "Traditional Cooking").
   - If user indicates primary vs additional (e.g. "I mainly do tailoring, but also embroidery"), set type to "primary" or "additional".
   - If the user provides experience upfront for any skill (e.g., "tailoring for 10 years and teaching maths for 4 years", "just started teaching maths" -> 0), extract experience_years for that specific skill in the array.
2. PHONETIC ERROR TOLERANCE: Normalize phonetic ASR slips ("black mitten" / "shuttle" -> "Badminton", "tayloring" -> "Tailoring & Stitching", "maths" -> "Mathematics Teaching").
3. NUMERIC ACCURACY: Preserve numeric zero as 0 ("zero", "none", "beginner", "just started"). NEVER default to 30 or invent numbers!
4. LOCATION: Distinguish Indian states from cities/localities. Reject non-geographic entities like "Mars" or "Space".
5. CONFIRMATION & CORRECTIONS:
   - "Yes" -> confirm_yes.
   - Bare "No" during confirmation -> confirm_no / ask_correction.
   - Inline correction (e.g. "No, my experience in tailoring is 5 years", "No, my skill is Pottery") -> correction with target field and updated values.

RETURN STRICT JSON ONLY:
{
  "intent": "provide_name" | "provide_skills" | "provide_experience" | "provide_location" | "confirm_yes" | "confirm_no" | "correction",
  "name": string | null,
  "skills": [
    {
      "name": "Tailoring",
      "type": "primary" | "additional",
      "experience_years": 10 | null
    }
  ],
  "experience_years": number | null,
  "location": string | null,
  "correction_target": "name" | "skill" | "experience" | "location" | null
}
`;
}

/**
 * Authoritative Stateful Turn Processor with Multi-Skill Question Queue
 */
function processStatefulTurn(
  state: ConversationState,
  currentQuestion: string,
  candidate: ProfileState,
  speech: string,
  targetField: string | null,
  activeSkillIndex: number,
  llmResult: any
): AgentTurnResponse {
  const updatedCandidate: ProfileState & { skills: ProfileSkill[] } = {
    ...candidate,
    skills: Array.isArray(candidate.skills) ? [...candidate.skills] : []
  };
  const extractedData: Partial<ProfileState> = {};

  // ── 1. CONFIRMING_PROFILE STATE ──
  if (state === 'CONFIRMING_PROFILE') {
    const conf = isConfirmationResponse(speech);
    if (conf.isConfirmed || llmResult?.intent === 'confirm_yes') {
      return {
        extracted_data: {},
        next_question: `Wonderful! Your profile has been confirmed and saved successfully, ${candidate.name}!`,
        updated_profile: updatedCandidate,
        completed: true,
        confirmation_mode: false,
        conversation_state: 'COMPLETED',
        active_skill_index: 0
      };
    }

    // Check for inline corrections (e.g. "No, my experience is actually 5 years", "No, I teach mathematics")
    const correction = parseCorrectionIntent(speech);
    if (correction.intent === 'inline_correction' && correction.targetField && correction.extractedValue !== undefined) {
      applyFieldUpdate(updatedCandidate, extractedData, correction.targetField, correction.extractedValue);
      return {
        extracted_data: extractedData,
        next_question: formulateConfirmationQuestion(updatedCandidate, `Thanks! I've updated your ${formatFieldLabel(correction.targetField)}. `),
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: true,
        conversation_state: 'CONFIRMING_PROFILE',
        active_skill_index: 0
      };
    }

    // Check if user specifically named a field: "My skill", "The location", "My experience"
    if (correction.intent === 'field_targeted' && correction.targetField) {
      return {
        extracted_data: {},
        next_question: getFieldPrompt(correction.targetField, "Got it. "),
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: false,
        conversation_state: 'CORRECTING_FIELD',
        target_field: correction.targetField,
        active_skill_index: 0
      };
    }

    // User said bare NO: "No", "Incorrect", "That's wrong"
    if (conf.isRejected || llmResult?.intent === 'confirm_no' || correction.intent === 'bare_rejection') {
      return {
        extracted_data: {},
        next_question: "No problem. What would you like to correct?",
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: false,
        conversation_state: 'ASKING_CORRECTION',
        active_skill_index: 0
      };
    }
  }

  // ── 2. ASKING_CORRECTION STATE ──
  if (state === 'ASKING_CORRECTION') {
    const correction = parseCorrectionIntent(speech);

    if (correction.intent === 'field_targeted' && correction.targetField) {
      return {
        extracted_data: {},
        next_question: getFieldPrompt(correction.targetField, "Got it. "),
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: false,
        conversation_state: 'CORRECTING_FIELD',
        target_field: correction.targetField,
        active_skill_index: 0
      };
    }

    if (correction.intent === 'inline_correction' && correction.targetField && correction.extractedValue !== undefined) {
      applyFieldUpdate(updatedCandidate, extractedData, correction.targetField, correction.extractedValue);
      return {
        extracted_data: extractedData,
        next_question: formulateConfirmationQuestion(updatedCandidate, `Thanks! I've updated your ${formatFieldLabel(correction.targetField)}. `),
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: true,
        conversation_state: 'CONFIRMING_PROFILE',
        active_skill_index: 0
      };
    }

    return {
      extracted_data: {},
      next_question: "Which detail would you like to change? Your name, skills, experience, or location?",
      updated_profile: updatedCandidate,
      completed: false,
      confirmation_mode: false,
      conversation_state: 'ASKING_CORRECTION',
      active_skill_index: 0
    };
  }

  // ── 3. CORRECTING_FIELD STATE ──
  if (state === 'CORRECTING_FIELD' && targetField) {
    const f = targetField as keyof ProfileState;
    const value = extractFieldValue(f, speech, llmResult);

    if (value !== null && value !== undefined) {
      applyFieldUpdate(updatedCandidate, extractedData, f, value);
      return {
        extracted_data: extractedData,
        next_question: formulateConfirmationQuestion(updatedCandidate, `Thanks! I've updated your ${formatFieldLabel(f)}. `),
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: true,
        conversation_state: 'CONFIRMING_PROFILE',
        target_field: null,
        active_skill_index: 0
      };
    } else {
      return {
        extracted_data: {},
        next_question: getFieldPrompt(f, "I didn't quite catch that. "),
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: false,
        conversation_state: 'CORRECTING_FIELD',
        target_field: f,
        active_skill_index: 0
      };
    }
  }

  // ── 4. LINEAR ONBOARDING STATES ──

  // ASKING_NAME
  if (state === 'ASKING_NAME' || !candidate.name) {
    const rawNameCandidate = llmResult?.name || (llmResult?.field === 'name' ? llmResult.value : speech);
    const normalized = normalizeName(rawNameCandidate).name || normalizeName(speech).name;

    if (normalized) {
      updatedCandidate.name = normalized;
      extractedData.name = normalized;

      return {
        extracted_data: extractedData,
        next_question: `Thank you, ${normalized}. What is your primary skill, craft, or work?`,
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: false,
        conversation_state: 'ASKING_SKILL',
        active_skill_index: 0
      };
    } else {
      return {
        extracted_data: {},
        next_question: "Welcome to SilverHands! I will help you create your profile using voice. What is your name?",
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: false,
        conversation_state: 'ASKING_NAME',
        active_skill_index: 0
      };
    }
  }

  // ASKING_SKILL (Supports multiple skills & inline experience)
  if (state === 'ASKING_SKILL' || updatedCandidate.skills.length === 0) {
    let skillsExtracted: ProfileSkill[] = [];

    if (Array.isArray(llmResult?.skills) && llmResult.skills.length > 0) {
      skillsExtracted = llmResult.skills.map((s: any, idx: number) => {
        const norm = normalizeSkill(s.name || '').normalized || (s.name ? String(s.name).trim() : 'Skill');
        const exp = typeof s.experience_years === 'number' ? s.experience_years : null;
        return {
          name: norm,
          type: s.type === 'primary' || idx === 0 ? 'primary' : 'additional',
          experience_years: exp
        };
      });
    }

    if (skillsExtracted.length === 0) {
      skillsExtracted = normalizeSkillsList(speech);
    }

    if (skillsExtracted.length > 0) {
      updatedCandidate.skills = skillsExtracted;
      updatedCandidate.skill = skillsExtracted[0].name;
      updatedCandidate.experience_years = skillsExtracted[0].experience_years;
      extractedData.skills = skillsExtracted;
      extractedData.skill = skillsExtracted[0].name;
      extractedData.experience_years = skillsExtracted[0].experience_years;

      // Check if all skills already have experience upfront
      const firstMissingIndex = skillsExtracted.findIndex(s => s.experience_years === null);

      if (firstMissingIndex === -1) {
        // Experience was already provided for all skills upfront! Skip directly to location.
        const skillNames = skillsExtracted.map(s => s.name).join(' and ');
        return {
          extracted_data: extractedData,
          next_question: `Great! I have recorded your experience in ${skillNames}. And which city or locality in India do you live or work in?`,
          updated_profile: updatedCandidate,
          completed: false,
          confirmation_mode: false,
          conversation_state: 'ASKING_LOCATION',
          active_skill_index: 0
        };
      }

      // If multiple skills were mentioned, acknowledge all of them before asking for experience in skill #1
      if (skillsExtracted.length > 1) {
        const skillNames = skillsExtracted.map(s => s.name).join(' and ');
        return {
          extracted_data: extractedData,
          next_question: `Great. I understood ${skillsExtracted.length} skills: ${skillNames}. How many years of experience do you have in ${skillsExtracted[firstMissingIndex].name}?`,
          updated_profile: updatedCandidate,
          completed: false,
          confirmation_mode: false,
          conversation_state: 'ASKING_EXPERIENCE',
          active_skill_index: firstMissingIndex
        };
      } else {
        return {
          extracted_data: extractedData,
          next_question: `That sounds wonderful! How many years of experience do you have in ${skillsExtracted[0].name}?`,
          updated_profile: updatedCandidate,
          completed: false,
          confirmation_mode: false,
          conversation_state: 'ASKING_EXPERIENCE',
          active_skill_index: 0
        };
      }
    } else {
      return {
        extracted_data: {},
        next_question: `What is your primary skill, craft, or work that you would like to offer?`,
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: false,
        conversation_state: 'ASKING_SKILL',
        active_skill_index: 0
      };
    }
  }

  // ASKING_EXPERIENCE (Iterates through skills queue)
  if (state === 'ASKING_EXPERIENCE') {
    const currentIdx = activeSkillIndex < updatedCandidate.skills.length ? activeSkillIndex : 0;
    const currentSkill = updatedCandidate.skills[currentIdx] || { name: 'your craft', experience_years: null };

    let expNum: number | null = null;
    if (typeof llmResult?.experience_years === 'number') {
      expNum = llmResult.experience_years;
    } else if (llmResult?.field === 'experience_years' && llmResult.value !== null && !isNaN(Number(llmResult.value))) {
      expNum = Number(llmResult.value);
    } else {
      const expRes = normalizeExperience(speech);
      if (expRes.experience_years !== null) {
        expNum = expRes.experience_years;
      }
    }

    if (expNum !== null && expNum >= 0) {
      if (updatedCandidate.skills[currentIdx]) {
        updatedCandidate.skills[currentIdx].experience_years = expNum;
      }
      if (currentIdx === 0) {
        updatedCandidate.experience_years = expNum;
      }
      extractedData.skills = updatedCandidate.skills;
      extractedData.experience_years = updatedCandidate.skills[0]?.experience_years ?? expNum;

      // Check if there are more skills needing experience in the queue
      const nextMissingIndex = updatedCandidate.skills.findIndex((s, idx) => idx > currentIdx && s.experience_years === null);

      if (nextMissingIndex !== -1) {
        const nextSkill = updatedCandidate.skills[nextMissingIndex];
        return {
          extracted_data: extractedData,
          next_question: `And how many years of experience do you have in ${nextSkill.name}?`,
          updated_profile: updatedCandidate,
          completed: false,
          confirmation_mode: false,
          conversation_state: 'ASKING_EXPERIENCE',
          active_skill_index: nextMissingIndex
        };
      } else {
        // All skills have experience recorded! Advance to location
        return {
          extracted_data: extractedData,
          next_question: `Great. And which city or locality in India do you live or work in?`,
          updated_profile: updatedCandidate,
          completed: false,
          confirmation_mode: false,
          conversation_state: 'ASKING_LOCATION',
          active_skill_index: 0
        };
      }
    } else {
      return {
        extracted_data: {},
        next_question: `Could you tell me how many years of experience you have in ${currentSkill.name}, for example, zero, three, or five years?`,
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: false,
        conversation_state: 'ASKING_EXPERIENCE',
        active_skill_index: currentIdx
      };
    }
  }

  // ASKING_LOCATION
  if (state === 'ASKING_LOCATION' || !candidate.location) {
    const rawLocCandidate = llmResult?.location || (llmResult?.field === 'location' ? (typeof llmResult.value === 'string' ? llmResult.value : null) : speech);
    const locRes = validateAndParseLocation(rawLocCandidate || speech);

    if (locRes.needs_clarification && locRes.clarification_question) {
      return {
        extracted_data: {},
        next_question: locRes.clarification_question,
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: false,
        conversation_state: 'ASKING_LOCATION',
        active_skill_index: 0
      };
    } else if (locRes.is_state_only && locRes.state) {
      return {
        extracted_data: {},
        next_question: `Which city or locality in ${locRes.state} do you live or work in?`,
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: false,
        conversation_state: 'ASKING_LOCATION',
        active_skill_index: 0
      };
    } else if (locRes.city) {
      const locStr = locRes.formatted_address || locRes.city;
      updatedCandidate.location = locStr;
      extractedData.location = locStr;

      return {
        extracted_data: extractedData,
        next_question: formulateConfirmationQuestion(updatedCandidate),
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: true,
        conversation_state: 'CONFIRMING_PROFILE',
        active_skill_index: 0
      };
    } else {
      return {
        extracted_data: {},
        next_question: `Which city or town in India are you based in?`,
        updated_profile: updatedCandidate,
        completed: false,
        confirmation_mode: false,
        conversation_state: 'ASKING_LOCATION',
        active_skill_index: 0
      };
    }
  }

  // Default fallback to confirmation
  return {
    extracted_data: {},
    next_question: formulateConfirmationQuestion(updatedCandidate),
    updated_profile: updatedCandidate,
    completed: false,
    confirmation_mode: true,
    conversation_state: 'CONFIRMING_PROFILE',
    active_skill_index: 0
  };
}

function extractFieldValue(field: keyof ProfileState, speech: string, llmResult: any): any {
  if (field === 'name') {
    return normalizeName(llmResult?.value || speech).name;
  }
  if (field === 'skill' || field === 'skills') {
    const list = normalizeSkillsList(speech);
    if (list.length > 0) return list;
    const single = normalizeSkill(llmResult?.value || speech).normalized;
    return single ? [{ name: single, type: 'primary', experience_years: null }] : null;
  }
  if (field === 'experience_years') {
    if (llmResult?.value !== undefined && llmResult.value !== null && !isNaN(Number(llmResult.value))) {
      return Number(llmResult.value);
    }
    return normalizeExperience(speech).experience_years;
  }
  if (field === 'location') {
    const loc = validateAndParseLocation(llmResult?.value || speech);
    return loc.formatted_address || loc.city || null;
  }
  return null;
}

function applyFieldUpdate(candidate: ProfileState, extracted: Partial<ProfileState>, field: string, value: any) {
  if (field === 'name' && value) {
    candidate.name = value;
    extracted.name = value;
  } else if ((field === 'skill' || field === 'skills') && value) {
    if (Array.isArray(value)) {
      candidate.skills = value;
      candidate.skill = value[0]?.name || null;
      candidate.experience_years = value[0]?.experience_years ?? candidate.experience_years;
    } else if (typeof value === 'string') {
      candidate.skills = [{ name: value, type: 'primary', experience_years: candidate.experience_years ?? null }];
      candidate.skill = value;
    }
    extracted.skills = candidate.skills;
    extracted.skill = candidate.skill;
  } else if (field === 'experience_years' && value !== null && value !== undefined) {
    const expNum = Number(value);
    candidate.experience_years = expNum;
    if (candidate.skills && candidate.skills.length > 0) {
      candidate.skills[0].experience_years = expNum;
    }
    extracted.experience_years = expNum;
    extracted.skills = candidate.skills;
  } else if (field === 'location' && value) {
    candidate.location = value;
    extracted.location = value;
  }
}

function formatFieldLabel(field: string): string {
  if (field === 'experience_years') return 'experience';
  if (field === 'skills' || field === 'skill') return 'skills';
  return field;
}

function getFieldPrompt(field: string, prefix: string = ""): string {
  switch (field) {
    case 'name':
      return `${prefix}What is your full name?`;
    case 'skill':
    case 'skills':
      return `${prefix}What are your skills, crafts, or work?`;
    case 'experience_years':
      return `${prefix}How many years of experience do you have?`;
    case 'location':
      return `${prefix}Which city or locality in India do you live or work in?`;
    default:
      return `${prefix}What would you like to update?`;
  }
}

function formulateConfirmationQuestion(candidate: ProfileState, prefix: string = ""): string {
  const skills = candidate.skills && candidate.skills.length > 0
    ? candidate.skills
    : (candidate.skill ? [{ name: candidate.skill, experience_years: candidate.experience_years, type: 'primary' as const }] : []);

  let skillsSummary = "";
  if (skills.length === 1) {
    const expText = skills[0].experience_years === 0
      ? "you are starting out (0 years)"
      : `you have ${skills[0].experience_years ?? 0} years of experience`;
    skillsSummary = `your skill is ${skills[0].name} with ${expText}`;
  } else if (skills.length > 1) {
    const parts = skills.map(s => {
      const expStr = s.experience_years === 0
        ? "starting out (0 years)"
        : `${s.experience_years ?? 0} years of experience`;
      return `${s.name} with ${expStr}`;
    });
    if (parts.length === 2) {
      skillsSummary = `your skills are ${parts[0]}, and ${parts[1]}`;
    } else {
      const last = parts.pop();
      skillsSummary = `your skills are ${parts.join(', ')}, and ${last}`;
    }
  } else {
    skillsSummary = "your profile details are recorded";
  }

  return `${prefix}${candidate.name}, here is what I understood: ${skillsSummary}, and you are located in ${candidate.location || 'India'}. Is everything correct?`;
}

