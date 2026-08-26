const http = require('http');

function req(options, postData) {
  return new Promise((resolve, reject) => {
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    r.on('error', reject);
    if (postData) {
      r.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    r.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log('UNIVERSAL SINGLE-ID STUDENT ACCOUNT & MULTI-CLUB TEST');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, desc) {
    if (condition) {
      console.log(`  ✓ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. Create Universal Student Account with Selected Club (Kabaddi)
  console.log('[1] Universal Student Account Registration');
  const testStudent = {
    name: 'Rohit Kumar',
    username: 'rohit_k_' + Date.now().toString().slice(-4),
    rtuRollNo: '23EATCS199',
    email: 'rohit_' + Date.now().toString().slice(-4) + '@aceit.edu.in',
    mobile: '9876543299',
    password: 'UniversalPass123!',
    branch: 'Computer Science & Engineering',
    year: '2nd Year (Batch 2024-28)',
    clubId: 'kabaddi',
    clubs: ['kabaddi']
  };

  const signupRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/signup',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, testStudent);

  assert(signupRes.status === 200 && signupRes.body.token, 'Universal student registration successful');
  assert(signupRes.body.user.role === 'STUDENT', 'User role is STUDENT');
  assert(signupRes.body.user.clubId === 'kabaddi', 'Primary club is assigned to selected club (Kabaddi)');
  assert(Array.isArray(signupRes.body.user.clubs) && signupRes.body.user.clubs.includes('kabaddi'), 'User clubs array initialized with Kabaddi');

  const studentToken = signupRes.body.token;

  // 2. Universal Sign In by Username
  console.log('\n[2] Universal Sign In by Username');
  const loginUserRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: testStudent.username, password: testStudent.password });

  assert(loginUserRes.status === 200 && loginUserRes.body.token, 'Sign in via username successful without club-specific password');

  // 3. Universal Sign In by Email
  console.log('\n[3] Universal Sign In by Email');
  const loginEmailRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: testStudent.email, password: testStudent.password });

  assert(loginEmailRes.status === 200 && loginEmailRes.body.token, 'Sign in via email successful');

  // 4. Verify Single Session Across All Club Pages
  console.log('\n[4] Shared Session Verification Across Club Scopes');
  const meResSpikers = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/me?clubId=spikers',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(meResSpikers.status === 200 && meResSpikers.body.user && meResSpikers.body.user.username === testStudent.username, 'Session valid on Spikers club scope');

  const meResDunkers = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/me?clubId=dunkers',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(meResDunkers.status === 200 && meResDunkers.body.user && meResDunkers.body.user.username === testStudent.username, 'Session valid on Dunkers Basketball club scope');

  const meResKabaddi = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/me?clubId=kabaddi',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${studentToken}` }
  });
  assert(meResKabaddi.status === 200 && meResKabaddi.body.user && meResKabaddi.body.user.username === testStudent.username, 'Session valid on Kabaddi club scope');

  // 5. One-Click Join Multiple Other Clubs with Single ID
  console.log('\n[5] One-Click Multi-Club Affiliation with Single ID');
  const joinDunkers = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/profile/clubs/join',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentToken}`
    }
  }, { clubSlug: 'dunkers' });

  assert(joinDunkers.status === 200 && joinDunkers.body.success, 'Joined Dunkers Basketball with 1 click');
  assert(joinDunkers.body.clubs.includes('dunkers') && joinDunkers.body.clubs.includes('kabaddi'), 'User profile now contains both Kabaddi and Dunkers');

  const joinSpikers = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/profile/clubs/join',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${studentToken}`
    }
  }, { clubSlug: 'spikers' });

  assert(joinSpikers.status === 200 && joinSpikers.body.success, 'Joined Spikers Volleyball with 1 click');
  assert(joinSpikers.body.clubs.includes('spikers'), 'User profile contains all 3 clubs seamlessly');

  // 6. Verify HTML Sign Up & Club Selector
  console.log('\n[6] HTML Sign Up & Universal Account Verification');
  const htmlRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/',
    method: 'GET'
  });
  assert(htmlRes.status === 200, 'Served public page');
  assert(htmlRes.body.includes('id="signUpClub"'), 'HTML contains Primary Sports Club selector in Sign Up modal');
  assert(htmlRes.body.includes('Universal Student ID'), 'HTML includes Universal Student ID helper explanation');

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
