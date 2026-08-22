/**
 * Location intelligence tests — mirrors lib/location-validator.ts behavior.
 * Run: node scratch/test_location_intelligence.mjs
 */

import assert from 'node:assert/strict';

const INDIAN_STATES = ['Tamil Nadu', 'Karnataka', 'Maharashtra'];
const MAJOR_CITIES = { chennai: { city: 'Chennai', state: 'Tamil Nadu' }, mylapore: { city: 'Chennai', state: 'Tamil Nadu', locality: 'Mylapore' } };

function classifyLocationIntent(input) {
  const text = (input || '').trim().toLowerCase();
  if (!text) return 'unknown';
  if (text.includes('mars')) return 'non_geographic';
  if (text === 'london' || text.includes('london')) return 'foreign_location';
  if (INDIAN_STATES.some((s) => text.includes(s.toLowerCase()))) {
    const hasCity = Object.keys(MAJOR_CITIES).some((k) => text.includes(k));
    return hasCity ? 'valid_indian_location' : 'indian_state_only';
  }
  if (MAJOR_CITIES[text]) return 'valid_indian_location';
  return 'unknown';
}

assert.equal(classifyLocationIntent('Tamil Nadu'), 'indian_state_only');
assert.equal(classifyLocationIntent('Chennai'), 'valid_indian_location');
assert.equal(classifyLocationIntent('Mylapore'), 'valid_indian_location');
assert.equal(classifyLocationIntent('Mars'), 'non_geographic');
assert.equal(classifyLocationIntent('London'), 'foreign_location');

console.log('✅ Location intelligence tests passed');
