import { manageConversationTurn, classifyIntent, isProfileComplete, calculateMissingFields } from '../lib/conversation-manager.ts';
import { normalizeName, normalizeSkill, normalizeSkillsList, normalizeExperience } from '../lib/semantic-extractor.ts';
import { validateAndParseLocation } from '../lib/location-validator.ts';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runSuite() {
  console.log('========================================================');
  console.log('   COMPLETE OFFLINE JARVIS TORTURE & REGRESSION SUITE   ');
  console.log('========================================================\n');

  // --- 1. Test Name Extraction Isolation ---
  console.log('--- 1. Testing Name Extraction Isolation ---');
  assert(normalizeName('Harish').name === 'Harish', "normalizeName('Harish') = 'Harish'");
  assert(normalizeName('My name is Harish Kumar').name === 'Harish Kumar', "normalizeName('My name is Harish Kumar') = 'Harish Kumar'");
  assert(normalizeName('I like to do cooking and cleaning').name === null, "normalizeName('I like to do cooking and cleaning') = null (REJECTED)");
  assert(normalizeName('Traditional cooking and cleaning').name === null, "normalizeName('Traditional cooking and cleaning') = null (REJECTED)");
  assert(normalizeName('0 years experience').name === null, "normalizeName('0 years experience') = null (REJECTED)");

  // --- 2. Test Skill Extraction Isolation ---
  console.log('\n--- 2. Testing Skill Extraction Isolation ---');
  const cookingNorm = normalizeSkill('cooking').normalized;
  assert(cookingNorm === 'Traditional Cooking', "normalizeSkill('cooking') = 'Traditional Cooking'");
  const cleaningNorm = normalizeSkill('cleaning').normalized;
  assert(cleaningNorm === 'Cleaning & Housekeeping', "normalizeSkill('cleaning') = 'Cleaning & Housekeeping'");
  assert(normalizeSkill('i have of experience').normalized === null, "normalizeSkill('i have of experience') = null (REJECTED)");
  assert(normalizeSkill('20 years of experience').normalized === null, "normalizeSkill('20 years of experience') = null (REJECTED)");
  assert(normalizeSkill('zero years').normalized === null, "normalizeSkill('zero years') = null (REJECTED)");

  // --- 3. Test Location Isolation ---
  console.log('\n--- 3. Testing Location Isolation ---');
  assert(validateAndParseLocation('Chennai').city === 'Chennai', "validateAndParseLocation('Chennai') = 'Chennai'");
  assert(validateAndParseLocation('Mylapore, Chennai').locality === 'Mylapore', "validateAndParseLocation('Mylapore, Chennai') = 'Mylapore'");
  assert(validateAndParseLocation('0').needs_clarification === true, "validateAndParseLocation('0') rejects number");
  assert(validateAndParseLocation('zero').needs_clarification === true, "validateAndParseLocation('zero') rejects 'zero'");
  assert(validateAndParseLocation('cooking and cleaning').needs_clarification === true, "validateAndParseLocation('cooking and cleaning') rejects verbs");

  // --- 4. Test Multi-Turn Conversation Simulation ---
  console.log('\n--- 4. Testing End-to-End Conversational Turns ---');
  
  // Turn 1: User gives Name
  let profile = {
    name: null,
    skills: [],
    skill: null,
    experience_years: null,
    location: null,
    language: null,
    services: [],
    availability: null
  };

  let res1 = await manageConversationTurn('My name is Harish', profile, [], 'What is your name?');
  profile = res1.updatedProfile;
  assert(profile.name === 'Harish', "Turn 1: Name is Harish");
  assert(profile.skills.length === 0, "Turn 1: Skills is empty");
  assert(profile.location === null, "Turn 1: Location is null");
  assert(!res1.action.completed, "Turn 1: Profile is not complete");

  // Turn 2: User gives multiple skills with one experience
  let res2 = await manageConversationTurn('I like to do cooking and cleaning, 0 years', profile, [], 'What skills or crafts do you practice?');
  profile = res2.updatedProfile;
  assert(profile.name === 'Harish', "Turn 2: Name is STILL Harish (not overwritten by 'cooking and cleaning')");
  assert(profile.skills.length === 2, "Turn 2: Exactly 2 skills extracted");
  assert(profile.skills[0].name === 'Traditional Cooking', "Turn 2: Skill 1 is Traditional Cooking");
  assert(profile.skills[1].name === 'Cleaning & Housekeeping', "Turn 2: Skill 2 is Cleaning & Housekeeping");
  assert(profile.skills[1].experience_years === 0, "Turn 2: Attached experience for cleaning is 0");
  assert(profile.location === null, "Turn 2: Location is STILL null (not set to 'Zero')");
  assert(!res2.action.completed, "Turn 2: Profile is NOT complete (experience missing for cooking)");

  // Turn 3: User answers cooking experience
  let res3 = await manageConversationTurn('I have 20 years of experience in cooking', profile, [], 'How many years of experience do you have in Traditional Cooking?');
  profile = res3.updatedProfile;
  assert(profile.skills[0].experience_years === 20, "Turn 3: Traditional Cooking experience updated to 20");
  assert(profile.skills.length === 2, "Turn 3: No ghost 'I Have Of Experience' skill created");
  assert(profile.location === null, "Turn 3: Location is STILL null");

  // Turn 4: User gives location
  let res4 = await manageConversationTurn('I live in Bangalore', profile, [], 'Which city are you located in?');
  profile = res4.updatedProfile;
  assert(profile.location.includes('Bengaluru'), "Turn 4: Location is Bengaluru");
  assert(isProfileComplete(profile) === true, "Turn 4: isProfileComplete is TRUE");
  assert(res4.action.next_action === 'confirm', "Turn 4: Next action is 'confirm'");

  // Turn 5: User confirms profile with "Yes, everything is correct"
  let res5 = await manageConversationTurn('Yes, everything is correct', profile, [], 'Is everything correct?');
  assert(res5.action.completed === true, "Turn 5: Confirmation completed = true");
  assert(res5.action.next_action === 'finish_onboarding', "Turn 5: Next action = finish_onboarding");
  assert(res5.updatedProfile.skills.length === 2, "Turn 5: Skills count is still 2 (NO 'Yes' or 'Everything is correct' skills)");

  // --- 5. Test Question & Mid-Turn Correction ---
  console.log('\n--- 5. Testing Question Handling & Correction ---');
  let qRes = await manageConversationTurn('Can I teach people online?', profile, [], 'What is your name?');
  assert(qRes.action.intent === 'ask_question', "Question recognized as ask_question");
  assert(!qRes.action.completed, "Question does not complete profile");

  let corrRes = await manageConversationTurn('Actually, my cooking experience is 15 years', profile, [], 'Is everything correct?');
  assert(corrRes.updatedProfile.skills[0].experience_years === 15, "Targeted correction updated cooking experience to 15");

  console.log('\n========================================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error(err);
  process.exit(1);
});
