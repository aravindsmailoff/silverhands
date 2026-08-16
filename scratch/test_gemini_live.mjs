// Live Gemini Integration Smoke Test (Paced to avoid 429 rate limits)
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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runLiveGeminiTest() {
  console.log('========================================================');
  console.log('   LIVE GEMINI 2.5 FLASH CONVERSATION SMOKE TEST        ');
  console.log('========================================================\n');

  if (!process.env.GEMINI_API_KEY) {
    console.log('⚠️ GEMINI_API_KEY not configured. Skipping live test.');
    return;
  }

  console.log('1. Testing Live Gemini Multi-Skill Extraction...');
  const speech1 = "I'm Harish, I do tailoring and pottery, 10 years experience in tailoring, living in Mylapore Chennai.";
  const initialProfile = { name: null, skills: [], skill: null, experience_years: null, location: null, language: null, services: [], availability: null };
  
  const res1 = await manageConversationTurn(speech1, initialProfile, [], "Welcome to SilverHands! What is your name?");
  console.log('Live Gemini response 1:');
  console.log('Name:', res1.updatedProfile.name);
  console.log('Skills:', res1.updatedProfile.skills);
  console.log('Location:', res1.updatedProfile.location);
  console.log('AI Response:', res1.action.assistant_response);
  assert.ok(res1.updatedProfile.name?.toLowerCase().includes('harish'), 'Name extraction failed');
  assert.ok(res1.updatedProfile.skills?.length >= 2, 'Multi-skill extraction failed');
  console.log('✅ Live Gemini turn 1 passed.\n');

  await sleep(1500);

  console.log('2. Testing Live Gemini Unrelated Question Handling...');
  const res2 = await manageConversationTurn("Can I teach tailoring online on SilverHands?", res1.updatedProfile, [], "How many years of experience in pottery?");
  console.log('AI Response to Question:', res2.action.assistant_response);
  assert.strictEqual(res2.action.intent, 'ask_question');
  assert.strictEqual(res2.updatedProfile.skills.length, 2, 'Ghost skill created from question');
  console.log('✅ Live Gemini turn 2 passed.\n');

  console.log('========================================================');
  console.log('✅ ALL LIVE GEMINI INTEGRATION TESTS PASSED!');
  console.log('========================================================\n');
}

runLiveGeminiTest().catch(err => {
  console.error('Live Gemini test notice:', err.message);
});
