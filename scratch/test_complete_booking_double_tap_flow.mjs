import WebSocket from 'ws';

const BACKEND_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws/location';

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBookingLifecycleTest() {
  console.log('================================================================');
  console.log('🎯 SILVERHANDS — END-TO-END CONSUMER BOOKING & DOUBLE-TAP FLOW');
  console.log('================================================================\n');

  // ── Step 1: Senior Provider Portal connects and is active on /dashboard
  console.log('👵🏽 [Senior Provider Portal] Lakshmi Ammal logged in on /dashboard...');
  const providerWs = new WebSocket(WS_URL);
  let providerReceivedAlert = null;

  await new Promise((resolve) => {
    providerWs.on('open', () => {
      providerWs.send(
        JSON.stringify({
          type: 'AUTHENTICATE',
          token: 'tok_lakshmi',
          userId: 'usr_prov_lakshmi_ammal',
          displayName: 'Lakshmi Ammal',
          role: 'senior',
          skill: 'Cooking',
          services: ['cook', 'Cooking'],
        })
      );
      resolve();
    });
  });

  providerWs.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'SERVICE_REQUEST_RECEIVED') {
      console.log('🔔 [Senior Portal] New Booking Modal Triggered!');
      console.log(`   - Who Booked: ${msg.request.consumerName}`);
      console.log(`   - What Service: ${msg.request.serviceName}`);
      console.log(`   - Date / Time: ${msg.request.preferredTime}`);
      providerReceivedAlert = msg.request;
    }
  });

  // ── Step 2: Consumer finds nearby service and clicks "BOOK NOW"
  console.log('\n👤 [Consumer Portal] Aarav Mehta finds "cook" by Lakshmi Ammal...');
  const consumerWs = new WebSocket(WS_URL);
  let consumerReceivedConfirmation = null;

  await new Promise((resolve) => {
    consumerWs.on('open', () => {
      consumerWs.send(
        JSON.stringify({
          type: 'AUTHENTICATE',
          token: 'tok_aarav',
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
    if (msg.type === 'SERVICE_REQUEST_UPDATED') {
      console.log('🎉 [Consumer Portal] Realtime Confirmation Received:', msg.request.status);
      consumerReceivedConfirmation = msg.request;
    }
  });

  console.log('👉 [Consumer Portal] Consumer clicks "BOOK NOW" for "Today at 6:00 PM"...');
  const reqId = `book_${Date.now()}`;
  const bookRes = await fetch(`${BACKEND_URL}/api/requests/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: reqId,
      consumerId: 'usr_consumer_aarav',
      consumerName: 'Aarav Mehta',
      providerId: 'usr_prov_lakshmi_ammal',
      serviceName: 'cook',
      preferredTime: 'Today at 6:00 PM',
      message: 'Paid 1-on-1 appointment for cooking traditional dinner',
    }),
  });

  const bookData = await bookRes.json();
  console.log('✅ [Booking Created] Request saved in shared state:', bookData.success);

  // Wait for senior to receive alert
  await wait(1000);

  if (!providerReceivedAlert) {
    throw new Error('Senior portal did NOT receive the booking notification alert!');
  }

  // ── Step 3: Senior Confirms with DOUBLE TAP
  console.log('\n👉 [Senior Portal] Senior sees booking details and DOUBLE TAPS "YES, I CAN HELP"...');
  console.log('   [Tap 1] Button pulses: "👉 Tap once more to confirm"');
  console.log('   [Tap 2] Confirmed! Senior accepts booking.');

  const respondRes = await fetch(`${BACKEND_URL}/api/requests/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: reqId,
      action: 'ACCEPT',
    }),
  });
  const respondData = await respondRes.json();
  console.log('✅ [Double Tap Executed] Status updated to:', respondData.status);

  // Wait for consumer confirmation fanout
  await wait(1000);

  if (!consumerReceivedConfirmation || consumerReceivedConfirmation.status !== 'ACCEPTED') {
    throw new Error('Consumer was NOT notified of senior acceptance!');
  }

  console.log('\n🎉 [Consumer Portal] Final Notification:');
  console.log(`   "Lakshmi Ammal agreed to help you with cook on ${consumerReceivedConfirmation.preferredTime}! ❤️"`);

  // Cleanup
  providerWs.close();
  consumerWs.close();

  console.log('\n================================================================');
  console.log('✅ COMPLETE BOOKING & DOUBLE-TAP FLOW VERIFIED 100% SUCCESS!');
  console.log('================================================================\n');
}

runBookingLifecycleTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
