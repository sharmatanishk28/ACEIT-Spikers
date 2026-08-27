const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(method, path, data, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
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
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING COMPREHENSIVE MULTI-CLUB & CRUD TEST SUITE');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // TEST 1: Universal Central Login (Owner & Default accounts)
  // ----------------------------------------------------
  console.log('Test 1: Universal Central Login');
  const ownerLoginRes = await request('POST', '/api/auth/login', {
    username: 'owner',
    password: process.env.ADMIN_PIN || '2026'
  });
  assert(ownerLoginRes.status === 200 && ownerLoginRes.body.success, 'Owner login with username succeeded');
  assert(!!ownerLoginRes.body.token, 'Owner JWT token received');
  const ownerToken = ownerLoginRes.body.token;
  const ownerHeaders = { 'Authorization': `Bearer ${ownerToken}` };

  // Test case-insensitive login with username uppercase
  const ownerUpperRes = await request('POST', '/api/auth/login', {
    username: 'OWNER',
    password: process.env.ADMIN_PIN || '2026'
  });
  assert(ownerUpperRes.status === 200 && ownerUpperRes.body.success, 'Owner login with uppercase OWNER succeeded');

  // ----------------------------------------------------
  // TEST 2: User CRUD
  // ----------------------------------------------------
  console.log('\nTest 2: User CRUD (Create, Login, Edit, Verify No Duplicates, Delete)');
  const testUsername = 'test_coord_' + Date.now();
  const testEmail = `${testUsername}@aceit.edu.in`;
  const testRoll = '22EAT' + Math.floor(1000 + Math.random() * 9000);

  // 2a. Create Coordinator user assigned to Cricket club
  const createRes = await request('POST', '/api/users', {
    name: 'Cricket Coordinator',
    username: testUsername,
    email: testEmail,
    rtuRollNo: testRoll,
    password: 'password123',
    role: 'ADMIN',
    clubId: 'cricket',
    clubs: ['cricket'],
    permissions: ['players.*', 'matches.*', 'news.*', 'events.*']
  }, ownerHeaders);

  assert(createRes.status === 200 && createRes.body.success, `Created user '${testUsername}' successfully`);
  const createdUserId = createRes.body.user._id || createRes.body.user.id;
  assert(!!createdUserId, `Received user ID: ${createdUserId}`);

  // 2b. Immediately login with the new user using username
  const newLoginUserRes = await request('POST', '/api/auth/login', {
    username: testUsername,
    password: 'password123'
  });
  assert(newLoginUserRes.status === 200 && newLoginUserRes.body.success, 'New user can immediately log in with username');
  const coordToken = newLoginUserRes.body.token;
  const coordHeaders = { 'Authorization': `Bearer ${coordToken}` };

  // 2c. Immediately login with the new user using email
  const newLoginEmailRes = await request('POST', '/api/auth/login', {
    username: testEmail,
    password: 'password123'
  });
  assert(newLoginEmailRes.status === 200 && newLoginEmailRes.body.success, 'New user can log in with email');

  // 2d. Immediately login with the new user using RTU Roll No
  const newLoginRollRes = await request('POST', '/api/auth/login', {
    username: testRoll,
    password: 'password123'
  });
  assert(newLoginRollRes.status === 200 && newLoginRollRes.body.success, 'New user can log in with RTU Roll No');

  // 2e. Edit User: Update name & position, verify NO duplicate record created
  const editUserRes = await request('PUT', `/api/users/${createdUserId}`, {
    name: 'Cricket Senior Coordinator',
    position: 'All-Rounder Captain',
    jerseyNo: '18'
  }, ownerHeaders);
  assert(editUserRes.status === 200 && editUserRes.body.success, 'User record updated successfully');
  assert(editUserRes.body.user.name === 'Cricket Senior Coordinator', 'User name properly updated');

  // Verify user count: ensure exactly 1 record for this username
  const listUsersRes = await request('GET', '/api/users', null, ownerHeaders);
  assert(listUsersRes.status === 200 && listUsersRes.body.success, 'Listed users');
  const matchingUsers = (listUsersRes.body.users || []).filter(u => u.username === testUsername);
  assert(matchingUsers.length === 1, `Exactly 1 record exists for username '${testUsername}' (No duplicates)`);

  // ----------------------------------------------------
  // TEST 3: Club Permissions & Access Security
  // ----------------------------------------------------
  console.log('\nTest 3: Club Permissions & Access Security');
  // Coordinator is assigned to 'cricket'.
  // Attempting to add a player to 'spikers' (Volleyball) should be FORBIDDEN (403)
  const forbiddenPlayerRes = await request('POST', '/api/team?clubId=spikers', {
    n: 'Forbidden Player',
    pos: 'Setter',
    clubId: 'spikers'
  }, coordHeaders);
  assert(forbiddenPlayerRes.status === 403, 'Cricket Coordinator correctly denied adding player to Volleyball (spikers)');

  // Attempting to add a player to 'cricket' should SUCCEED (200)
  const cricketPlayerRes = await request('POST', '/api/team?clubId=cricket', {
    n: 'Virat Rajput',
    pos: 'Top-Order Batsman',
    num: '18',
    clubId: 'cricket',
    cats: ['cricket squad']
  }, coordHeaders);
  assert(cricketPlayerRes.status === 200 && cricketPlayerRes.body.success, 'Cricket Coordinator successfully added player to Cricket');
  const cricketPlayerId = cricketPlayerRes.body.player.id;

  // ----------------------------------------------------
  // TEST 4: Player & Content CRUD across Clubs & Data Isolation
  // ----------------------------------------------------
  console.log('\nTest 4: Player & Content CRUD across Clubs & Data Isolation');

  // Add player to Volleyball as Owner
  const volleyPlayerRes = await request('POST', '/api/team?clubId=spikers', {
    n: 'Harsh Vardhan',
    pos: 'Middle Blocker',
    num: '7',
    clubId: 'spikers',
    cats: ['boys team']
  }, ownerHeaders);
  assert(volleyPlayerRes.status === 200 && volleyPlayerRes.body.success, 'Added Volleyball player');
  const volleyPlayerId = volleyPlayerRes.body.player.id;

  // Add player to Kabaddi as Owner
  const kabaddiPlayerRes = await request('POST', '/api/team?clubId=kabaddi', {
    n: 'Pardeep Narwal ACE',
    pos: 'Lead Raider',
    num: '9',
    clubId: 'kabaddi',
    cats: ['raiders']
  }, ownerHeaders);
  assert(kabaddiPlayerRes.status === 200 && kabaddiPlayerRes.body.success, 'Added Kabaddi player');
  const kabaddiPlayerId = kabaddiPlayerRes.body.player.id;

  // Edit Cricket Player by ID
  const editPlayerRes = await request('PUT', `/api/team/${cricketPlayerId}`, {
    n: 'Virat Rajput (Captain)',
    pos: 'Opening Batsman',
    num: '18',
    clubId: 'cricket'
  }, coordHeaders);
  assert(editPlayerRes.status === 200 && editPlayerRes.body.success, 'Edited Cricket player by database ID');
  assert(editPlayerRes.body.player.n === 'Virat Rajput (Captain)', 'Player name updated');

  // Verify Data Isolation:
  // Query Volleyball team: must contain Volleyball player, but NOT Cricket or Kabaddi players
  const getVolleyTeam = await request('GET', '/api/team?clubId=spikers');
  const vPlayers = getVolleyTeam.body.team || [];
  assert(vPlayers.some(p => p.id === volleyPlayerId), 'Volleyball dataset contains Volleyball player');
  assert(!vPlayers.some(p => p.id === cricketPlayerId), 'Volleyball dataset DOES NOT leak Cricket player');
  assert(!vPlayers.some(p => p.id === kabaddiPlayerId), 'Volleyball dataset DOES NOT leak Kabaddi player');

  // Query Cricket team: must contain Cricket player, but NOT Volleyball or Kabaddi
  const getCricketTeam = await request('GET', '/api/team?clubId=cricket');
  const cPlayers = getCricketTeam.body.team || [];
  assert(cPlayers.some(p => p.id === cricketPlayerId), 'Cricket dataset contains Cricket player');
  assert(!cPlayers.some(p => p.id === volleyPlayerId), 'Cricket dataset DOES NOT leak Volleyball player');

  // Query Kabaddi team: must contain Kabaddi player
  const getKabaddiTeam = await request('GET', '/api/team?clubId=kabaddi');
  const kPlayers = getKabaddiTeam.body.team || [];
  assert(kPlayers.some(p => p.id === kabaddiPlayerId), 'Kabaddi dataset contains Kabaddi player');

  // Delete Cricket player by database ID
  const delCricketPlayer = await request('DELETE', `/api/team/${cricketPlayerId}`, null, coordHeaders);
  assert(delCricketPlayer.status === 200 && delCricketPlayer.body.success, 'Deleted Cricket player by database ID');

  // Delete Volleyball player by database ID
  const delVolleyPlayer = await request('DELETE', `/api/team/${volleyPlayerId}`, null, ownerHeaders);
  assert(delVolleyPlayer.status === 200 && delVolleyPlayer.body.success, 'Deleted Volleyball player by database ID');

  // Delete Kabaddi player by database ID
  const delKabaddiPlayer = await request('DELETE', `/api/team/${kabaddiPlayerId}`, null, ownerHeaders);
  assert(delKabaddiPlayer.status === 200 && delKabaddiPlayer.body.success, 'Deleted Kabaddi player by database ID');

  // ----------------------------------------------------
  // TEST 5: Routing & Public Club Pages
  // ----------------------------------------------------
  console.log('\nTest 5: Routing & Public Club Pages');
  const routes = ['/', '/club/spikers', '/club/kabaddi', '/club/cricket', '/club/dunkers'];
  for (const r of routes) {
    const pageRes = await request('GET', r);
    assert(pageRes.status === 200, `Route '${r}' returned HTTP 200`);
    assert(typeof pageRes.body === 'string' && pageRes.body.includes('<!DOCTYPE html>'), `Route '${r}' returned valid HTML page`);
  }

  // ----------------------------------------------------
  // TEST 6: Clean Up Test User
  // ----------------------------------------------------
  console.log('\nTest 6: User Deletion & Cleanup');
  const delUserRes = await request('DELETE', `/api/users/${createdUserId}`, null, ownerHeaders);
  assert(delUserRes.status === 200 && delUserRes.body.success, 'Deleted test user');

  // Verify user cannot log in after deletion
  const loginAfterDel = await request('POST', '/api/auth/login', {
    username: testUsername,
    password: 'password123'
  });
  assert(loginAfterDel.status === 401, 'Deleted user cannot log in (HTTP 401)');

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
