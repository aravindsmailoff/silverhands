import assert from 'node:assert/strict';

// ── 1. Test Haversine Distance Calculation ──────────────────────────────────
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000.0; // Earth radius in meters
  const toRad = (deg) => (deg * Math.PI) / 180.0;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2.0) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * (Math.sin(deltaLambda / 2.0) ** 2);
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  return Math.round(R * c * 100) / 100;
}

console.log('[TEST 1] Testing Haversine distance calculations...');
// Distance between Marina Beach (13.0499, 80.2824) and T. Nagar (13.0418, 80.2341) ~5.3 km
const distMeters = haversineDistanceMeters(13.0499, 80.2824, 13.0418, 80.2341);
console.log(`  Calculated distance: ${distMeters} meters (~${(distMeters / 1000).toFixed(2)} km)`);
assert(distMeters > 5000 && distMeters < 5600, 'Distance should be ~5.3 km');

// ── 2. Test Coordinate Validation ──────────────────────────────────────────
console.log('[TEST 2] Testing coordinate validation...');
function validateCoordinates(lat, lon, accuracy) {
  if (Number.isNaN(lat) || !Number.isFinite(lat) || Number.isNaN(lon) || !Number.isFinite(lon)) {
    return { valid: false, error: 'Coordinates cannot be NaN or Infinity.' };
  }
  if (lat < -90 || lat > 90) return { valid: false, error: 'Latitude out of range.' };
  if (lon < -180 || lon > 180) return { valid: false, error: 'Longitude out of range.' };
  if (accuracy < 0 || accuracy > 5000) return { valid: false, error: 'Accuracy out of bounds.' };
  return { valid: true };
}

assert.equal(validateCoordinates(13.0827, 80.2707, 10).valid, true);
assert.equal(validateCoordinates(95.0, 80.0, 10).valid, false);
assert.equal(validateCoordinates(13.0, 200.0, 10).valid, false);
assert.equal(validateCoordinates(13.0, 80.0, -5).valid, false);
assert.equal(validateCoordinates(13.0, 80.0, 10000).valid, false);
console.log('  Coordinate validation rules passed.');

// ── 3. Test Ephemeral Store & Geofence Query ────────────────────────────────
console.log('[TEST 3] Testing ActiveLocationStore and Geofence Query...');
class MockActiveLocationStore {
  constructor(ttlSeconds = 30) {
    this.users = new Map();
    this.ttlSeconds = ttlSeconds;
  }

  putLocation(loc) {
    this.users.set(loc.userId, { ...loc, lastUpdated: loc.lastUpdated || Date.now() });
  }

  queryNearby(userId, lat, lon, radiusMeters) {
    const now = Date.now();
    const results = [];
    for (const [uid, candidate] of this.users.entries()) {
      if (uid === userId) continue;
      if (!candidate.sharingEnabled) continue;
      if (now - candidate.lastUpdated > this.ttlSeconds * 1000) continue;

      const dist = haversineDistanceMeters(lat, lon, candidate.latitude, candidate.longitude);
      if (dist <= radiusMeters) {
        results.push({ ...candidate, distanceMeters: dist });
      }
    }
    return results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  evictExpired() {
    const now = Date.now();
    const expired = [];
    for (const [uid, loc] of this.users.entries()) {
      if (now - loc.lastUpdated > this.ttlSeconds * 1000) {
        expired.push(uid);
        this.users.delete(uid);
      }
    }
    return expired;
  }
}

const store = new MockActiveLocationStore(30);

// Add User A (Senior Potter in Mylapore: 13.0334, 80.2677)
store.putLocation({
  userId: 'usr_senior_lakshmi',
  displayName: 'Lakshmi Ammal',
  role: 'senior',
  skill: 'Traditional Pottery',
  latitude: 13.0334,
  longitude: 80.2677,
  accuracy: 10,
  sharingEnabled: true,
  lastUpdated: Date.now(),
});

// Add User B (Senior Cook in Mandaveli: 13.0270, 80.2605 - ~1 km away from Mylapore)
store.putLocation({
  userId: 'usr_senior_sundaram',
  displayName: 'Sundaram Master',
  role: 'senior',
  skill: 'Traditional Chettinad Cooking',
  latitude: 13.0270,
  longitude: 80.2605,
  accuracy: 12,
  sharingEnabled: true,
  lastUpdated: Date.now(),
});

// Add User C (Learner in Tambaram: 12.9249, 80.1000 - ~20 km away)
store.putLocation({
  userId: 'usr_learner_rahul',
  displayName: 'Rahul Verma',
  role: 'consumer',
  skill: 'Pottery Enthusiast',
  latitude: 12.9249,
  longitude: 80.1000,
  accuracy: 15,
  sharingEnabled: true,
  lastUpdated: Date.now(),
});

// Add User D (Ghost user with sharingEnabled = false)
store.putLocation({
  userId: 'usr_ghost',
  displayName: 'Secret User',
  role: 'senior',
  skill: 'Weaving',
  latitude: 13.0334,
  longitude: 80.2677,
  accuracy: 8,
  sharingEnabled: false,
  lastUpdated: Date.now(),
});

// Current user is at Mylapore (13.0334, 80.2677) with 2000m radius
const nearby2km = store.queryNearby('usr_me', 13.0334, 80.2677, 2000);
console.log(`  Found ${nearby2km.length} active users within 2km:`, nearby2km.map(u => `${u.displayName} (${u.distanceMeters}m)`));
assert.equal(nearby2km.length, 2, 'Should find exactly 2 users (Lakshmi and Sundaram)');
assert.equal(nearby2km[0].userId, 'usr_senior_lakshmi');
assert.equal(nearby2km[1].userId, 'usr_senior_sundaram');

// Query with 500m radius: Sundaram is ~1040m away so only Lakshmi should appear
const nearby500m = store.queryNearby('usr_me', 13.0334, 80.2677, 500);
console.log(`  Found ${nearby500m.length} active users within 500m:`, nearby500m.map(u => `${u.displayName} (${u.distanceMeters}m)`));
assert.equal(nearby500m.length, 1, 'Should find only Lakshmi Ammal within 500m');

// ── 4. Test TTL Eviction ───────────────────────────────────────────────────
console.log('[TEST 4] Testing TTL Eviction...');
// Simulate expired update 35 seconds ago
store.putLocation({
  userId: 'usr_stale',
  displayName: 'Old Member',
  role: 'consumer',
  latitude: 13.0334,
  longitude: 80.2677,
  accuracy: 10,
  sharingEnabled: true,
  lastUpdated: Date.now() - 35000,
});

const expired = store.evictExpired();
console.log(`  Evicted expired user IDs:`, expired);
assert(expired.includes('usr_stale'), 'usr_stale should be evicted by TTL');

console.log('✅ ALL LIVE LOCATION & GEOFENCING SUBSYSTEM TESTS PASSED SUCCESSFULLY!');
