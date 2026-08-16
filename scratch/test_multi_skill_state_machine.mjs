import assert from 'assert';
import { normalizeSkillsList, normalizeName } from '../lib/semantic-extractor.ts';

const BASE_URL = 'http://localhost:3000/api/ai/voice-agent';

async function runTests() {
  console.log('========================================================');
  console.log('   MULTI-SKILL & EXPERIENCE QUEUE TEST SUITE            ');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ [FAIL] ${name}`);
      console.error('  ', e.message);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`❌ [FAIL] ${name}`);
      console.error('  ', e.message);
      failed++;
    }
  }

  console.log('--- 1. Testing Multi-Skill Entity Extraction ---');

  test('"I do tailoring and I also teach mathematics"', () => {
    const res = normalizeSkillsList("I do tailoring and I also teach mathematics");
    assert.strictEqual(res.length, 2);
    assert.ok(res.some(s => s.name.includes('Tailoring')));
    assert.ok(res.some(s => s.name.includes('Mathematics')));
  });

  test('"I know tailoring, embroidery and blouse stitching"', () => {
    const res = normalizeSkillsList("I know tailoring, embroidery and blouse stitching");
    assert.ok(res.length >= 2);
    assert.ok(res.some(s => s.name.includes('Tailoring')));
    assert.ok(res.some(s => s.name.includes('Embroidery')));
  });

  test('"I teach maths and English"', () => {
    const res = normalizeSkillsList("I teach maths and English");
    assert.strictEqual(res.length, 2);
    assert.ok(res.some(s => s.name.includes('Mathematics')));
    assert.ok(res.some(s => s.name.includes('English')));
  });

  test('"I make pottery and also paint"', () => {
    const res = normalizeSkillsList("I make pottery and also paint");
    assert.strictEqual(res.length, 2);
    assert.ok(res.some(s => s.name.includes('Pottery')));
    assert.ok(res.some(s => s.name.includes('Painting')));
  });

  test('"I play badminton and I coach children"', () => {
    const res = normalizeSkillsList("I play badminton and I coach children");
    assert.strictEqual(res.length, 2);
    assert.ok(res.some(s => s.name === 'Badminton'));
    assert.ok(res.some(s => s.name.includes('Coaching')));
  });

  console.log('\n--- 2. Testing Upfront Experience Extraction ---');

  test('"I\'ve been doing tailoring for 10 years and teaching maths for 4 years"', () => {
    const res = normalizeSkillsList("I've been doing tailoring for 10 years and teaching maths for 4 years");
    assert.strictEqual(res.length, 2);
    const tailoring = res.find(s => s.name.includes('Tailoring'));
    const maths = res.find(s => s.name.includes('Mathematics'));
    assert.strictEqual(tailoring.experience_years, 10);
    assert.strictEqual(maths.experience_years, 4);
  });

  test('"I\'ve been tailoring for 10 years, embroidery for 6, and I just started teaching maths"', () => {
    const res = normalizeSkillsList("I've been tailoring for 10 years, embroidery for 6, and I just started teaching maths");
    assert.strictEqual(res.length, 3);
    const tailoring = res.find(s => s.name.includes('Tailoring'));
    const embroidery = res.find(s => s.name.includes('Embroidery'));
    const maths = res.find(s => s.name.includes('Mathematics'));
    assert.strictEqual(tailoring.experience_years, 10);
    assert.strictEqual(embroidery.experience_years, 6);
    assert.strictEqual(maths.experience_years, 0);
  });

  test('"I mainly do tailoring, but I also do embroidery"', () => {
    const res = normalizeSkillsList("I mainly do tailoring, but I also do embroidery");
    assert.strictEqual(res.length, 2);
    const tailoring = res.find(s => s.name.includes('Tailoring'));
    const embroidery = res.find(s => s.name.includes('Embroidery'));
    assert.strictEqual(tailoring.type, 'primary');
    assert.strictEqual(embroidery.type, 'additional');
  });

  console.log('\n--- 3. Testing Multi-Turn Question Queue Lifecycle via API Route ---');

  let profile = {
    name: null,
    skills: [],
    skill: null,
    experience_years: null,
    location: null
  };
  let currentState = 'ASKING_NAME';
  let activeIndex = 0;

  async function sendTurn(speech) {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_state: currentState,
        candidate_profile: profile,
        user_speech: speech,
        active_skill_index: activeIndex
      })
    });
    const data = await res.json();
    if (!data.success || !data.turn) {
      throw new Error(data.error || 'Turn request failed');
    }
    profile = data.turn.updated_profile;
    currentState = data.turn.conversation_state;
    activeIndex = data.turn.active_skill_index ?? 0;
    return data.turn;
  }

  await asyncTest('Turn 1: Name "My name is Harish" -> ASKING_SKILL', async () => {
    const turn = await sendTurn("My name is Harish");
    assert.strictEqual(profile.name, "Harish");
    assert.strictEqual(currentState, "ASKING_SKILL");
  });

  await asyncTest('Turn 2: Multi-skills "I do tailoring and I also teach mathematics" -> ASKING_EXPERIENCE (Queue item 1)', async () => {
    const turn = await sendTurn("I do tailoring and I also teach mathematics");
    assert.strictEqual(profile.skills.length, 2);
    assert.strictEqual(currentState, "ASKING_EXPERIENCE");
    assert.strictEqual(activeIndex, 0);
    assert.ok(turn.next_question.includes('Tailoring'));
    assert.ok(turn.next_question.includes('2 skills') || turn.next_question.includes('Tailoring and Mathematics'));
  });

  await asyncTest('Turn 3: Experience 1 "8 years" -> ASKING_EXPERIENCE (Queue item 2: Mathematics)', async () => {
    const turn = await sendTurn("8 years");
    assert.strictEqual(profile.skills[0].experience_years, 8);
    assert.strictEqual(currentState, "ASKING_EXPERIENCE");
    assert.strictEqual(activeIndex, 1);
    assert.ok(turn.next_question.includes('Mathematics Teaching'));
  });

  await asyncTest('Turn 4: Experience 2 "3 years" -> ASKING_LOCATION (All skills resolved)', async () => {
    const turn = await sendTurn("3 years");
    assert.strictEqual(profile.skills[1].experience_years, 3);
    assert.strictEqual(currentState, "ASKING_LOCATION");
    assert.ok(turn.next_question.includes('city') || turn.next_question.includes('locality'));
  });

  await asyncTest('Turn 5: Location "Mylapore, Chennai" -> CONFIRMING_PROFILE (Includes both skills)', async () => {
    const turn = await sendTurn("Mylapore, Chennai");
    assert.ok(profile.location.includes('Chennai'));
    assert.strictEqual(currentState, "CONFIRMING_PROFILE");
    assert.ok(turn.next_question.includes('Tailoring & Stitching with 8 years'));
    assert.ok(turn.next_question.includes('Mathematics Teaching with 3 years'));
    assert.ok(turn.next_question.includes('Chennai'));
  });

  await asyncTest('Turn 6: Confirmation "Yes, everything is correct" -> COMPLETED', async () => {
    const turn = await sendTurn("Yes, everything is correct");
    assert.strictEqual(currentState, "COMPLETED");
    assert.strictEqual(turn.completed, true);
  });

  console.log('\n--- 4. Testing Upfront Experience Auto-Skip via API Route ---');

  profile = { name: null, skills: [], skill: null, experience_years: null, location: null };
  currentState = 'ASKING_NAME';
  activeIndex = 0;

  await asyncTest('Upfront Turn 1: Name "Sita Devi"', async () => {
    await sendTurn("Sita Devi");
    assert.strictEqual(profile.name, "Sita Devi");
    assert.strictEqual(currentState, "ASKING_SKILL");
  });

  await asyncTest('Upfront Turn 2: "I\'ve been doing tailoring for 10 years and teaching maths for 4 years" -> Skips experience directly to ASKING_LOCATION', async () => {
    const turn = await sendTurn("I've been doing tailoring for 10 years and teaching maths for 4 years");
    assert.strictEqual(profile.skills.length, 2);
    assert.strictEqual(profile.skills[0].experience_years, 10);
    assert.strictEqual(profile.skills[1].experience_years, 4);
    assert.strictEqual(currentState, "ASKING_LOCATION");
    assert.ok(turn.next_question.includes('recorded your experience'));
  });

  console.log('\n========================================================');
  console.log(`Summary: ${passed} / ${passed + failed} tests passed.`);
  console.log('========================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
