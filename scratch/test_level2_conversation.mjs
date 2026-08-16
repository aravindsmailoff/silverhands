import { manageConversationTurn, isProfileComplete } from '../lib/conversation-manager.ts';

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

async function runScenario() {
  console.log('========================================================');
  console.log('   LEVEL 2 CONVERSATIONAL SIMULATION & INTENT GATING    ');
  console.log('========================================================\n');

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

  // Turn 1: User introduces name
  console.log('Turn 1: User says: "My name is Harish"');
  let t1 = await manageConversationTurn('My name is Harish', profile, [], 'What is your name?');
  profile = t1.updatedProfile;
  assert(profile.name === 'Harish', "Turn 1: Profile Name is Harish");
  assert(profile.skills.length === 0, "Turn 1: Skills is empty");
  assert(profile.location === null, "Turn 1: Location is null");

  // Turn 2: User gives multiple skills
  console.log('\nTurn 2: User says: "I do cooking and painting. Actually I also teach mathematics."');
  let t2 = await manageConversationTurn('I do cooking and painting. Actually I also teach mathematics.', profile, [], 'What skills or crafts do you practice?');
  profile = t2.updatedProfile;
  assert(profile.skills.length === 3, "Turn 2: Extracted 3 skills");
  assert(profile.skills[0].name === 'Traditional Cooking', "Turn 2: Skill 1 is Traditional Cooking");
  assert(profile.skills[1].name === 'Painting & Fine Arts', "Turn 2: Skill 2 is Painting & Fine Arts");
  assert(profile.skills[2].name === 'Mathematics Teaching', "Turn 2: Skill 3 is Mathematics Teaching");
  assert(profile.skills.every(s => s.experience_years === null), "Turn 2: All 3 skills have pending experience");

  // Turn 3: User provides experience numbers for all 3 skills
  console.log('\nTurn 3: User says: "Cooking 12 years, painting about 5, maths maybe 2."');
  let t3 = await manageConversationTurn('Cooking 12 years, painting about 5, maths maybe 2.', profile, [], 'How many years of experience do you have in each?');
  profile = t3.updatedProfile;
  assert(profile.skills[0].experience_years === 12, "Turn 3: Cooking has 12 years");
  assert(profile.skills[1].experience_years === 5, "Turn 3: Painting has 5 years");
  assert(profile.skills[2].experience_years === 2, "Turn 3: Maths has 2 years");

  // Turn 4: User performs a targeted inline correction on painting
  console.log('\nTurn 4: User says: "Actually, make that 7 years for painting."');
  let t4 = await manageConversationTurn('Actually, make that 7 years for painting.', profile, [], 'Is your profile correct?');
  profile = t4.updatedProfile;
  assert(profile.skills[1].experience_years === 7, "Turn 4: Targeted correction updated Painting to 7 years");
  assert(profile.skills[0].experience_years === 12, "Turn 4: Cooking remains 12 years");
  assert(profile.skills[2].experience_years === 2, "Turn 4: Maths remains 2 years");

  // Turn 5: User tries to provide a celestial/non-geographic location
  console.log('\nTurn 5: User says: "I live in Mars."');
  let t5 = await manageConversationTurn('I live in Mars.', profile, [], 'Which city or locality in India do you live or work in?');
  profile = t5.updatedProfile;
  assert(profile.location === null, "Turn 5: Mars is REJECTED (Location is still null)");
  assert(t5.action.assistant_response.includes("couldn't identify Mars as a city or locality in India"), "Turn 5: System explains Mars is not in India");

  // Turn 6: User tries to provide a foreign location
  console.log('\nTurn 6: User says: "I live in Coronado."');
  let t6 = await manageConversationTurn('I live in Coronado.', profile, [], 'Which city or locality in India do you live or work in?');
  profile = t6.updatedProfile;
  assert(profile.location === null, "Turn 6: Coronado is REJECTED (Location is still null)");
  assert(t6.action.assistant_response.includes("couldn't identify Coronado as a city or locality in India"), "Turn 6: System explains Coronado is international");

  // Turn 7: User provides Indian state only
  console.log('\nTurn 7: User says: "I am from Tamil Nadu."');
  let t7 = await manageConversationTurn('I am from Tamil Nadu.', profile, [], 'Which city or locality in India do you live or work in?');
  profile = t7.updatedProfile;
  assert(profile.location === null, "Turn 7: State-only is NOT saved as a city");
  assert(t7.action.assistant_response.includes("Tamil Nadu is a state. Which city or locality in Tamil Nadu are you from?"), "Turn 7: System asks for specific city in Tamil Nadu");

  // Turn 8: User provides valid Indian city
  console.log('\nTurn 8: User says: "Sorry, I meant Chennai."');
  let t8 = await manageConversationTurn('Sorry, I meant Chennai.', profile, [], 'Which city in Tamil Nadu are you from?');
  profile = t8.updatedProfile;
  assert(profile.location === 'Chennai, Tamil Nadu', "Turn 8: Location resolved to 'Chennai, Tamil Nadu'");
  assert(isProfileComplete(profile) === true, "Turn 8: isProfileComplete is TRUE");
  assert(t8.action.next_action === 'confirm', "Turn 8: System triggers confirmation");

  // Turn 9: User confirms with "Yes, everything is correct"
  console.log('\nTurn 9: User says: "Yes, everything is correct."');
  let t9 = await manageConversationTurn('Yes, everything is correct.', profile, [], 'Is everything correct?');
  assert(t9.action.completed === true, "Turn 9: completed = true");
  assert(t9.action.next_action === 'finish_onboarding', "Turn 9: next_action = finish_onboarding");
  assert(t9.updatedProfile.skills.length === 3, "Turn 9: Exactly 3 skills preserved (NO 'Yes' or 'Everything is correct' skills)");

  console.log('\n========================================================');
  console.log(`LEVEL 2 SUMMARY: ${passed + failed} turns | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

runScenario().catch(err => {
  console.error(err);
  process.exit(1);
});
