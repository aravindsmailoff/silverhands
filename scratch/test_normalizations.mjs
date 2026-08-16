import { normalizeName, normalizeSkill, normalizeExperience } from '../lib/semantic-extractor.ts';
import { validateAndParseLocation } from '../lib/location-validator.ts';

function runTests() {
  let passed = 0;
  let total = 0;

  function assert(condition, name) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name}`);
    }
  }

  console.log('--- Testing Conversational Name Normalization ---');
  assert(normalizeName("I think I'm Harish").name === 'Harish', 'Normalize "I think I\'m Harish" -> "Harish"');
  assert(normalizeName("I think my name is Harish").name === 'Harish', 'Normalize "I think my name is Harish" -> "Harish"');
  assert(normalizeName("My name is Harish").name === 'Harish', 'Normalize "My name is Harish" -> "Harish"');
  assert(normalizeName("You can call me Lakshmi Amma").name === 'Lakshmi Amma', 'Normalize "You can call me Lakshmi Amma" -> "Lakshmi Amma"');
  assert(normalizeName("Myself Harish").name === 'Harish', 'Normalize "Myself Harish" -> "Harish"');
  assert(normalizeName("Harish here").name === 'Harish', 'Normalize "Harish here" -> "Harish"');
  assert(normalizeName("I am Harish").name === 'Harish', 'Normalize "I am Harish" -> "Harish"');

  console.log('\n--- Testing Skill Normalization ---');
  assert(normalizeSkill("I'm good at playing badminton").normalized === 'Badminton', 'Normalize "I\'m good at playing badminton" -> "Badminton"');
  assert(normalizeSkill("I make traditional pottery").normalized === 'Pottery' || normalizeSkill("I make traditional pottery").normalized === 'Traditional Pottery', 'Normalize "I make traditional pottery" -> "Pottery" / "Traditional Pottery"');
  assert(normalizeSkill("I know tailoring").normalized === 'Tailoring & Stitching' || normalizeSkill("I know tailoring").normalized === 'Tailoring / Blouse Stitching', 'Normalize "I know tailoring" -> "Tailoring & Stitching"');
  assert(normalizeSkill("I teach mathematics").normalized === 'Mathematics Teaching', 'Normalize "I teach mathematics" -> "Mathematics Teaching"');

  console.log('\n--- Testing Experience Normalization ---');
  assert(normalizeExperience("0 years").experience_years === 0, 'Normalize "0 years" -> 0');
  assert(normalizeExperience("none").experience_years === 0, 'Normalize "none" -> 0');
  assert(normalizeExperience("zero").experience_years === 0, 'Normalize "zero" -> 0');
  assert(normalizeExperience("I have 5 years experience").experience_years === 5, 'Normalize "5 years experience" -> 5');
  assert(normalizeExperience("around 15 years").experience_years === 15, 'Normalize "around 15 years" -> 15');

  console.log('\n--- Testing Location Validation ---');
  const tn = validateAndParseLocation("Tamil Nadu");
  assert(tn.is_state_only === true && tn.state === 'Tamil Nadu' && tn.city === null, 'Classify "Tamil Nadu" as state-only');

  const chennai = validateAndParseLocation("Mylapore, Chennai");
  assert(chennai.city === 'Chennai' && chennai.locality === 'Mylapore' && chennai.state === 'Tamil Nadu', 'Parse "Mylapore, Chennai"');

  console.log(`\n========================================`);
  console.log(`Summary: ${passed} / ${total} tests passed.`);
  console.log(`========================================`);

  if (passed !== total) process.exit(1);
}

runTests();
