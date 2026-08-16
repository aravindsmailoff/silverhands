import { normalizeName, normalizeSkill, normalizeExperience, isConfirmationResponse } from '../lib/semantic-extractor.ts';
import { validateAndParseLocation } from '../lib/location-validator.ts';

console.log('=== TEST SUITE: SILVERHANDS VOICE SEMANTIC EXTRACTION & LOCATION VALIDATION ===\n');

// --- 1. SKILL EXTRACTION TESTS ---
console.log('--- 1. SKILL NORMALIZATION TESTS ---');
const skillTests = [
  { input: "I'm good at playing badminton", expected: "Badminton" },
  { input: "Uh I like to play badminton", expected: "Badminton" },
  { input: "My skill is badminton", expected: "Badminton" },
  { input: "I make traditional pottery", expected: ["Pottery", "Traditional Pottery"] },
  { input: "I know tailoring and blouse stitching", expected: "Tailoring / Blouse Stitching" },
  { input: "I cook South Indian food", expected: "South Indian Cooking" },
  { input: "I teach mathematics", expected: "Mathematics Teaching" },
  { input: "Uh I make clothes and stitch blouses", expected: "Tailoring / Blouse Stitching" },
  { input: "I teach kids maths", expected: "Mathematics Teaching" }
];

for (const t of skillTests) {
  const res = normalizeSkill(t.input);
  const pass = Array.isArray(t.expected) ? t.expected.includes(res.normalized) : res.normalized === t.expected;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] Input: "${t.input}" => "${res.normalized}" (expected: ${JSON.stringify(t.expected)})`);
  if (!pass) process.exitCode = 1;
}

// --- 2. EXPERIENCE EXTRACTION TESTS ---
console.log('\n--- 2. EXPERIENCE NORMALIZATION TESTS ---');
const expTests = [
  { input: "0 years", expected: 0 },
  { input: "None.", expected: 0 },
  { input: "zero", expected: 0 },
  { input: "no experience", expected: 0 },
  { input: "I've been doing this for about fifteen years.", expected: 15 },
  { input: "30 years", expected: 30 },
  { input: "about 5 years", expected: 5 },
  { input: "twenty years", expected: 20 }
];

for (const t of expTests) {
  const res = normalizeExperience(t.input);
  const pass = res.experience_years === t.expected;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] Input: "${t.input}" => ${res.experience_years} (expected: ${t.expected})`);
  if (!pass) process.exitCode = 1;
}

// --- 3. LOCATION VALIDATION TESTS ---
console.log('\n--- 3. LOCATION VALIDATION TESTS ---');
const locTests = [
  {
    input: "Tamil Nadu",
    check: (res) => res.is_state_only === true && res.state === "Tamil Nadu" && res.city === null && res.needs_clarification === true,
    desc: "State only (Tamil Nadu) triggers clarification question"
  },
  {
    input: "Chennai",
    check: (res) => res.city === "Chennai" && res.state === "Tamil Nadu" && res.needs_clarification === false,
    desc: "City (Chennai) properly associates with Tamil Nadu"
  },
  {
    input: "Mylapore Chennai",
    check: (res) => res.locality === "Mylapore" && res.city === "Chennai" && res.state === "Tamil Nadu",
    desc: "Locality + City (Mylapore, Chennai) parsed without ambiguity"
  },
  {
    input: "I'm from Coimbatore in Tamil Nadu",
    check: (res) => res.city === "Coimbatore" && res.state === "Tamil Nadu",
    desc: "City + State (Coimbatore in Tamil Nadu) parsed cleanly"
  },
  {
    input: "Near Chennai",
    check: (res) => res.city === "Chennai" && res.locality === null,
    desc: "Ambiguous (Near Chennai) uses city without pretending exact locality"
  },
  {
    input: "I don't want to say.",
    check: (res) => res.city === null && res.state === null,
    desc: "Refusal / Unknown leaves location null"
  }
];

for (const t of locTests) {
  const res = validateAndParseLocation(t.input);
  const pass = t.check(res);
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${t.desc}: Input: "${t.input}" => City: ${res.city}, State: ${res.state}, Clarification: ${res.needs_clarification}`);
  if (!pass) process.exitCode = 1;
}

console.log('\n=== ALL TESTS COMPLETED ===');
