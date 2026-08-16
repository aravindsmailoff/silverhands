import { normalizeSkill, normalizeName, normalizeExperience, parseCorrectionIntent } from '../lib/semantic-extractor.ts';
import { validateAndParseLocation } from '../lib/location-validator.ts';

async function testVoiceAgentRoute() {
  console.log('========================================================');
  console.log('   CONVERSATIONAL STATE MACHINE & PHONETIC ASR SUITE');
  console.log('========================================================\n');

  let passed = 0;
  let total = 0;

  function assert(cond, testName) {
    total++;
    if (cond) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
    }
  }

  // 1. Phonetic ASR normalization
  console.log('--- 1. Testing Phonetic ASR Corrections ---');
  assert(normalizeSkill("Uh I like to play blackmitten").normalized === 'Badminton', '"blackmitten" -> "Badminton"');
  assert(normalizeSkill("I play black mitten").normalized === 'Badminton', '"black mitten" -> "Badminton"');
  assert(normalizeSkill("I play batminton").normalized === 'Badminton', '"batminton" -> "Badminton"');
  assert(normalizeSkill("I play shuttle").normalized === 'Badminton', '"shuttle" -> "Badminton"');
  assert(normalizeSkill("I do tayloring").normalized === 'Tailoring & Stitching', '"tayloring" -> "Tailoring & Stitching"');
  assert(normalizeSkill("I teach maths").normalized === 'Mathematics Teaching', '"maths" -> "Mathematics Teaching"');

  // 2. Correction intent parsing
  console.log('\n--- 2. Testing Correction Intent Parsing ---');
  const r1 = parseCorrectionIntent("No");
  assert(r1.intent === 'bare_rejection', 'Bare "No" parsed as bare_rejection');

  const r2 = parseCorrectionIntent("My skill");
  assert(r2.intent === 'field_targeted' && r2.targetField === 'skill', '"My skill" parsed as field_targeted (skill)');

  const r3 = parseCorrectionIntent("No, my experience is actually 5 years");
  assert(r3.intent === 'inline_correction' && r3.targetField === 'experience_years' && r3.extractedValue === 5, '"No, my experience is actually 5 years" inline correction (5)');

  const r4 = parseCorrectionIntent("No, I live in Coimbatore");
  assert(r4.intent === 'inline_correction' && r4.targetField === 'location' && r4.extractedValue?.includes('Coimbatore'), '"No, I live in Coimbatore" inline correction (Coimbatore)');

  const r5 = parseCorrectionIntent("No, my skill is tailoring");
  assert(r5.intent === 'inline_correction' && r5.targetField === 'skill' && r5.extractedValue?.includes('Tailoring'), '"No, my skill is tailoring" inline correction (Tailoring)');

  // 3. Multi-turn Simulation via HTTP API
  console.log('\n--- 3. Testing Multi-Turn State Machine via Local Route ---');
  try {
    let candidate = { name: null, skill: null, experience_years: null, location: null, language: null, services: [], availability: null };
    let state = 'ASKING_NAME';
    let question = "Welcome to SilverHands! What is your name?";

    // Turn 1: Name
    let res = await fetch('http://localhost:3000/api/ai/voice-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_state: state,
        current_question: question,
        candidate_profile: candidate,
        user_speech: "I think I'm Harish"
      })
    });
    let data = await res.json();
    assert(data.success && data.turn.updated_profile.name === 'Harish' && data.turn.conversation_state === 'ASKING_SKILL', 'Turn 1: Name "I think I\'m Harish" -> "Harish", State -> ASKING_SKILL');

    candidate = data.turn.updated_profile;
    state = data.turn.conversation_state;
    question = data.turn.next_question;

    // Turn 2: Skill with ASR mistake "black mitten"
    res = await fetch('http://localhost:3000/api/ai/voice-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_state: state,
        current_question: question,
        candidate_profile: candidate,
        user_speech: "Uh I like to play black mitten"
      })
    });
    data = await res.json();
    assert(data.success && data.turn.updated_profile.skill === 'Badminton' && data.turn.conversation_state === 'ASKING_EXPERIENCE', 'Turn 2: Skill "black mitten" -> "Badminton", State -> ASKING_EXPERIENCE');

    candidate = data.turn.updated_profile;
    state = data.turn.conversation_state;
    question = data.turn.next_question;

    // Turn 3: Experience "zero years"
    res = await fetch('http://localhost:3000/api/ai/voice-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_state: state,
        current_question: question,
        candidate_profile: candidate,
        user_speech: "zero years"
      })
    });
    data = await res.json();
    assert(data.success && data.turn.updated_profile.experience_years === 0 && data.turn.conversation_state === 'ASKING_LOCATION', 'Turn 3: Experience "zero years" -> 0, State -> ASKING_LOCATION');

    candidate = data.turn.updated_profile;
    state = data.turn.conversation_state;
    question = data.turn.next_question;

    // Turn 4: Location state-only "Tamil Nadu"
    res = await fetch('http://localhost:3000/api/ai/voice-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_state: state,
        current_question: question,
        candidate_profile: candidate,
        user_speech: "Tamil Nadu"
      })
    });
    data = await res.json();
    assert(data.success && data.turn.conversation_state === 'ASKING_LOCATION' && data.turn.next_question.includes('Tamil Nadu'), 'Turn 4: State-only "Tamil Nadu" requests city clarification, stays in ASKING_LOCATION');

    question = data.turn.next_question;

    // Turn 5: City locality "Mylapore, Chennai"
    res = await fetch('http://localhost:3000/api/ai/voice-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_state: state,
        current_question: question,
        candidate_profile: candidate,
        user_speech: "Mylapore, Chennai"
      })
    });
    data = await res.json();
    assert(data.success && data.turn.updated_profile.location?.includes('Chennai') && data.turn.conversation_state === 'CONFIRMING_PROFILE', 'Turn 5: "Mylapore, Chennai" -> location stored, State -> CONFIRMING_PROFILE');

    candidate = data.turn.updated_profile;
    state = data.turn.conversation_state;
    question = data.turn.next_question;

    // Turn 6: User says "No" (Conversational rejection)
    res = await fetch('http://localhost:3000/api/ai/voice-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_state: state,
        current_question: question,
        candidate_profile: candidate,
        user_speech: "No"
      })
    });
    data = await res.json();
    assert(data.success && data.turn.conversation_state === 'ASKING_CORRECTION' && data.turn.next_question.includes('What would you like to correct'), 'Turn 6: "No" during confirmation -> State: ASKING_CORRECTION ("What would you like to correct?")');

    state = data.turn.conversation_state;
    question = data.turn.next_question;

    // Turn 7: User says "My skill"
    res = await fetch('http://localhost:3000/api/ai/voice-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_state: state,
        current_question: question,
        candidate_profile: candidate,
        user_speech: "My skill"
      })
    });
    data = await res.json();
    assert(data.success && data.turn.conversation_state === 'CORRECTING_FIELD' && data.turn.target_field === 'skill', 'Turn 7: "My skill" -> State: CORRECTING_FIELD (target_field: skill)');

    state = data.turn.conversation_state;
    question = data.turn.next_question;
    const targetField = data.turn.target_field;

    // Turn 8: User speaks new skill "I teach mathematics"
    res = await fetch('http://localhost:3000/api/ai/voice-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_state: state,
        current_question: question,
        candidate_profile: candidate,
        user_speech: "I teach mathematics",
        target_field: targetField
      })
    });
    data = await res.json();
    assert(data.success && data.turn.updated_profile.skill === 'Mathematics Teaching' && data.turn.conversation_state === 'CONFIRMING_PROFILE', 'Turn 8: "I teach mathematics" -> updated skill "Mathematics Teaching", State -> CONFIRMING_PROFILE');

    candidate = data.turn.updated_profile;
    state = data.turn.conversation_state;
    question = data.turn.next_question;

    // Turn 9: User confirms "Yes, everything is correct"
    res = await fetch('http://localhost:3000/api/ai/voice-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_state: state,
        current_question: question,
        candidate_profile: candidate,
        user_speech: "Yes, everything is correct"
      })
    });
    data = await res.json();
    assert(data.success && data.turn.completed === true && data.turn.conversation_state === 'COMPLETED', 'Turn 9: "Yes, everything is correct" -> State: COMPLETED, completed: true');

  } catch (err) {
    console.error('HTTP Test Error:', err);
  }

  console.log(`\n========================================================`);
  console.log(`Summary: ${passed} / ${total} tests passed.`);
  console.log(`========================================================`);

  if (passed !== total) process.exit(1);
}

testVoiceAgentRoute();
