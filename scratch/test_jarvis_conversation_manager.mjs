import assert from 'assert';
import fs from 'fs';
import path from 'path';

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      process.env[key] = val;
    }
  }
}

import { manageConversationTurn } from '../lib/conversation-manager.ts';

async function runJarvisTests() {
  console.log('========================================================');
  console.log('   JARVIS-STYLE CONVERSATIONAL MANAGER TEST SUITE       ');
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

  // --- 1. Test Multiple Answers in One Sentence ---
  console.log('--- 1. Testing Multiple Answers in One Sentence ---');
  const multiSentenceSpeech = "I'm Harish, I do tailoring and embroidery, I've been tailoring for 15 years and embroidery for about 8 years, and I'm from Mylapore Chennai.";
  const initialProfile = { name: null, skills: [], skill: null, experience_years: null, location: null, language: null, services: [], availability: null };
  
  const resMulti = await manageConversationTurn(multiSentenceSpeech, initialProfile, [], "Welcome to SilverHands! What is your name?");
  console.log('DEBUG resMulti skills:', resMulti.updatedProfile.skills);
  
  check("Extracted Name 'Harish'", resMulti.updatedProfile.name?.toLowerCase().includes('harish'));
  check("Extracted 2 skills (Tailoring & Embroidery)", resMulti.updatedProfile.skills?.length === 2);
  check("Tailoring experience = 15 years", resMulti.updatedProfile.skills?.some(s => s.name.toLowerCase().includes('tailor') && s.experience_years === 15));
  check("Embroidery experience = 8 years", resMulti.updatedProfile.skills?.some(s => s.name.toLowerCase().includes('embroid') && s.experience_years === 8));
  check("Extracted Location 'Chennai'", resMulti.updatedProfile.location?.toLowerCase().includes('chennai'));
  check("Next action is CONFIRM (All fields known)", resMulti.action.next_action === 'confirm');

  // --- 2. Test Mid-Conversation New Skill Insertion ---
  console.log('\n--- 2. Testing Mid-Conversation New Skill Insertion ---');
  const profileWithTailoring = {
    name: 'Harish',
    skills: [{ name: 'Tailoring & Stitching', type: 'primary', experience_years: null }],
    skill: 'Tailoring & Stitching',
    experience_years: null,
    location: null,
    language: null,
    services: [],
    availability: null
  };
  const historyTurn2 = [
    { role: 'assistant', text: 'How many years of experience do you have in Tailoring?' }
  ];
  const userSpeechAddSkill = "Actually, I also teach mathematics to children.";
  
  const resAddSkill = await manageConversationTurn(userSpeechAddSkill, profileWithTailoring, historyTurn2, "How many years of experience do you have in Tailoring?");
  
  check("Appended Mathematics Teaching skill", resAddSkill.updatedProfile.skills?.length >= 2);
  check("Contains Mathematics skill", resAddSkill.updatedProfile.skills?.some(s => s.name.toLowerCase().includes('math')));

  // --- 3. Test Correction of Previous Value ---
  console.log('\n--- 3. Testing Correction of Previous Value ---');
  const profileForCorrection = {
    name: 'Harish',
    skills: [{ name: 'Tailoring & Stitching', type: 'primary', experience_years: 10 }],
    skill: 'Tailoring & Stitching',
    experience_years: 10,
    location: 'Mylapore, Chennai, Tamil Nadu',
    language: null,
    services: [],
    availability: null
  };
  const historyTurn3 = [
    { role: 'assistant', text: 'Harish, you have 10 years of tailoring experience. Is that correct?' }
  ];
  const userSpeechCorrection = "No, I have only 4 years.";

  const resCorrection = await manageConversationTurn(userSpeechCorrection, profileForCorrection, historyTurn3, "Harish, you have 10 years of tailoring experience. Is that correct?");

  check("Corrected Tailoring experience to 4 years", resCorrection.updatedProfile.skills?.[0]?.experience_years === 4);

  // --- 4. Test Final Profile Confirmation ---
  console.log('\n--- 4. Testing Final Confirmation ---');
  const profileReadyToConfirm = {
    name: 'Harish',
    skills: [{ name: 'Tailoring & Stitching', type: 'primary', experience_years: 4 }],
    skill: 'Tailoring & Stitching',
    experience_years: 4,
    location: 'Mylapore, Chennai, Tamil Nadu',
    language: null,
    services: [],
    availability: null
  };
  const userSpeechConfirm = "Yes, everything is correct.";

  const resConfirm = await manageConversationTurn(userSpeechConfirm, profileReadyToConfirm, [], "Is everything correct?");
  console.log('resConfirm output:', JSON.stringify(resConfirm, null, 2));
  
  check("Completed profile onboarding", resConfirm.action.completed === true);
  check("Next action is finish_onboarding", resConfirm.action.next_action === 'finish_onboarding');

  console.log('\n========================================================');
  console.log(`Summary: ${passed} / ${total} tests passed.`);
  console.log('========================================================\n');
}

runJarvisTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
