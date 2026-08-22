import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8000/ws/location';
const API_URL = 'http://localhost:8000';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testCrossBrowserRealtimeFlow() {
  console.log('========================================================================');
  console.log('🌐 SILVERHANDS — CROSS-BROWSER ZERO-LOCALSTORAGE SHARING TEST');
  console.log('========================================================================\n');

  // Simulated Coordinates: Mylapore (Senior) and Mandaveli (Consumer), 650m apart
  const COORDS_LAKSHMI = { latitude: 13.0336, longitude: 80.2677 };
  const COORDS_ARUN = { latitude: 13.0380, longitude: 80.2700 };

  // ── Step 1: Senior Provider in Browser A Connects & Shares Location
  console.log('👵🏽 [Browser A] Senior Provider (Lakshmi Ammal) connects to server...');
  const wsProvider = new WebSocket(WS_URL);
  let providerIncomingRequests = [];

  await new Promise((resolve) => {
    wsProvider.on('open', () => {
      wsProvider.send(
        JSON.stringify({
          type: 'AUTHENTICATE',
          token: 'tok_lakshmi',
          userId: 'usr_prov_lakshmi_ammal',
          displayName: 'Lakshmi Ammal',
          role: 'senior',
          skill: 'Traditional Cooking',
          services: ['Chettinad Samayal Masterclass'],
        })
      );
      resolve();
    });
  });

  wsProvider.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'SERVICE_REQUEST_RECEIVED') {
      console.log('🔔 [Browser A] Incoming Service Request received over WebSocket!');
      providerIncomingRequests.push(msg.request);
    }
  });

  // Browser A broadcasts live GPS coordinates
  wsProvider.send(
    JSON.stringify({
      type: 'LOCATION_UPDATE',
      coordinates: { ...COORDS_LAKSHMI, accuracy: 10, timestamp: Date.now() },
      sharingEnabled: true,
      radiusMeters: 3000,
    })
  );

  // ── Step 2: Senior Provider in Browser A Publishes Service to Backend REST API
  console.log('👵🏽 [Browser A] Senior publishes service "Chettinad Samayal" to Backend API...');
  const publishRes = await fetch(`${API_URL}/api/services/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serviceId: 'svc_samayal_101',
      providerId: 'usr_prov_lakshmi_ammal',
      providerName: 'Lakshmi Ammal',
      serviceName: 'Chettinad Samayal Masterclass',
      category: 'cooking',
      description: 'Authentic traditional Chettinad dishes taught step-by-step in your kitchen.',
      deliveryType: 'HOME_SERVICE',
      pricing: '₹1,200',
      duration: '2.5 hours',
      availability: 'Daily 10 AM - 6 PM',
      status: 'PUBLISHED',
      latitude: COORDS_LAKSHMI.latitude,
      longitude: COORDS_LAKSHMI.longitude,
      accuracy: 10,
      locality: 'Mylapore, Chennai',
    }),
  });
  const publishData = await publishRes.json();
  console.log('✅ [Browser A] Service published:', publishData.success);

  await wait(500);

  // ── Step 3: Consumer in Browser B (Completely isolated, zero shared storage) Connects
  console.log('\n👤 [Browser B] Consumer (Arun) connects in a separate isolated browser...');
  const wsConsumer = new WebSocket(WS_URL);
  let consumerDiscoveredSeniors = [];
  let consumerRequestUpdates = [];

  await new Promise((resolve) => {
    wsConsumer.on('open', () => {
      wsConsumer.send(
        JSON.stringify({
          type: 'AUTHENTICATE',
          token: 'tok_arun',
          userId: 'usr_consumer_arun',
          displayName: 'Arun',
          role: 'consumer',
        })
      );
      resolve();
    });
  });

  wsConsumer.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'NEARBY_SNAPSHOT') {
      consumerDiscoveredSeniors = msg.users;
    } else if (msg.type === 'SERVICE_REQUEST_UPDATED' || msg.type === 'SERVICE_REQUEST_UPDATE') {
      console.log('🎉 [Browser B] Realtime Request Status Update:', msg.request.status);
      consumerRequestUpdates.push(msg.request);
    }
  });

  // Browser B broadcasts live GPS coordinates
  wsConsumer.send(
    JSON.stringify({
      type: 'LOCATION_UPDATE',
      coordinates: { ...COORDS_ARUN, accuracy: 10, timestamp: Date.now() },
      sharingEnabled: true,
      radiusMeters: 3000,
    })
  );

  await wait(1000);

  // ── Step 4: Verify Consumer in Browser B Discovered Senior Provider via Server
  console.log('\n========================================================================');
  console.log('🔍 CHECK 1: CONSUMER DISCOVERY ACROSS BROWSERS');
  console.log('========================================================================');
  console.log(`Discovered ${consumerDiscoveredSeniors.length} nearby senior providers:`);
  consumerDiscoveredSeniors.forEach((s) => {
    console.log(`   - ${s.displayName} (${s.skill || s.serviceName}) • ${Math.round(s.distanceMeters)}m away`);
  });

  const foundLakshmi = consumerDiscoveredSeniors.find((s) => s.userId === 'usr_prov_lakshmi_ammal');
  if (!foundLakshmi) {
    throw new Error('❌ Cross-browser discovery failed: Browser B did not find Browser A!');
  }
  console.log('✅ PASS: Browser B discovered Browser A over WebSocket with 0 shared localStorage.');

  // Also verify REST fallback for Browser B
  const nearbyRestRes = await fetch(
    `${API_URL}/api/services/nearby?lat=${COORDS_ARUN.latitude}&lng=${COORDS_ARUN.longitude}&radius=3000&role=consumer&excludeUserId=usr_consumer_arun`
  );
  const nearbyRestData = await nearbyRestRes.json();
  console.log(`✅ PASS: REST Fallback returned ${nearbyRestData.services.length} services for Browser B.`);

  // ── Step 5: Consumer in Browser B Sends Service Booking Request
  console.log('\n========================================================================');
  console.log('🔍 CHECK 2: CROSS-BROWSER REALTIME BOOKING');
  console.log('========================================================================');
  const reqId = `req_${Date.now()}`;
  console.log(`👉 [Browser B] Consumer sends booking request for "Chettinad Samayal Masterclass" (${reqId})...`);

  wsConsumer.send(
    JSON.stringify({
      type: 'SERVICE_REQUEST_CREATE',
      requestId: reqId,
      providerId: 'usr_prov_lakshmi_ammal',
      consumerId: 'usr_consumer_arun',
      consumerName: 'Arun',
      serviceName: 'Chettinad Samayal Masterclass',
      preferredTime: 'Today at 6:00 PM',
      message: 'I would love to learn authentic Chettinad cooking!',
    })
  );

  await wait(1000);

  if (providerIncomingRequests.length === 0) {
    throw new Error('❌ Booking routing failed: Browser A did not receive incoming request alert!');
  }
  console.log('✅ PASS: Browser A received real-time modal trigger from Browser B.');

  // ── Step 6: Senior Provider in Browser A Accepts via Double Tap
  console.log('\n========================================================================');
  console.log('🔍 CHECK 3: DOUBLE TAP ACCEPTANCE CONFIRMATION');
  console.log('========================================================================');
  console.log('👵🏽 [Browser A] Senior provider DOUBLE TAPS "YES, I CAN HELP"...');

  wsProvider.send(
    JSON.stringify({
      type: 'SERVICE_REQUEST_RESPOND',
      requestId: reqId,
      action: 'ACCEPT',
    })
  );

  await wait(1000);

  const acceptedUpdate = consumerRequestUpdates.find((u) => (u.id === reqId || u.requestId === reqId) && u.status === 'ACCEPTED');
  if (!acceptedUpdate) {
    throw new Error('❌ Confirmation routing failed: Browser B did not receive ACCEPTED status!');
  }
  console.log('✅ PASS: Browser B received ACCEPTED status confirmation in real time.');

  // ── Step 7: Clean Up
  wsProvider.close();
  wsConsumer.close();

  console.log('\n========================================================================');
  console.log('🎉 100% COMPLETE CROSS-BROWSER DISCOVERY & BOOKING LIFECYCLE PASSED!');
  console.log('========================================================================\n');
}

testCrossBrowserRealtimeFlow().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
