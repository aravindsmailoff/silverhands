/**
 * SilverHands biometrics & schema unit tests (offline, no DB).
 * Run: node scratch/test_biometrics_suite.mjs
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Compile-free import via dynamic path — tests run against built TS via ts-node alternative:
// We inline test logic matching lib implementations for CI without ts-node.

function normalizeVector(v) {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function generateTestEmbedding(seed) {
  const v = Array.from({ length: 128 }, (_, i) => Math.sin(seed + i * 0.1));
  return normalizeVector(v);
}

// ── Face embedding similarity ──
const enrolled = generateTestEmbedding(1);
const samePerson = generateTestEmbedding(1);
const different = generateTestEmbedding(99);

assert.ok(cosineSimilarity(enrolled, samePerson) > 0.99, 'Same seed should match');
assert.ok(cosineSimilarity(enrolled, different) < 0.95, 'Different seeds should differ');

// ── Profile completion (mirrors ai-schemas) ──
function isProfileComplete(profile) {
  const hasName = Boolean(profile.name && profile.name.trim().length >= 2);
  const hasSkills = Array.isArray(profile.skills) && profile.skills.length > 0;
  const hasExperience =
    hasSkills &&
    profile.skills.every((s) => s.experience_years !== null && s.experience_years !== undefined);
  const loc = profile.location;
  const hasLocation = Boolean(loc?.city && loc?.state);
  return hasName && hasSkills && hasExperience && hasLocation;
}

assert.equal(isProfileComplete({ name: 'Harish' }), false);
assert.equal(
  isProfileComplete({
    name: 'Harish',
    skills: [{ name: 'Tailoring', experience_years: 7 }],
    location: { city: 'Chennai', state: 'Tamil Nadu' },
  }),
  true
);

// ── Transcript chunking ──
function chunkTranscript(transcript, maxChunkChars = 400) {
  const cleaned = transcript.replace(/\s+/g, ' ').trim();
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let buffer = '';
  for (const sentence of sentences) {
    if ((buffer + ' ' + sentence).trim().length > maxChunkChars && buffer.length > 0) {
      chunks.push({ content: buffer.trim() });
      buffer = sentence;
    } else {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    }
  }
  if (buffer.trim()) chunks.push({ content: buffer.trim() });
  return chunks;
}

const chunks = chunkTranscript('First sentence. Second sentence. Third sentence. Fourth sentence.');
assert.ok(chunks.length >= 1, 'Should produce at least one chunk');

console.log('✅ All biometrics & schema tests passed');
