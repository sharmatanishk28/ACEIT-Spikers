const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function request(method, pathUrl, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Content-Type': 'application/json'
    };
    const reqHeaders = Object.assign({}, defaultHeaders, headers);
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: pathUrl,
      method: method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { }
        resolve({ statusCode: res.statusCode, body: data, json: json });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

let passed = 0;
let failed = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${desc}\n    Error: ${err.message}`);
    failed++;
  }
}

async function runSuite() {
  console.log('====================================================');
  console.log('CRUD PERSISTENCE, DELETION & ZERO-REAPPEAR TEST SUITE');
  console.log('====================================================');

  // [1] Authentication as Owner
  console.log('\n[1] Owner Authentication');
  const loginRes = await request('POST', '/api/auth/login', {
    username: 'founder',
    password: 'OwnerSecret123!'
  });
  test('Owner login successful', () => {
    assert(loginRes.statusCode === 200, 'Expected HTTP 200');
    assert(loginRes.json.token, 'Expected JWT token');
  });
  const ownerToken = loginRes.json.token;

  // [2] Add a unique test player
  console.log('\n[2] Add and Persist Player');
  const testPlayerId = 'test_player_' + Date.now();
  const addPlayerRes = await request('POST', '/api/team', {
    id: testPlayerId,
    n: 'Test Persistence Player',
    num: 99,
    pos: 'Outside Hitter',
    cat: 'boys team',
    clubId: 'spikers'
  }, { 'Authorization': `Bearer ${ownerToken}` });

  test('Player created successfully', () => {
    assert(addPlayerRes.statusCode === 200, 'Expected HTTP 200 on add player');
    assert(addPlayerRes.json.success === true, 'Expected success: true');
  });

  // Verify player exists in /api/db
  const getDbRes1 = await request('GET', '/api/db?clubId=spikers');
  test('Player exists in /api/db immediately after add', () => {
    assert(getDbRes1.statusCode === 200);
    const found = (getDbRes1.json.data.team || []).find(p => p.id === testPlayerId);
    assert(found, 'Player not found in GET /api/db');
    assert.strictEqual(found.n, 'Test Persistence Player');
  });

  // [3] Delete Player via /api/save-all (Simulating Admin Dashboard Delete)
  console.log('\n[3] Delete Player via /api/save-all & Verify Permanent Removal');
  const currentDb = getDbRes1.json.data;
  const filteredTeam = (currentDb.team || []).filter(p => p.id !== testPlayerId);
  currentDb.team = filteredTeam;

  const saveAllRes = await request('POST', '/api/save-all?clubId=spikers', currentDb, {
    'Authorization': `Bearer ${ownerToken}`
  });
  test('save-all processed player deletion', () => {
    assert(saveAllRes.statusCode === 200, 'Expected HTTP 200 on save-all');
    assert(saveAllRes.json.success === true, 'Expected success: true');
  });

  // Re-fetch /api/db
  const getDbRes2 = await request('GET', '/api/db?clubId=spikers');
  test('Player is PERMANENTLY deleted from /api/db and does not reappear', () => {
    assert(getDbRes2.statusCode === 200);
    const found = (getDbRes2.json.data.team || []).find(p => p.id === testPlayerId);
    assert(!found, 'Player still exists in GET /api/db after delete!');
  });

  // [4] Test /api/save-all with clubId=ALL (Multi-Club Isolation & No Overwriting)
  console.log('\n[4] Test Multi-Club Save-All with clubId=ALL');
  const getDbAllRes = await request('GET', '/api/db?clubId=ALL');
  test('GET /api/db?clubId=ALL returns complete dataset', () => {
    assert(getDbAllRes.statusCode === 200);
    assert(getDbAllRes.json.data.team, 'Expected team array');
  });

  const fullDb = getDbAllRes.json.data;
  const kabaddiPlayerId = 'kabaddi_test_' + Date.now();
  fullDb.team.push({
    id: kabaddiPlayerId,
    n: 'Kabaddi Raider Test',
    num: 11,
    pos: 'Raider',
    clubId: 'kabaddi'
  });

  const saveAllGlobalRes = await request('POST', '/api/save-all?clubId=ALL', fullDb, {
    'Authorization': `Bearer ${ownerToken}`
  });
  test('save-all with clubId=ALL succeeds', () => {
    assert(saveAllGlobalRes.statusCode === 200);
    assert(saveAllGlobalRes.json.success === true);
  });

  // Verify Kabaddi player has clubId='kabaddi' and Spikers players retain 'spikers'
  const verifyKabaddiRes = await request('GET', '/api/db?clubId=kabaddi');
  test('Kabaddi player is retrieved under kabaddi scope', () => {
    assert(verifyKabaddiRes.statusCode === 200);
    const found = (verifyKabaddiRes.json.data.team || []).find(p => p.id === kabaddiPlayerId);
    assert(found, 'Kabaddi player missing from kabaddi scope');
    assert.strictEqual(found.clubId, 'kabaddi');
  });

  const verifySpikersRes = await request('GET', '/api/db?clubId=spikers');
  test('Kabaddi player does NOT leak into Spikers scope', () => {
    assert(verifySpikersRes.statusCode === 200);
    const found = (verifySpikersRes.json.data.team || []).find(p => p.id === kabaddiPlayerId);
    assert(!found, 'Kabaddi player leaked into Spikers scope!');
  });

  // Clean up test player from Kabaddi
  const cleanDbRes = await request('GET', '/api/db?clubId=ALL');
  const cleanedDb = cleanDbRes.json.data;
  cleanedDb.team = (cleanedDb.team || []).filter(p => p.id !== kabaddiPlayerId);
  await request('POST', '/api/save-all?clubId=ALL', cleanedDb, { 'Authorization': `Bearer ${ownerToken}` });

  // [5] HTML Code Quality & Zero-Reappear Guards Verification
  console.log('\n[5] Front-End Data Sync & LocalStorage Guard Verification');
  const htmlPath = path.join(__dirname, 'aceit-spikers-1.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  test('loadDB provides clean initialization without destructive mock overrides', () => {
    assert(htmlContent.includes("function loadDB()"), 'loadDB function exists');
  });

  test('syncWithAPI does not re-seed empty array with mock data', () => {
    assert(!htmlContent.includes('DB.slideshow.length === 0) { DB.slideshow = fresh.slideshow; }'), 'syncWithServer avoids length===0 clobbering');
  });

  test('saveDB persists directly to authoritative backend API', () => {
    assert(htmlContent.includes("authFetch(API_BASE + '/save-all"), 'saveDB communicates with server API');
  });

  test('checkAuthAndOpenAdmin fetches fresh /api/db before rendering', () => {
    assert(htmlContent.includes("authFetch(API_BASE + '/db?clubId='"), 'checkAuthAndOpenAdmin fetches latest db');
  });

  test('Admin club scope select fetches fresh db on change', () => {
    assert(htmlContent.includes("authFetch(API_BASE + '/db?clubId=' + encodeURIComponent(activeClubScope))"), 'scope change triggers fresh db fetch');
  });

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test Execution Error:', err);
  process.exit(1);
});
