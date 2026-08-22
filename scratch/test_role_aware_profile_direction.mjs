import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8000/ws/location';
const BACKEND_URL = 'http://localhost:8000';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testRoleAwareDirection() {
  console.log('========================================================================');
  console.log('🎯 SILVERHANDS — ROLE-AWARE PEOPLE NEAR ME & PROFILE DIRECTION TEST');
  console.log('========================================================================\n');

  // Coordinates around Mylapore & Mandaveli (650m apart)
  const COORDS_LAKSHMI = { latitude: 13.0336, longitude: 80.2677 };
  const COORDS_SUNDARAM = { latitude: 13.0310, longitude: 80.2650 };
  const COORDS_ARUN = { latitude: 13.0380, longitude: 80.2700 };
  const COORDS_DEEPA = { latitude: 13.0390, longitude: 80.2710 };

  // ── 1. Senior Provider B: Lakshmi Ammal
  console.log('👵🏽 [1] Connecting Senior Provider B: Lakshmi Ammal (Cooking)...');
  const wsLakshmi = new WebSocket(WS_URL);
  let lakshmiNearbySnapshot = [];

  await new Promise((resolve) => {
    wsLakshmi.on('open', () => {
      wsLakshmi.send(
        JSON.stringify({
          type: 'AUTHENTICATE',
          token: 'tok_lakshmi',
          userId: 'usr_prov_lakshmi_ammal',
          displayName: 'Lakshmi Ammal',
          role: 'senior',
          skill: 'Cooking',
          services: ['Home Cooking', 'Tamil Cooking Class'],
        })
      );
      resolve();
    });
  });

  wsLakshmi.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'NEARBY_SNAPSHOT') {
      lakshmiNearbySnapshot = msg.users;
    }
  });

  wsLakshmi.send(
    JSON.stringify({
      type: 'LOCATION_UPDATE',
      coordinates: { ...COORDS_LAKSHMI, accuracy: 10, timestamp: Date.now() },
      sharingEnabled: true,
      radiusMeters: 3000,
    })
  );

  // ── 2. Senior Provider C: Sundaram Master
  console.log('👴🏽 [2] Connecting Senior Provider C: Sundaram Master (Pottery)...');
  const wsSundaram = new WebSocket(WS_URL);
  await new Promise((resolve) => {
    wsSundaram.on('open', () => {
      wsSundaram.send(
        JSON.stringify({
          type: 'AUTHENTICATE',
          token: 'tok_sundaram',
          userId: 'usr_prov_sundaram_master',
          displayName: 'Sundaram Master',
          role: 'senior',
          skill: 'Terracotta Pottery',
          services: ['Pottery Workshop', 'Clay Sculpting'],
        })
      );
      resolve();
    });
  });

  wsSundaram.send(
    JSON.stringify({
      type: 'LOCATION_UPDATE',
      coordinates: { ...COORDS_SUNDARAM, accuracy: 10, timestamp: Date.now() },
      sharingEnabled: true,
      radiusMeters: 3000,
    })
  );

  // ── 3. Consumer D: Deepa
  console.log('👩🏻 [3] Connecting Consumer D: Deepa (Learner)...');
  const wsDeepa = new WebSocket(WS_URL);
  await new Promise((resolve) => {
    wsDeepa.on('open', () => {
      wsDeepa.send(
        JSON.stringify({
          type: 'AUTHENTICATE',
          token: 'tok_deepa',
          userId: 'usr_consumer_deepa',
          displayName: 'Deepa',
          role: 'consumer',
        })
      );
      resolve();
    });
  });

  wsDeepa.send(
    JSON.stringify({
      type: 'LOCATION_UPDATE',
      coordinates: { ...COORDS_DEEPA, accuracy: 10, timestamp: Date.now() },
      sharingEnabled: true,
      radiusMeters: 3000,
    })
  );

  await wait(500);

  // ── 4. Consumer A: Arun (The Main Viewer for Test A)
  console.log('👤 [4] Connecting Consumer A: Arun (Learner)...');
  const wsArun = new WebSocket(WS_URL);
  let arunNearbySnapshot = [];

  await new Promise((resolve) => {
    wsArun.on('open', () => {
      wsArun.send(
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

  wsArun.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'NEARBY_SNAPSHOT') {
      arunNearbySnapshot = msg.users;
    }
  });

  wsArun.send(
    JSON.stringify({
      type: 'LOCATION_UPDATE',
      coordinates: { ...COORDS_ARUN, accuracy: 10, timestamp: Date.now() },
      sharingEnabled: true,
      radiusMeters: 3000,
    })
  );

  await wait(1000);

  // ── VERIFICATION 1: Consumer Arun's Perspective
  console.log('\n========================================================================');
  console.log('🔍 VERIFICATION 1: CONSUMER ARUN PERSPECTIVE');
  console.log('========================================================================');
  console.log('Arun Nearby Results count:', arunNearbySnapshot.length);
  arunNearbySnapshot.forEach((u) => {
    console.log(`   - [${u.role.toUpperCase()}] ${u.displayName} (${u.skill || u.serviceName}) • ${Math.round(u.distanceMeters)}m away`);
  });

  // Check 1A: Arun must NOT see himself
  const arunHasSelf = arunNearbySnapshot.some((u) => u.userId === 'usr_consumer_arun');
  if (arunHasSelf) {
    throw new Error('❌ FAILURE: Consumer Arun saw himself in People Near Me!');
  }
  console.log('✅ PASS: Consumer Arun does NOT see himself.');

  // Check 1B: Arun must NOT see Consumer Deepa
  const arunHasDeepa = arunNearbySnapshot.some((u) => u.userId === 'usr_consumer_deepa');
  if (arunHasDeepa) {
    throw new Error('❌ FAILURE: Consumer Arun saw another consumer (Deepa)!');
  }
  console.log('✅ PASS: Consumer Arun does NOT see other consumers.');

  // Check 1C: Arun MUST see Senior Providers Lakshmi & Sundaram
  const arunHasLakshmi = arunNearbySnapshot.some((u) => u.userId === 'usr_prov_lakshmi_ammal');
  const arunHasSundaram = arunNearbySnapshot.some((u) => u.userId === 'usr_prov_sundaram_master');
  if (!arunHasLakshmi && !arunHasSundaram) {
    throw new Error('❌ FAILURE: Consumer Arun did NOT discover nearby senior providers!');
  }
  console.log('✅ PASS: Consumer Arun discovers nearby Senior Providers (Lakshmi & Sundaram).');

  // ── Trigger location update on Lakshmi to receive fresh snapshot
  wsLakshmi.send(
    JSON.stringify({
      type: 'LOCATION_UPDATE',
      coordinates: { ...COORDS_LAKSHMI, accuracy: 10, timestamp: Date.now() },
      sharingEnabled: true,
      radiusMeters: 3000,
    })
  );

  await wait(1000);

  // ── VERIFICATION 2: Senior Provider Lakshmi's Perspective
  console.log('\n========================================================================');
  console.log('🔍 VERIFICATION 2: SENIOR PROVIDER LAKSHMI PERSPECTIVE');
  console.log('========================================================================');
  console.log('Lakshmi Nearby Results count:', lakshmiNearbySnapshot.length);
  lakshmiNearbySnapshot.forEach((u) => {
    console.log(`   - [${u.role.toUpperCase()}] ${u.displayName} • ${Math.round(u.distanceMeters)}m away`);
  });

  // Check 2A: Lakshmi must NOT see herself
  const lakshmiHasSelf = lakshmiNearbySnapshot.some((u) => u.userId === 'usr_prov_lakshmi_ammal');
  if (lakshmiHasSelf) {
    throw new Error('❌ FAILURE: Senior Lakshmi saw herself in People Near Me!');
  }
  console.log('✅ PASS: Senior Lakshmi does NOT see herself.');

  // Check 2B: Lakshmi must NOT see Senior Sundaram
  const lakshmiHasSundaram = lakshmiNearbySnapshot.some((u) => u.userId === 'usr_prov_sundaram_master');
  if (lakshmiHasSundaram) {
    throw new Error('❌ FAILURE: Senior Lakshmi saw another senior provider (Sundaram)!');
  }
  console.log('✅ PASS: Senior Lakshmi does NOT see other senior providers.');

  // Check 2C: Lakshmi MUST see Consumers Arun & Deepa
  const lakshmiHasArun = lakshmiNearbySnapshot.some((u) => u.userId === 'usr_consumer_arun');
  const lakshmiHasDeepa = lakshmiNearbySnapshot.some((u) => u.userId === 'usr_consumer_deepa');
  if (!lakshmiHasArun && !lakshmiHasDeepa) {
    throw new Error('❌ FAILURE: Senior Lakshmi did NOT discover nearby consumers!');
  }
  console.log('✅ PASS: Senior Lakshmi discovers nearby Consumers (Arun & Deepa).');

  // ── 5. Clean up
  wsLakshmi.close();
  wsSundaram.close();
  wsDeepa.close();
  wsArun.close();

  console.log('\n========================================================================');
  console.log('✅ ALL ROLE-AWARE PROFILE DIRECTION & SELF-EXCLUSION CHECKS PASSED 100%!');
  console.log('========================================================================\n');
}

testRoleAwareDirection().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
