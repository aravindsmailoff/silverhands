import WebSocket from 'ws';

const BACKEND_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws/location';

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCrossBrowserTest() {
  console.log('====================================================');
  console.log('🚀 SILVERHANDS — CROSS-BROWSER SERVICE DISCOVERY TEST');
  console.log('====================================================\n');

  // ── 1. BROWSER A: Provider Publishes "Cooking" Service ─────────────────
  console.log('👉 [Browser A - Provider] Publishing Service: "Cooking"...');
  const providerLocation = { lat: 13.0827, lng: 80.2707 }; // Mylapore, Chennai

  const publishRes = await fetch(`${BACKEND_URL}/api/services/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: `svc_cook_${Date.now()}`,
      providerId: 'usr_prov_lakshmi_ammal',
      providerName: 'Lakshmi Ammal',
      serviceName: 'Cooking',
      category: 'cooking',
      description: 'Authentic traditional Chettinad home cooking and recipes.',
      deliveryType: 'HOME_SERVICE',
      pricing: '₹800 / visit',
      duration: '2 hours',
      availability: 'Weekdays 10 AM - 6 PM',
      status: 'PUBLISHED',
      latitude: providerLocation.lat,
      longitude: providerLocation.lng,
      accuracy: 10.0,
      locality: 'Mylapore, Chennai',
    }),
  });

  const publishData = await publishRes.json();
  console.log('✅ [Browser A - Provider] Service Publish Result:', publishData);
  if (!publishData.success) {
    throw new Error('Failed to publish service to shared state!');
  }

  // ── 2. BROWSER A: Provider Connects WebSocket ──────────────────────────
  console.log('\n👉 [Browser A - Provider] Connecting to Realtime WebSocket...');
  const providerWs = new WebSocket(WS_URL);
  let providerReceivedRequest = null;

  await new Promise((resolve) => {
    providerWs.on('open', () => {
      providerWs.send(
        JSON.stringify({
          type: 'AUTHENTICATE',
          token: 'prov_token',
          userId: 'usr_prov_lakshmi_ammal',
          displayName: 'Lakshmi Ammal',
          role: 'senior',
          skill: 'Cooking',
          services: ['Cooking'],
        })
      );
      resolve();
    });
  });

  providerWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'SERVICE_REQUEST_RECEIVED') {
      console.log('🔔 [Browser A - Provider] Realtime Notification Received:', msg.request);
      providerReceivedRequest = msg.request;

      // Provider responds with ACCEPT
      console.log('👉 [Browser A - Provider] Tapping "YES, I CAN HELP" (Double-tap accept)...');
      providerWs.send(
        JSON.stringify({
          type: 'SERVICE_REQUEST_RESPOND',
          requestId: msg.request.id,
          action: 'ACCEPT',
        })
      );
    }
  });

  // ── 3. BROWSER B: Consumer (Separate Browser) Opens "People Near Me" ───
  console.log('\n👉 [Browser B - Consumer] Connecting to Realtime WebSocket (~350m away)...');
  const consumerLocation = { lat: 13.0850, lng: 80.2720 }; // ~350m from provider
  const consumerWs = new WebSocket(WS_URL);
  let consumerSnapshotReceived = null;
  let consumerAcceptedNotice = null;

  await new Promise((resolve) => {
    consumerWs.on('open', () => {
      consumerWs.send(
        JSON.stringify({
          type: 'AUTHENTICATE',
          token: 'cons_token',
          userId: 'usr_consumer_aarav',
          displayName: 'Aarav Mehta',
          role: 'consumer',
        })
      );
      resolve();
    });
  });

  consumerWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'NEARBY_SNAPSHOT') {
      console.log('📍 [Browser B - Consumer] Received NEARBY_SNAPSHOT with users:', msg.users.length);
      consumerSnapshotReceived = msg;
    }
    if (msg.type === 'SERVICE_REQUEST_UPDATED') {
      console.log('🎉 [Browser B - Consumer] Service Request Update Received:', msg.request);
      consumerAcceptedNotice = msg.request;
    }
  });

  // Consumer sends location update (2km radius)
  consumerWs.send(
    JSON.stringify({
      type: 'LOCATION_UPDATE',
      coordinates: {
        latitude: consumerLocation.lat,
        longitude: consumerLocation.lng,
        accuracy: 12.0,
        timestamp: Date.now(),
      },
      sharingEnabled: true,
      radiusMeters: 2000,
    })
  );

  // Wait for snapshot
  await wait(1000);

  if (!consumerSnapshotReceived || consumerSnapshotReceived.users.length === 0) {
    throw new Error('Consumer did NOT receive any published services on radar!');
  }

  const foundCookingService = consumerSnapshotReceived.users.find(
    (u) => u.userId === 'usr_prov_lakshmi_ammal' || u.skill === 'Cooking'
  );

  if (!foundCookingService) {
    throw new Error('Cooking service was not found in consumer radar snapshot!');
  }

  console.log('✅ [Browser B - Consumer] Discovered Published Service:');
  console.log(`   - Service: ${foundCookingService.skill || foundCookingService.serviceName}`);
  console.log(`   - Provider: ${foundCookingService.displayName}`);
  console.log(`   - Distance: ${Math.round(foundCookingService.distanceMeters)} meters`);
  console.log(`   - Category: ${foundCookingService.category}`);
  console.log(`   - Pricing: ${foundCookingService.pricing}`);

  // ── 4. Consumer Requests Service ───────────────────────────────────────
  console.log('\n👉 [Browser B - Consumer] Sending "Ask for Help" Request...');
  const reqId = `req_test_${Date.now()}`;
  consumerWs.send(
    JSON.stringify({
      type: 'SERVICE_REQUEST_CREATE',
      requestId: reqId,
      providerId: 'usr_prov_lakshmi_ammal',
      serviceName: 'Cooking',
      preferredTime: 'Today at 6:00 PM',
      message: 'Need help preparing Chettinad dinner for 4 people.',
      timestamp: Date.now(),
    })
  );

  // Wait for provider to receive and accept
  await wait(1500);

  if (!providerReceivedRequest) {
    throw new Error('Provider did NOT receive the realtime service request!');
  }

  if (!consumerAcceptedNotice || consumerAcceptedNotice.status !== 'ACCEPTED') {
    throw new Error('Consumer did NOT receive acceptance response from provider!');
  }

  console.log('✅ [Browser B - Consumer] Successfully received acceptance from Lakshmi Ammal!');

  // ── 5. GEOFENCE EXCLUSION TEST (Consumer 15km Away) ────────────────────
  console.log('\n👉 [Browser C - Far Consumer (15km away)] Testing Geofence Exclusion...');
  const farConsumerWs = new WebSocket(WS_URL);
  let farConsumerSnapshot = null;

  await new Promise((resolve) => {
    farConsumerWs.on('open', () => {
      farConsumerWs.send(
        JSON.stringify({
          type: 'AUTHENTICATE',
          token: 'far_token',
          userId: 'usr_consumer_far',
          displayName: 'Far User',
          role: 'consumer',
        })
      );
      resolve();
    });
  });

  farConsumerWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'NEARBY_SNAPSHOT') {
      farConsumerSnapshot = msg;
    }
  });

  // Far location ~15km away
  farConsumerWs.send(
    JSON.stringify({
      type: 'LOCATION_UPDATE',
      coordinates: {
        latitude: 13.2000,
        longitude: 80.3500,
        accuracy: 10.0,
        timestamp: Date.now(),
      },
      sharingEnabled: true,
      radiusMeters: 2000, // 2km radius
    })
  );

  await wait(1000);

  const farFound = (farConsumerSnapshot?.users || []).find((u) => u.userId === 'usr_prov_lakshmi_ammal');
  if (farFound) {
    throw new Error('Geofence failed! Service appeared to consumer 15km away with 2km radius!');
  }
  console.log('✅ [Browser C - Far Consumer] Correctly excluded outside 2km geofence radius.');

  // Cleanup
  providerWs.close();
  consumerWs.close();
  farConsumerWs.close();

  console.log('\n====================================================');
  console.log('🎉 ALL CROSS-BROWSER SERVICE FLOW TESTS PASSED 100%!');
  console.log('====================================================\n');
}

runCrossBrowserTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
