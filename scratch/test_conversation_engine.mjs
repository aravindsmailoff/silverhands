// 100% Offline Deterministic Conversation Engine Torture Test Suite
import assert from 'assert';
import { 
  manageConversationTurn, 
  classifyIntent, 
  isProfileComplete, 
  calculateMissingFields 
} from '../lib/conversation-manager.ts';

async function runTortureTestSuite() {
  console.log('========================================================');
  console.log('   OFFLINE DETERMINISTIC CONVERSATION TORTURE SUITE     ');
  console.log('========================================================\n');

  let passed = 0;
  let total = 0;

  function check(desc, cond) {
    total++;
    if (cond) {
      console.log(`✅ [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${desc}`);
      throw new Error(`Test failed: ${desc}`);
    }
  }

  // --- 1. Test Intent Classification Gates ---
  console.log('--- 1. Testing Intent Classification Gates ---');
  check("Intent 'confirm_yes' for 'Yes'", classifyIntent("Yes") === 'confirm_yes');
  check("Intent 'confirm_yes' for 'Everything is correct'", classifyIntent("Everything is correct") === 'confirm_yes');
  check("Intent 'confirm_yes' for 'Yes, that is right'", classifyIntent("Yes, that is right") === 'confirm_yes');
  check("Intent 'confirm_no' for 'No'", classifyIntent("No") === 'confirm_no');
  check("Intent 'confirm_no' for 'No, that is wrong'", classifyIntent("No, that is wrong") === 'correct_previous');
  check("Intent 'correct_previous' for 'Actually, it is 4 years'", classifyIntent("Actually, it is 4 years") === 'correct_previous');
  check("Intent 'ask_question' for 'Can I teach people online?'", classifyIntent("Can I teach people online?") === 'ask_question');
  check("Intent 'add_information' for 'I also know embroidery'", classifyIntent("I also know embroidery") === 'add_information');

  // --- 2. Test Confirmation Intent Gate (Never extracts 'Yes' or 'Correct' as skills) ---
  console.log('\n--- 2. Testing Confirmation Gate (No Ghost Skills) ---');
  const readyProfile = {
    name: 'Harish',
    skills: [{ name: 'Tailoring & Stitching', type: 'primary', experience_years: 10 }],
    skill: 'Tailoring & Stitching',
    experience_years: 10,
    location: 'Mylapore, Chennai, Tamil Nadu',
    language: null,
    services: [],
    availability: null
  };

  const resConfirm = await manageConversationTurn("Yes, everything is correct.", readyProfile, [], "Is everything correct?");
  check("Confirmed profile has completed = true", resConfirm.action.completed === true);
  check("Next action is finish_onboarding", resConfirm.action.next_action === 'finish_onboarding');
  check("Skills array still has exactly 1 skill (No 'Yes' skill created)", resConfirm.updatedProfile.skills.length === 1);
  check("Skill is still 'Tailoring & Stitching'", resConfirm.updatedProfile.skills[0].name === 'Tailoring & Stitching');

  // --- 3. Test Bare Rejection 'No' ---
  console.log('\n--- 3. Testing Bare Rejection ---');
  const resReject = await manageConversationTurn("No", readyProfile, [], "Is everything correct?");
  check("Completed is false on rejection", resReject.action.completed === false);
  check("Next action is correct_previous_answer", resReject.action.next_action === 'correct_previous_answer');
  check("Profile is not wiped out", resReject.updatedProfile.name === 'Harish' && resReject.updatedProfile.skills.length === 1);

  // --- 4. Test Targeted Correction ---
  console.log('\n--- 4. Testing Targeted Correction ---');
  const resCorr = await manageConversationTurn("No, actually my tailoring experience is only 4 years.", readyProfile, [], "Is everything correct?");
  check("Tailoring experience updated to 4", resCorr.updatedProfile.skills[0].experience_years === 4);
  check("Next action is confirm", resCorr.action.next_action === 'confirm');

  // --- 5. Test Unrelated Question Gate (Never extracts question as a skill) ---
  console.log('\n--- 5. Testing Unrelated Question Gate ---');
  const emptyProfile = { name: null, skills: [], skill: null, experience_years: null, location: null, language: null, services: [], availability: null };
  const resQuestion = await manageConversationTurn("Can I teach people online?", emptyProfile, [], "What is your primary skill?");
  check("Intent is ask_question", resQuestion.action.intent === 'ask_question');
  check("Skills array is still empty (Question not treated as skill)", resQuestion.updatedProfile.skills.length === 0);
  check("Next action is answer_user_question", resQuestion.action.next_action === 'answer_user_question');
  check("Response explains online teaching and pivots", resQuestion.action.assistant_response.includes('online') || resQuestion.action.assistant_response.includes('teach'));

  // --- 6. Test Multi-Information Extraction in One Turn ---
  console.log('\n--- 6. Testing Multi-Information Extraction in One Turn ---');
  const compoundSpeech = "I'm Harish, I do tailoring and embroidery, I've been tailoring for 15 years and embroidery for about 8 years, and I'm from Mylapore Chennai.";
  const resMulti = await manageConversationTurn(compoundSpeech, emptyProfile, [], "Welcome to SilverHands! What is your name?");
  
  check("Extracted Name = Harish", resMulti.updatedProfile.name === 'Harish');
  check("Extracted 2 distinct skills", resMulti.updatedProfile.skills.length === 2);
  check("Tailoring experience = 15 years", resMulti.updatedProfile.skills.some(s => s.name.includes('Tailor') && s.experience_years === 15));
  check("Embroidery experience = 8 years", resMulti.updatedProfile.skills.some(s => s.name.includes('Embroid') && s.experience_years === 8));
  check("Extracted Location = Mylapore, Chennai", resMulti.updatedProfile.location?.includes('Chennai'));
  check("Next action is CONFIRM (All required information present)", resMulti.action.next_action === 'confirm');
  check("isProfileComplete returns TRUE", isProfileComplete(resMulti.updatedProfile) === true);

  // --- 7. Test Mid-Conversation New Skill Appending & Targeted Experience Question ---
  console.log('\n--- 7. Testing Mid-Conversation Skill Appending ---');
  const profileWithTailoring = {
    name: 'Harish',
    skills: [{ name: 'Tailoring & Stitching', type: 'primary', experience_years: 10 }],
    skill: 'Tailoring & Stitching',
    experience_years: 10,
    location: 'Chennai, Tamil Nadu',
    language: null,
    services: [],
    availability: null
  };
  const resAddSkill = await manageConversationTurn("Actually, I also teach mathematics to children.", profileWithTailoring, [], "Is everything correct?");
  check("Skills array now has 2 skills", resAddSkill.updatedProfile.skills.length === 2);
  check("Second skill is Mathematics Teaching", resAddSkill.updatedProfile.skills.some(s => s.name.includes('Math')));
  check("Mathematics experience is currently null", resAddSkill.updatedProfile.skills.find(s => s.name.includes('Math'))?.experience_years === null);
  check("Next question specifically targets Mathematics experience", resAddSkill.action.assistant_response.includes('Mathematics'));

  // --- 8. Test Answering the Targeted Experience Question ---
  console.log('\n--- 8. Testing Targeted Experience Answer ---');
  const resExpAnswer = await manageConversationTurn("3 years", resAddSkill.updatedProfile, [], resAddSkill.action.assistant_response);
  check("Mathematics experience updated to 3 years", resExpAnswer.updatedProfile.skills.find(s => s.name.includes('Math'))?.experience_years === 3);
  check("All fields now complete -> triggers confirmation", resExpAnswer.action.next_action === 'confirm');
  check("isProfileComplete returns TRUE", isProfileComplete(resExpAnswer.updatedProfile) === true);

  console.log('\n========================================================');
  console.log(`Summary: ${passed} / ${total} tests passed.`);
  console.log('========================================================\n');
}

runTortureTestSuite().catch(err => {
  console.error('Torture Suite Failed:', err);
  process.exit(1);
});
