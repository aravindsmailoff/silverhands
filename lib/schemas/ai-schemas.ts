import { z } from 'zod';

export const StructuredLocationSchema = z.object({
  locality: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  district: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  country: z.string().default('India'),
});

export const ProviderSkillSchema = z.object({
  name: z.string().min(1),
  experience_years: z.number().int().min(0).nullable().optional(),
});

export const ProviderExperienceSchema = z.object({
  title: z.string().min(1),
  years: z.number().int().min(0).nullable().optional(),
  skill_name: z.string().optional(),
});

export const ProviderProfileExtractionSchema = z.object({
  name: z.string().min(1).nullable().optional(),
  skills: z.array(ProviderSkillSchema).default([]),
  experience: z.array(ProviderExperienceSchema).default([]),
  location: StructuredLocationSchema.nullable().optional(),
  language: z.string().nullable().optional(),
  services: z.array(z.string()).default([]),
  availability: z.string().nullable().optional(),
});

export type ProviderProfileExtraction = z.infer<typeof ProviderProfileExtractionSchema>;

export const ConversationIntentSchema = z.enum([
  'confirm_yes',
  'confirm_no',
  'correct_previous',
  'add_information',
  'provide_information',
  'ask_question',
  'remove_information',
  'change_information',
  'unknown',
]);

export type ConversationIntent = z.infer<typeof ConversationIntentSchema>;

export const VoiceAgentDecisionSchema = z.object({
  intent: ConversationIntentSchema,
  extractedFields: ProviderProfileExtractionSchema.partial().default({}),
  corrections: z
    .array(
      z.object({
        field: z.string(),
        skill_name: z.string().optional(),
        old_value: z.unknown().optional(),
        new_value: z.unknown(),
      })
    )
    .default([]),
  missingFields: z
    .array(z.enum(['name', 'skills', 'experience', 'location', 'language', 'services', 'availability']))
    .default([]),
  nextAction: z.enum([
    'collect_information',
    'clarify',
    'confirm',
    'correct_previous_answer',
    'answer_user_question',
    'finish_onboarding',
  ]),
  response: z.string(),
});

export type VoiceAgentDecision = z.infer<typeof VoiceAgentDecisionSchema>;

/** Deterministic profile completion — LLM must NOT decide this alone. */
export function isProfileComplete(profile: Partial<ProviderProfileExtraction>): boolean {
  const hasName = Boolean(profile.name && profile.name.trim().length >= 2);
  const hasSkills = Array.isArray(profile.skills) && profile.skills.length > 0;
  const hasExperience =
    hasSkills &&
    profile.skills!.every(
      (s) => s.experience_years !== null && s.experience_years !== undefined && s.experience_years >= 0
    );
  const loc = profile.location;
  const hasLocation = Boolean(loc?.city && loc?.state);
  return hasName && hasSkills && hasExperience && hasLocation;
}

export function calculateMissingProfileFields(
  profile: Partial<ProviderProfileExtraction>
): Array<'name' | 'skills' | 'experience' | 'location' | 'language' | 'services' | 'availability'> {
  const missing: Array<'name' | 'skills' | 'experience' | 'location' | 'language' | 'services' | 'availability'> =
    [];
  if (!profile.name || profile.name.trim().length < 2) missing.push('name');
  if (!profile.skills || profile.skills.length === 0) missing.push('skills');
  else if (profile.skills.some((s) => s.experience_years === null || s.experience_years === undefined)) {
    missing.push('experience');
  }
  const loc = profile.location;
  if (!loc?.city || !loc?.state) missing.push('location');
  return missing;
}
