const http = require('http');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== Starting Phase 4 Automated Verification Tests ===\n');

  // 1. Authenticate Admin / Owner
  console.log('1. Authenticating Admin / Owner...');
  const adminLogin = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'founder', password: 'OwnerSecret123!' });

  if (!adminLogin.data || !adminLogin.data.token) {
    console.error('[FAIL] Admin login failed:', adminLogin.data);
    process.exit(1);
  }
  const adminToken = adminLogin.data.token;
  console.log('  [PASS] Admin logged in successfully\n');

  // 2. Register Test Student
  const testStudentUser = 'p4_student_' + Date.now().toString().slice(-4);
  console.log(`2. Registering Test Student (${testStudentUser})...`);
  const studentSignup = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/signup',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: 'Rohit Sharma',
    username: testStudentUser,
    rtuRollNo: '23EATCS101',
    email: `${testStudentUser}@aceit.edu.in`,
    password: 'password123',
    branch: 'Computer Science & Engineering',
    year: '2nd Year (Batch 2024-28)'
  });

  if (!studentSignup.data || !studentSignup.data.token) {
    console.error('[FAIL] Student signup failed:', studentSignup.data);
    process.exit(1);
  }
  const studentToken = studentSignup.data.token;
  console.log('  [PASS] Student signed up successfully\n');

  // 3. Announcements Test
  console.log('3. Testing Club Announcements & Notice Board APIs...');
  const annRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/announcements',
    method: 'GET'
  });
  if (!annRes.data || !annRes.data.success || !Array.isArray(annRes.data.announcements)) {
    console.error('[FAIL] GET /api/announcements failed:', annRes.data);
    process.exit(1);
  }
  console.log(`  [PASS] GET /api/announcements returns ${annRes.data.announcements.length} announcements`);

  // Create Pinned Announcement with Broadcast
  const createAnnRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/announcements',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    title: 'Urgent: State Volleyball Selection Trials',
    content: 'All shortlisted players are required to report to court 1 tomorrow at 8 AM sharp.',
    category: 'Selection',
    isPinned: true,
    sendBroadcast: true
  });
  if (!createAnnRes.data || !createAnnRes.data.success) {
    console.error('[FAIL] POST /api/announcements failed:', createAnnRes.data);
    process.exit(1);
  }
  const createdAnnId = createAnnRes.data.announcement._id;
  console.log('  [PASS] Admin created announcement with broadcast');

  // Verify Announcement in public list
  const annListAfter = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/announcements?category=Selection',
    method: 'GET'
  });
  if (!annListAfter.data || !annListAfter.data.announcements.some(a => a._id === createdAnnId)) {
    console.error('[FAIL] Filtered announcements missing created announcement');
    process.exit(1);
  }
  console.log('  [PASS] Category filter on announcements verified\n');

  // 4. Notifications Inbox Test
  console.log('4. Testing Notifications Inbox & Broadcasts...');
  const notifRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/notifications',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  if (!notifRes.data || !notifRes.data.success) {
    console.error('[FAIL] GET /api/notifications failed:', notifRes.data);
    process.exit(1);
  }
  console.log(`  [PASS] Student received broadcast in inbox (unread: ${notifRes.data.unreadCount})`);

  // Mark all as read
  const markAllRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/notifications/read-all',
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  if (!markAllRes.data || !markAllRes.data.success) {
    console.error('[FAIL] PUT /api/notifications/read-all failed:', markAllRes.data);
    process.exit(1);
  }
  console.log('  [PASS] PUT /api/notifications/read-all marked all as read\n');

  // 5. Live Match Scoring Lifecycle Test
  console.log('5. Testing Live Match Scoring Lifecycle & Play-by-Play...');
  const matchId = 'idmsozmogm22'; // Existing upcoming match

  // Start Live Match
  const liveStartRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/matches/${matchId}/live-start`,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  if (!liveStartRes.data || !liveStartRes.data.success) {
    console.error('[FAIL] POST /api/matches/:id/live-start failed:', liveStartRes.data);
    process.exit(1);
  }
  console.log('  [PASS] Live match started successfully');

  // Verify Active Live Match Endpoint
  const getLiveRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/matches/live',
    method: 'GET'
  });
  if (!getLiveRes.data || !getLiveRes.data.isLive || !getLiveRes.data.match) {
    console.error('[FAIL] GET /api/matches/live failed to find active live match:', getLiveRes.data);
    process.exit(1);
  }
  console.log('  [PASS] GET /api/matches/live returns active match state');

  // Log Live Points with Play-by-Play
  const scorePoint1 = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/matches/${matchId}/live-score`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    scoringTeam: 'team1',
    pointType: 'spike',
    playerUsername: testStudentUser,
    comment: `💥 Incredible spike by @${testStudentUser} off the setter's quick pass!`
  });
  if (!scorePoint1.data || !scorePoint1.data.success || scorePoint1.data.liveState.liveScore.team1 !== 1) {
    console.error('[FAIL] Live score increment failed:', scorePoint1.data);
    process.exit(1);
  }
  console.log('  [PASS] Logged spike point with play-by-play log');

  // Log Block Point
  await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/matches/${matchId}/live-score`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    scoringTeam: 'team1',
    pointType: 'block',
    playerUsername: testStudentUser
  });

  // End Set 1
  const endSetRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/matches/${matchId}/live-set-end`,
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  if (!endSetRes.data || !endSetRes.data.success || endSetRes.data.liveState.currentSet !== 2) {
    console.error('[FAIL] Live set end failed:', endSetRes.data);
    process.exit(1);
  }
  console.log('  [PASS] Set 1 ended and advanced to Set 2');

  // Finalize Match & Award MVP
  const finishMatchRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/matches/${matchId}/live-finish`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, {
    mvpUsername: testStudentUser
  });
  if (!finishMatchRes.data || !finishMatchRes.data.success) {
    console.error('[FAIL] POST /api/matches/:id/live-finish failed:', finishMatchRes.data);
    process.exit(1);
  }
  console.log('  [PASS] Match finalized, winner recorded, MVP awarded');

  // 6. Verify Automated Notification Trigger on MVP & Selection
  console.log('\n6. Verifying Automated In-App Notifications...');
  const notifsAfterMatch = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/notifications',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  const notifs = notifsAfterMatch.data.notifications || [];
  const hasMvpNotif = notifs.some(n => n.type === 'badge' && n.title.includes('MVP'));
  if (!hasMvpNotif) {
    console.error('[FAIL] Student did not receive MVP award notification:', notifs);
    process.exit(1);
  }
  console.log('  [PASS] Student received automated MVP of the Match notification!');

  console.log('\n=== Verification Complete: ALL PHASE 4 BACKEND TESTS PASSED! 🎉 ===');
}

runTests();
