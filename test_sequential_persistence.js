const http = require('http');
const assert = require('assert');

function request(method, pathUrl, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = { 'Content-Type': 'application/json' };
    const reqHeaders = Object.assign({}, defaultHeaders, headers);
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    if (postData) reqHeaders['Content-Length'] = Buffer.byteLength(postData);

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

async function runVerification() {
  console.log('====================================================');
  console.log('SEQUENTIAL 6-PLAYER PERSISTENCE & MULTI-MODULE TEST');
  console.log('====================================================\n');

  // 1. Authenticate as Owner
  console.log('[Step 1] Owner Authentication');
  const loginRes = await request('POST', '/api/auth/login', {
    username: 'founder',
    password: 'OwnerSecret123!'
  });
  test('Owner login successful', () => {
    assert.strictEqual(loginRes.statusCode, 200);
    assert(loginRes.json && loginRes.json.token);
  });
  const token = loginRes.json.token;
  const authHeaders = { 'Authorization': `Bearer ${token}` };

  // 2. Fetch current baseline players
  const initialDbRes = await request('GET', '/api/db?clubId=spikers');
  const initialTeam = initialDbRes.json.data.team || [];
  console.log(`[Baseline] Current players in spikers: ${initialTeam.length}`);

  // 3. Sequentially create Player 1 through 6
  console.log('\n[Step 2] Sequentially Creating Players 1 through 6');
  const createdPlayerIds = [];
  for (let i = 1; i <= 6; i++) {
    const pId = `seq_player_${Date.now()}_${i}`;
    const pData = {
      id: pId,
      n: `Sequential Player ${i}`,
      num: 10 + i,
      pos: i % 2 === 0 ? 'Setter' : 'Outside Hitter',
      cat: 'boys team',
      clubId: 'spikers'
    };
    
    // Read current state, append, and save via /api/save-all (exactly like the frontend admin form)
    const freshDb = (await request('GET', '/api/db?clubId=spikers')).json.data;
    freshDb.team = freshDb.team || [];
    freshDb.team.push(pData);

    const saveRes = await request('POST', '/api/save-all?clubId=spikers', freshDb, authHeaders);
    test(`Player ${i} saved via /api/save-all`, () => {
      assert.strictEqual(saveRes.statusCode, 200);
      assert.strictEqual(saveRes.json.success, true);
    });

    createdPlayerIds.push(pId);

    // Verify all players created SO FAR still exist in database
    const verifyDb = (await request('GET', '/api/db?clubId=spikers')).json.data;
    const currentTeam = verifyDb.team || [];

    for (let j = 0; j < createdPlayerIds.length; j++) {
      const checkId = createdPlayerIds[j];
      const found = currentTeam.find(p => p.id === checkId);
      test(`After creating Player ${i}: Player ${j + 1} (${checkId}) is STILL PRESENT in MongoDB`, () => {
        assert(found, `CRITICAL BUG DETECTED: Player ${j + 1} disappeared after creating Player ${i}!`);
        assert.strictEqual(found.n, `Sequential Player ${j + 1}`);
      });
    }
  }

  // 4. Verify refreshing and editing Player 3
  console.log('\n[Step 3] Edit Player 3 and Verify Isolation');
  const editDb = (await request('GET', '/api/db?clubId=spikers')).json.data;
  const p3Idx = editDb.team.findIndex(p => p.id === createdPlayerIds[2]);
  editDb.team[p3Idx].n = 'Sequential Player 3 (EDITED)';
  editDb.team[p3Idx].pos = 'Captain Libero';
  
  const editSaveRes = await request('POST', '/api/save-all?clubId=spikers', editDb, authHeaders);
  test('Player 3 edited and saved', () => {
    assert.strictEqual(editSaveRes.statusCode, 200);
  });

  const verifyAfterEdit = (await request('GET', '/api/db?clubId=spikers')).json.data.team || [];
  test('Player 3 reflects new name & position', () => {
    const p3 = verifyAfterEdit.find(p => p.id === createdPlayerIds[2]);
    assert.strictEqual(p3.n, 'Sequential Player 3 (EDITED)');
    assert.strictEqual(p3.pos, 'Captain Libero');
  });

  test('Players 1, 2, 4, 5, 6 were NOT modified or dropped', () => {
    [0, 1, 3, 4, 5].forEach(idx => {
      const p = verifyAfterEdit.find(item => item.id === createdPlayerIds[idx]);
      assert(p, `Player ${idx + 1} missing!`);
      assert.strictEqual(p.n, `Sequential Player ${idx + 1}`);
    });
  });

  // 5. Delete Player 2 and verify only Player 2 is removed
  console.log('\n[Step 4] Delete Player 2 and Verify Remaining 5 Players');
  const deleteDb = (await request('GET', '/api/db?clubId=spikers')).json.data;
  deleteDb.team = deleteDb.team.filter(p => p.id !== createdPlayerIds[1]); // Remove player 2
  
  const delSaveRes = await request('POST', '/api/save-all?clubId=spikers', deleteDb, authHeaders);
  test('Player 2 deletion saved', () => {
    assert.strictEqual(delSaveRes.statusCode, 200);
  });

  const verifyAfterDel = (await request('GET', '/api/db?clubId=spikers')).json.data.team || [];
  test('Player 2 is PERMANENTLY deleted', () => {
    const p2 = verifyAfterDel.find(p => p.id === createdPlayerIds[1]);
    assert(!p2, 'Player 2 still exists after deletion!');
  });

  test('Players 1, 3, 4, 5, 6 remain intact in MongoDB', () => {
    [0, 2, 3, 4, 5].forEach(idx => {
      const p = verifyAfterDel.find(item => item.id === createdPlayerIds[idx]);
      assert(p, `Player ${idx + 1} was accidentally lost during deletion!`);
    });
  });

  // 6. Clean up remaining test players
  console.log('\n[Step 5] Cleaning Up Test Players');
  const cleanupDb = (await request('GET', '/api/db?clubId=spikers')).json.data;
  cleanupDb.team = cleanupDb.team.filter(p => !createdPlayerIds.includes(p.id));
  await request('POST', '/api/save-all?clubId=spikers', cleanupDb, authHeaders);

  const finalDb = (await request('GET', '/api/db?clubId=spikers')).json.data.team || [];
  test('All test players cleanly removed, baseline restored', () => {
    const remainingTestPlayers = finalDb.filter(p => createdPlayerIds.includes(p.id));
    assert.strictEqual(remainingTestPlayers.length, 0);
  });

  console.log('\n====================================================');
  console.log(`TOTAL RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
}

runVerification().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
