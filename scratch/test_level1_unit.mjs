import { resolveCanonicalSkill, isValidSkillEntity } from '../lib/skill-validator.ts';
import { classifyLocationIntent, validateAndParseLocation } from '../lib/location-validator.ts';
import { normalizeName, normalizeExperience } from '../lib/semantic-extractor.ts';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`✅ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${msg}`);
    failed++;
  }
}

console.log('========================================================');
console.log('   LEVEL 1 UNIT TESTS: REGISTRY & SEMANTIC VALIDATORS   ');
console.log('========================================================\n');

// 1. Skill Resolution & ASR Phonetic Correction
console.log('--- 1. Testing Skill Resolution & Phonetics ---');
assert(resolveCanonicalSkill('badminton').normalized === 'Badminton Coaching', "resolveCanonicalSkill('badminton') = 'Badminton Coaching'");
assert(resolveCanonicalSkill('back middle').normalized === 'Badminton Coaching', "Phonetic ASR 'back middle' -> 'Badminton Coaching'");
assert(resolveCanonicalSkill('black mitten').normalized === 'Badminton Coaching', "Phonetic ASR 'black mitten' -> 'Badminton Coaching'");
assert(resolveCanonicalSkill('taylor').normalized === 'Tailoring & Stitching', "Phonetic ASR 'taylor' -> 'Tailoring & Stitching'");
assert(resolveCanonicalSkill('cooking').normalized === 'Traditional Cooking', "resolveCanonicalSkill('cooking') = 'Traditional Cooking'");
assert(resolveCanonicalSkill('painting').normalized === 'Painting & Fine Arts', "resolveCanonicalSkill('painting') = 'Painting & Fine Arts'");
assert(resolveCanonicalSkill('maths').normalized === 'Mathematics Teaching', "resolveCanonicalSkill('maths') = 'Mathematics Teaching'");

// 2. Forbidden Tokens & Garbage Rejection
console.log('\n--- 2. Testing Skill Token Rejection ---');
assert(!isValidSkillEntity('i think'), "Rejects 'i think'");
assert(!isValidSkillEntity('i think i'), "Rejects 'i think i'");
assert(resolveCanonicalSkill('i think i').normalized === null, "resolveCanonicalSkill('i think i') = null");
assert(resolveCanonicalSkill('yes').normalized === null, "resolveCanonicalSkill('yes') = null");
assert(resolveCanonicalSkill('everything is correct').normalized === null, "resolveCanonicalSkill('everything is correct') = null");
assert(resolveCanonicalSkill('20 years of experience').normalized === null, "resolveCanonicalSkill('20 years of experience') = null");
assert(resolveCanonicalSkill('zero').normalized === null, "resolveCanonicalSkill('zero') = null");

// 3. Location Intent Classification
console.log('\n--- 3. Testing Global Location Classification ---');
assert(classifyLocationIntent('Mars').intent === 'non_geographic', "Mars classified as 'non_geographic'");
assert(classifyLocationIntent('Moon').intent === 'non_geographic', "Moon classified as 'non_geographic'");
assert(classifyLocationIntent('Coronado').intent === 'foreign_location', "Coronado classified as 'foreign_location'");
assert(classifyLocationIntent('London').intent === 'foreign_location', "London classified as 'foreign_location'");
assert(classifyLocationIntent('New York').intent === 'foreign_location', "New York classified as 'foreign_location'");
assert(classifyLocationIntent('Tamil Nadu').intent === 'indian_state_only', "Tamil Nadu classified as 'indian_state_only'");
assert(classifyLocationIntent('Karnataka').intent === 'indian_state_only', "Karnataka classified as 'indian_state_only'");
assert(classifyLocationIntent('Chennai').intent === 'valid_indian_location', "Chennai classified as 'valid_indian_location'");
assert(classifyLocationIntent('Mylapore').intent === 'valid_indian_location', "Mylapore classified as 'valid_indian_location'");
assert(classifyLocationIntent('Bengaluru').intent === 'valid_indian_location', "Bengaluru classified as 'valid_indian_location'");

// 4. Location Geocoding & Clarifications
console.log('\n--- 4. Testing Location Geocoding & Guardrails ---');
const marsLoc = validateAndParseLocation('Mars');
assert(marsLoc.needs_clarification === true, "Mars needs clarification (REJECTED from DB)");
assert(marsLoc.formatted_address === '', "Mars formatted address is empty");
assert(marsLoc.clarification_question.includes("couldn't identify Mars as a city or locality in India"), "Mars generates natural Indian location pivot");

const coronadoLoc = validateAndParseLocation('Coronado');
assert(coronadoLoc.needs_clarification === true, "Coronado needs clarification (REJECTED from DB)");
assert(coronadoLoc.clarification_question.includes("couldn't identify Coronado as a city or locality in India"), "Coronado generates foreign location explanation");

const tnLoc = validateAndParseLocation('Tamil Nadu');
assert(tnLoc.is_state_only === true, "Tamil Nadu is state only");
assert(tnLoc.needs_clarification === true, "State only requires city clarification");
assert(tnLoc.clarification_question.includes('Tamil Nadu is a state. Which city or locality in Tamil Nadu are you from?'), "State asks for specific city");

const mylaporeLoc = validateAndParseLocation('Mylapore');
assert(mylaporeLoc.city === 'Chennai', "Mylapore resolves to city Chennai");
assert(mylaporeLoc.state === 'Tamil Nadu', "Mylapore resolves to state Tamil Nadu");
assert(mylaporeLoc.formatted_address === 'Mylapore, Chennai, Tamil Nadu', "Mylapore address = 'Mylapore, Chennai, Tamil Nadu'");

// 5. Name Validation
console.log('\n--- 5. Testing Name Extraction Isolation ---');
assert(normalizeName('Haresh Bharatwatch').name === 'Haresh Bharatwatch', "normalizeName('Haresh Bharatwatch') = 'Haresh Bharatwatch'");
assert(normalizeName('I think I am Harish').name === 'Harish', "normalizeName('I think I am Harish') = 'Harish'");
assert(normalizeName('I like to do cooking and cleaning').name === null, "normalizeName rejects activity sentence");
assert(normalizeName('Back Middle').name === null, "normalizeName rejects 'Back Middle'");

console.log('\n========================================================');
console.log(`LEVEL 1 SUMMARY: ${passed + failed} tests | PASSED: ${passed} | FAILED: ${failed}`);
console.log('========================================================\n');

if (failed > 0) process.exit(1);
