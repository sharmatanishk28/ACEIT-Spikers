const http = require('http');
const assert = require('assert');
const fs = require('fs');

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
        resolve({ statusCode: res.statusCode, body: data, json: json, headers: res.headers });
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
  console.log('PLAYER CRUD & ZERO DUPLICATION REGRESSION SUITE');
  console.log('====================================================');

  // [1] Login as Owner
  console.log('\n[1] Authentication as Owner');
  const loginRes = await request('POST', '/api/auth/login', {
    username: 'founder',
    password: 'OwnerSecret123!'
  });
  test('Owner login succeeds', () => {
    assert.strictEqual(loginRes.statusCode, 200);
    assert(loginRes.json.token, 'Token returned');
  });
  const ownerToken = loginRes.json.token;

  // [2] Fetch Database and Verify Scoped Isolation
  console.log('\n[2] Initial Database State & Scoped Fetch');
  const dbAllRes = await request('GET', '/api/db?clubId=ALL');
  test('GET /api/db?clubId=ALL returns valid database', () => {
    assert.strictEqual(dbAllRes.statusCode, 200);
    assert(Array.isArray(dbAllRes.json.data.team), 'team array exists');
  });

  const initialAllCount = dbAllRes.json.data.team.length;
  const initialSpikers = dbAllRes.json.data.team.filter(p => (p.clubId || 'spikers').toLowerCase() === 'spikers');
  const initialKabaddi = dbAllRes.json.data.team.filter(p => (p.clubId || '').toLowerCase() === 'kabaddi');

  console.log(`  Initial total players: ${initialAllCount} (Spikers: ${initialSpikers.length}, Kabaddi: ${initialKabaddi.length})`);

  // [3] Add a New Player in Kabaddi Scope
  console.log('\n[3] Adding a Player in Kabaddi Scope');
  const testPlayerId = 'test_kabaddi_player_' + Date.now();
  const newPlayer = {
    id: testPlayerId,
    n: 'Test Raider Star',
    no: '99',
    pos: 'Corner Defender',
    dept: 'Boys Team',
    ht: '6\'0"',
    exp: '2 yrs',
    role: 'Raider',
    clubId: 'kabaddi'
  };

  const kabaddiTeam = initialKabaddi.concat([newPlayer]);
  const saveKabaddiRes = await request('POST', '/api/save-all?clubId=kabaddi', {
    clubId: 'kabaddi',
    team: kabaddiTeam
  }, { 'Authorization': `Bearer ${ownerToken}` });

  test('POST /api/save-all?clubId=kabaddi succeeds', () => {
    assert.strictEqual(saveKabaddiRes.statusCode, 200);
    assert.strictEqual(saveKabaddiRes.json.success, true);
  });

  // [4] Verify Kabaddi has the player and Spikers count has NOT changed
  console.log('\n[4] Scoped Isolation & Zero Cross-Club Pollution');
  const checkAllRes = await request('GET', '/api/db?clubId=ALL');
  const updatedSpikers = checkAllRes.json.data.team.filter(p => (p.clubId || 'spikers').toLowerCase() === 'spikers');
  const updatedKabaddi = checkAllRes.json.data.team.filter(p => (p.clubId || '').toLowerCase() === 'kabaddi');

  test('Spikers player count remained untouched', () => {
    assert.strictEqual(updatedSpikers.length, initialSpikers.length);
  });

  test('Kabaddi player count incremented by exactly 1', () => {
    assert.strictEqual(updatedKabaddi.length, initialKabaddi.length + 1);
    assert(updatedKabaddi.some(p => p.id === testPlayerId), 'Test player found in Kabaddi');
  });

  // [5] Perform Multiple Consecutive Scoped Saves to Verify Zero Duplication
  console.log('\n[5] Stress Test: Consecutive Scoped Saves (Anti-Duplication)');
  for (let i = 0; i < 3; i++) {
    await request('POST', '/api/save-all?clubId=kabaddi', {
      clubId: 'kabaddi',
      team: updatedKabaddi
    }, { 'Authorization': `Bearer ${ownerToken}` });
  }

  const checkStressRes = await request('GET', '/api/db?clubId=ALL');
  const stressKabaddi = checkStressRes.json.data.team.filter(p => (p.clubId || '').toLowerCase() === 'kabaddi');
  const stressSpikers = checkStressRes.json.data.team.filter(p => (p.clubId || 'spikers').toLowerCase() === 'spikers');

  test('Consecutive saves produce ZERO duplicate entries in Kabaddi', () => {
    assert.strictEqual(stressKabaddi.length, initialKabaddi.length + 1);
  });

  test('Consecutive saves produce ZERO duplicate entries in Spikers', () => {
    assert.strictEqual(stressSpikers.length, initialSpikers.length);
  });

  // [6] Delete Player in Kabaddi Scope
  console.log('\n[6] Clean Deletion Without Resurrection');
  const remainingKabaddi = stressKabaddi.filter(p => p.id !== testPlayerId);
  const deleteSaveRes = await request('POST', '/api/save-all?clubId=kabaddi', {
    clubId: 'kabaddi',
    team: remainingKabaddi
  }, { 'Authorization': `Bearer ${ownerToken}` });

  test('POST /api/save-all after deletion succeeds', () => {
    assert.strictEqual(deleteSaveRes.statusCode, 200);
    assert.strictEqual(deleteSaveRes.json.success, true);
  });

  const finalCheckRes = await request('GET', '/api/db?clubId=ALL');
  const finalKabaddi = finalCheckRes.json.data.team.filter(p => (p.clubId || '').toLowerCase() === 'kabaddi');

  test('Deleted player is permanently removed (0 resurrection)', () => {
    assert.strictEqual(finalKabaddi.length, initialKabaddi.length);
    assert(!finalKabaddi.some(p => p.id === testPlayerId), 'Deleted player does not exist');
  });

  // [7] Verify Fail-Safe Fallback for Broken Images
  console.log('\n[7] Fail-Safe Image Fallback Rules in HTML');
  const htmlContent = fs.readFileSync('aceit-spikers-1.html', 'utf8');
  test('handleClubLogoError contains secondary SVG vector crest fallback', () => {
    assert(htmlContent.includes('img.onerror = function()'), 'Nested onerror fallback handler exists');
    assert(htmlContent.includes('getSportCrestSVG'), 'getSportCrestSVG called on second error');
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
