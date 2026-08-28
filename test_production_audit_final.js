const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(method, path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqHeaders = { ...headers };
    let bodyData = null;
    if (data !== null && data !== undefined) {
      bodyData = typeof data === 'string' ? data : JSON.stringify(data);
      reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyData);
    }
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: reqHeaders
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    failed++;
    failures.push(message);
  }
}

async function runProductionAudit() {
  console.log('================================================================');
  console.log('STARTING FINAL PRODUCTION AUDIT VERIFICATION SUITE');
  console.log('================================================================\n');

  // 1. Health & Performance Check
  console.log('[SECTION 1] HEALTH & PERFORMANCE CHECK');
  const t0 = Date.now();
  const healthRes = await request('GET', '/api/health');
  const healthTime = Date.now() - t0;
  assert(healthRes.status === 200, 'Health endpoint responds with HTTP 200');
  assert(healthTime < 500, `Health check latency sub-500ms (Actual: ${healthTime}ms)`);

  // Warmup request to establish Atlas connection
  await request('GET', '/api/db?clubId=spikers');

  const tDb0 = Date.now();
  const dbRes = await request('GET', '/api/db?clubId=spikers');
  const dbTime = Date.now() - tDb0;
  assert(dbRes.status === 200, 'GET /api/db?clubId=spikers returns HTTP 200');
  assert(dbTime < 1000, `/api/db warm response latency sub-1000ms (Actual: ${dbTime}ms)`);
  assert(dbRes.body.success === true, '/api/db returned valid JSON payload');

  // 2. Cloudinary Upload Endpoint
  console.log('\n[SECTION 2] CLOUDINARY UPLOAD PIPELINE');
  const sampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const uploadRes = await request('POST', '/api/upload', {
    image: sampleBase64,
    folder: 'audit_test'
  });
  assert(uploadRes.status === 200, 'POST /api/upload accepted image payload');
  assert(uploadRes.body.success === true, 'Upload API returned success = true');
  assert(Boolean(uploadRes.body.url), `Upload returned valid image URL: ${uploadRes.body.url.substr(0, 40)}...`);

  // 3. Owner & Staff Authentication
  console.log('\n[SECTION 3] AUTHENTICATION & GLOBAL SESSION');
  const loginRes = await request('POST', '/api/auth/login', {
    username: 'founder',
    password: 'OwnerSecret123!'
  });
  assert(loginRes.status === 200, 'Owner login succeeded');
  const token = loginRes.body.token;
  assert(Boolean(token), 'Valid JWT token returned');

  // Verify auth/me with Bearer token
  const meRes = await request('GET', '/api/auth/me', null, {
    'Authorization': `Bearer ${token}`
  });
  assert(meRes.status === 200, 'GET /api/auth/me with Bearer token returned HTTP 200');
  assert(meRes.body.authenticated === true, 'Session successfully verified');
  assert(meRes.body.user.role === 'OWNER', 'Owner role preserved in session');

  // 4. Student Universal Authentication across All Clubs
  console.log('\n[SECTION 4] UNIVERSAL STUDENT REGISTRATION & CROSS-CLUB ACCESS');
  const studentUsername = 'audit_student_' + Date.now().toString(36);
  const studentRollNo = 'RTU' + Math.floor(100000 + Math.random() * 900000);
  const studentEmail = `${studentUsername}@aceit.edu.in`;

  const signupRes = await request('POST', '/api/auth/signup', {
    name: 'Audit Student Athlete',
    username: studentUsername,
    rtuRollNo: studentRollNo,
    email: studentEmail,
    mobile: '9876543210',
    password: 'Password@123',
    clubId: 'kabaddi',
    clubs: ['kabaddi']
  });
  assert(signupRes.status === 200, 'Universal student registered successfully');
  const studentToken = signupRes.body.token;
  assert(Boolean(studentToken), 'Student received valid JWT token');

  // Sign in via Roll Number
  const rollLoginRes = await request('POST', '/api/auth/login', {
    username: studentRollNo,
    password: 'Password@123'
  });
  assert(rollLoginRes.status === 200, 'Student can sign in universally using RTU Roll Number');

  // Sign in via Email
  const emailLoginRes = await request('POST', '/api/auth/login', {
    username: studentEmail,
    password: 'Password@123'
  });
  assert(emailLoginRes.status === 200, 'Student can sign in universally using Email address');

  // 5. Multi-Club Data Isolation and Sport Alias Mapping
  console.log('\n[SECTION 5] MULTI-CLUB DATA ISOLATION & SPORT ALIAS RESOLUTION');
  const badmintonRes = await request('GET', '/api/clubs/badminton');
  assert(badmintonRes.status === 200, 'GET /api/clubs/badminton resolves canonical Badminton club (shuttlers)');
  assert(badmintonRes.body.club.sport.toLowerCase() === 'badminton', 'Club sport is Badminton');

  const footballRes = await request('GET', '/api/clubs/football');
  assert(footballRes.status === 200, 'GET /api/clubs/football resolves canonical Football club (strikers-fc)');

  const basketballRes = await request('GET', '/api/clubs/basketball');
  assert(basketballRes.status === 200, 'GET /api/clubs/basketball resolves canonical Basketball club (dunkers)');

  // 6. Non-Destructive Data Persistence Verification
  console.log('\n[SECTION 6] NON-DESTRUCTIVE CRUD & ZERO DATA LOSS');
  const newPlayerRes = await request('POST', '/api/team', {
    n: 'Audit Star Player',
    pos: 'Setter',
    h: '6ft 2in',
    exp: '3 Years',
    clubId: 'spikers',
    photo: sampleBase64
  }, { 'Authorization': `Bearer ${token}` });
  assert(newPlayerRes.status === 200, 'Added player to Volleyball club');
  const playerId = newPlayerRes.body.player?.id || newPlayerRes.body.team?.find(p => p.n === 'Audit Star Player')?.id;

  const getTeamRes = await request('GET', '/api/db?clubId=spikers');
  const savedPlayer = (getTeamRes.body.team || []).find(p => p.n === 'Audit Star Player');
  assert(Boolean(savedPlayer), 'Player exists in /api/db immediately');

  // Clean up test player
  if (savedPlayer) {
    const delRes = await request('DELETE', `/api/team/${savedPlayer.id}`, null, {
      'Authorization': `Bearer ${token}`,
      'x-club-id': 'spikers'
    });
    assert(delRes.status === 200, 'Cleaned up audit test player');
  }

  // 7. Direct Routes Delivery
  console.log('\n[SECTION 7] FRONTEND HTML SHELL & ROUTE DELIVERY');
  const routes = ['/', '/club/spikers', '/club/cricket', '/club/kabaddi', '/club/dunkers', '/club/shuttlers', '/club/strikers-fc'];
  for (const r of routes) {
    const pageRes = await request('GET', r);
    assert(pageRes.status === 200, `Route '${r}' returned HTTP 200`);
    assert(typeof pageRes.body === 'string' && pageRes.body.includes('<!DOCTYPE html>'), `Route '${r}' delivered valid HTML`);
  }

  console.log('\n================================================================');
  console.log(`AUDIT RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runProductionAudit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
