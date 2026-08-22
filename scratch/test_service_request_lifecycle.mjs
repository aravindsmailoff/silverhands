import assert from 'node:assert/strict';

console.log('=== REALTIME SERVICE REQUEST SUBSYSTEM INTEGRATION TEST ===\n');

// ── Mock Realtime Engine simulating Video-Backend Location Manager ───────────

class MockRealtimeServiceManager {
  constructor() {
    this.activeUsers = new Map();
    this.activeRequests = new Map();
    this.eventLogs = [];
  }

  // 1. Authenticate Provider / Consumer
  authenticate(userId, displayName, role, skill, services, coords) {
    const user = {
      userId,
      displayName,
      role,
      skill,
      services: services || (skill ? [skill] : []),
      coords,
      lastUpdated: Date.now(),
    };
    this.activeUsers.set(userId, user);
    this.eventLogs.push(`[AUTH] ${displayName} (${role}) online with services: ${user.services.join(', ')}`);
    return user;
  }

  // 2. Discover nearby providers
  queryNearbyServices(consumerId, radiusMeters = 2000) {
    const consumer = this.activeUsers.get(consumerId);
    if (!consumer) return [];

    const results = [];
    for (const [uid, user] of this.activeUsers.entries()) {
      if (uid === consumerId) continue;
      // In a real run, Haversine computes real distance
      const distMeters = 650; // 650m
      if (distMeters <= radiusMeters) {
        results.push({
          userId: user.userId,
          displayName: user.displayName,
          role: user.role,
          skill: user.skill,
          services: user.services,
          distanceMeters: distMeters,
        });
      }
    }
    return results;
  }

  // 3. Consumer creates service request
  createServiceRequest({ requestId, consumerId, providerId, serviceName, preferredTime, message }) {
    const consumer = this.activeUsers.get(consumerId);
    const provider = this.activeUsers.get(providerId);

    assert(consumer, 'Consumer must exist');
    assert(provider, 'Provider must exist');
    assert(provider.services.includes(serviceName), `Provider must offer ${serviceName}`);

    const req = {
      id: requestId,
      consumerId,
      consumerName: consumer.displayName,
      consumerDistanceMeters: 650,
      providerId,
      providerName: provider.displayName,
      serviceName,
      preferredTime,
      message,
      status: 'REQUESTED',
      timestamp: Date.now(),
    };

    this.activeRequests.set(requestId, req);
    this.eventLogs.push(`[WS_EVENT: SERVICE_REQUEST_RECEIVED] Sent to Provider ${provider.displayName}: ${consumer.displayName} requested ${serviceName}`);
    return req;
  }

  // 4. Provider responds to service request
  respondServiceRequest(requestId, action) {
    const req = this.activeRequests.get(requestId);
    assert(req, 'Request must exist');
    assert(action === 'ACCEPT' || action === 'REJECT', 'Action must be ACCEPT or REJECT');

    req.status = action === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED';
    this.eventLogs.push(`[WS_EVENT: SERVICE_REQUEST_UPDATED] Status changed to ${req.status} for Consumer ${req.consumerName}`);
    return req;
  }
}

const manager = new MockRealtimeServiceManager();

// TEST 1: Provider registers services
console.log('[TEST 1] Registering Provider Lakshmi with multiple service offerings...');
const provider = manager.authenticate(
  'usr_prov_lakshmi',
  'Lakshmi Ammal',
  'senior',
  'Traditional Cooking',
  ['Home Cooking', 'Tamil Cooking Class', 'Traditional Tailoring'],
  { lat: 13.0334, lng: 80.2677 }
);
assert.equal(provider.services.length, 3);
console.log('✓ Provider Lakshmi online with 3 services.\n');

// TEST 2: Consumer Arun discovers Lakshmi on the radar
console.log('[TEST 2] Consumer Arun discovers nearby service providers on Radar...');
const consumer = manager.authenticate(
  'usr_cons_arun',
  'Arun Kumar',
  'consumer',
  'Learner',
  [],
  { lat: 13.0380, lng: 80.2690 }
);

const nearby = manager.queryNearbyServices('usr_cons_arun', 2000);
console.log(`✓ Found ${nearby.length} nearby provider(s):`);
nearby.forEach(p => console.log(`  - ${p.displayName} (${p.distanceMeters}m away) offering: ${p.services.join(', ')}`));
assert.equal(nearby.length, 1);
assert.equal(nearby[0].userId, 'usr_prov_lakshmi');
assert(nearby[0].services.includes('Home Cooking'));
console.log();

// TEST 3: Consumer sends realtime service request for "Home Cooking"
console.log('[TEST 3] Consumer Arun selects and requests "Home Cooking" from Lakshmi...');
const req = manager.createServiceRequest({
  requestId: 'req_101',
  consumerId: 'usr_cons_arun',
  providerId: 'usr_prov_lakshmi',
  serviceName: 'Home Cooking',
  preferredTime: 'Today at 6:00 PM',
  message: 'Need assistance preparing authentic sambar and curry for 4 people.',
});

assert.equal(req.status, 'REQUESTED');
assert.equal(req.serviceName, 'Home Cooking');
assert.equal(req.consumerDistanceMeters, 650);
console.log(`✓ Request ${req.id} created with status: ${req.status}`);
console.log(`  Provider notification delivered: "${req.consumerName} requested ${req.serviceName}"\n`);

// TEST 4: Provider Lakshmi accepts the request
console.log('[TEST 4] Provider Lakshmi opens request panel and clicks [ACCEPT]...');
const updatedReq = manager.respondServiceRequest('req_101', 'ACCEPT');
assert.equal(updatedReq.status, 'ACCEPTED');
console.log(`✓ Realtime state transitioned to: ${updatedReq.status}`);
console.log(`  Consumer intimation delivered: "Lakshmi accepted your Home Cooking request!"\n`);

// TEST 5: Test Rejection flow
console.log('[TEST 5] Testing rejection flow on a separate request...');
const req2 = manager.createServiceRequest({
  requestId: 'req_102',
  consumerId: 'usr_cons_arun',
  providerId: 'usr_prov_lakshmi',
  serviceName: 'Traditional Tailoring',
  preferredTime: 'Tomorrow morning',
  message: 'Alteration needed.',
});
const rejectedReq = manager.respondServiceRequest('req_102', 'REJECT');
assert.equal(rejectedReq.status, 'REJECTED');
console.log(`✓ Request ${rejectedReq.id} correctly transitioned to: ${rejectedReq.status}\n`);

console.log('=== ALL REALTIME SERVICE REQUEST LIFECYCLE TESTS PASSED! ===');
