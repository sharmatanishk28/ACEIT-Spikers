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

async function runEntityTest(name, moduleKey, entityMaker, entityUpdater) {
  console.log(`\n----------------------------------------------------`);
  console.log(`TESTING 3-RECORD SEQUENTIAL CRUD FOR: ${name.toUpperCase()} (${moduleKey})`);
  console.log(`----------------------------------------------------`);

  // 1. Login
  const loginRes = await request('POST', '/api/auth/login', { username: 'founder', password: 'OwnerSecret123!' });
  assert.strictEqual(loginRes.statusCode, 200);
  const token = loginRes.json.token;
  const headers = { 'Authorization': `Bearer ${token}` };

  const getDbPayload = (res) => {
    if (!res || !res.json) return {};
    return res.json.data || res.json;
  };

  // 2. Fetch baseline
  const baseRes = await request('GET', '/api/db?clubId=spikers');
  assert.strictEqual(baseRes.statusCode, 200);
  const baseDb = getDbPayload(baseRes);
  const initialItems = (baseDb[moduleKey] || []).slice();

  // Item A
  const itemA = entityMaker('A');
  const db1 = JSON.parse(JSON.stringify(baseDb));
  db1[moduleKey] = (db1[moduleKey] || []).concat([itemA]);
  const save1 = await request('POST', '/api/save-all?clubId=spikers', db1, headers);
  test(`Save 1: Record A created for ${name}`, () => {
    assert.strictEqual(save1.statusCode, 200);
    assert.strictEqual(save1.json.success, true);
  });

  // Verify A exists
  const get1 = await request('GET', '/api/db?clubId=spikers');
  test(`Verify 1: Record A exists`, () => {
    const list = getDbPayload(get1)[moduleKey] || [];
    assert(list.some(it => it.id === itemA.id));
    assert.strictEqual(list.length, initialItems.length + 1);
  });

  // Item B
  const itemB = entityMaker('B');
  const db2 = JSON.parse(JSON.stringify(getDbPayload(get1)));
  db2[moduleKey] = (db2[moduleKey] || []).concat([itemB]);
  const save2 = await request('POST', '/api/save-all?clubId=spikers', db2, headers);
  test(`Save 2: Record B created for ${name}`, () => {
    assert.strictEqual(save2.statusCode, 200);
  });

  // Verify A and B exist
  const get2 = await request('GET', '/api/db?clubId=spikers');
  test(`Verify 2: Record A + B both exist (A did not disappear!)`, () => {
    const list = getDbPayload(get2)[moduleKey] || [];
    assert(list.some(it => it.id === itemA.id), 'Record A must exist');
    assert(list.some(it => it.id === itemB.id), 'Record B must exist');
    assert.strictEqual(list.length, initialItems.length + 2);
  });

  // Item C
  const itemC = entityMaker('C');
  const db3 = JSON.parse(JSON.stringify(getDbPayload(get2)));
  db3[moduleKey] = (db3[moduleKey] || []).concat([itemC]);
  const save3 = await request('POST', '/api/save-all?clubId=spikers', db3, headers);
  test(`Save 3: Record C created for ${name}`, () => {
    assert.strictEqual(save3.statusCode, 200);
  });

  // Verify A, B, C exist
  const get3 = await request('GET', '/api/db?clubId=spikers');
  test(`Verify 3: Record A + B + C all exist`, () => {
    const list = getDbPayload(get3)[moduleKey] || [];
    assert(list.some(it => it.id === itemA.id), 'Record A exists');
    assert(list.some(it => it.id === itemB.id), 'Record B exists');
    assert(list.some(it => it.id === itemC.id), 'Record C exists');
    assert.strictEqual(list.length, initialItems.length + 3);
  });

  // Update B
  const dbUpdate = JSON.parse(JSON.stringify(getDbPayload(get3)));
  const bIdx = (dbUpdate[moduleKey] || []).findIndex(it => it.id === itemB.id);
  if (bIdx !== -1) {
    dbUpdate[moduleKey][bIdx] = entityUpdater(dbUpdate[moduleKey][bIdx]);
  }
  const saveUpdate = await request('POST', '/api/save-all?clubId=spikers', dbUpdate, headers);
  test(`Update: Record B updated for ${name}`, () => {
    assert.strictEqual(saveUpdate.statusCode, 200);
  });

  // Verify A unchanged, B updated, C unchanged
  const getUpdate = await request('GET', '/api/db?clubId=spikers');
  test(`Verify Update: Record A unchanged, B updated, C unchanged`, () => {
    const list = getDbPayload(getUpdate)[moduleKey] || [];
    const foundA = list.find(it => it.id === itemA.id);
    const foundB = list.find(it => it.id === itemB.id);
    const foundC = list.find(it => it.id === itemC.id);
    assert(foundA, 'Record A exists');
    assert(foundB, 'Record B exists');
    assert(foundC, 'Record C exists');
    assert.strictEqual(foundB.updated, true);
  });

  // Delete B
  const dbDelete = JSON.parse(JSON.stringify(getDbPayload(getUpdate)));
  dbDelete[moduleKey] = (dbDelete[moduleKey] || []).filter(it => it.id !== itemB.id);
  const saveDelete = await request('POST', '/api/save-all?clubId=spikers', dbDelete, headers);
  test(`Delete: Record B deleted for ${name}`, () => {
    assert.strictEqual(saveDelete.statusCode, 200);
  });

  // Verify A and C remain, B deleted
  const getFinal = await request('GET', '/api/db?clubId=spikers');
  test(`Verify Final: A + C remain, B permanently deleted`, () => {
    const list = getDbPayload(getFinal)[moduleKey] || [];
    assert(list.some(it => it.id === itemA.id), 'Record A remains');
    assert(!list.some(it => it.id === itemB.id), 'Record B permanently removed');
    assert(list.some(it => it.id === itemC.id), 'Record C remains');
    assert.strictEqual(list.length, initialItems.length + 2);
  });

  // Cleanup A, B, and C
  const cleanDb = JSON.parse(JSON.stringify(getDbPayload(getFinal)));
  cleanDb[moduleKey] = (cleanDb[moduleKey] || []).filter(it => it.id !== itemA.id && it.id !== itemB.id && it.id !== itemC.id);
  await request('POST', '/api/save-all?clubId=spikers', cleanDb, headers);
}

async function runAll() {
  console.log('====================================================');
  console.log('SEQUENTIAL 3-RECORD CREATE / UPDATE / DELETE TEST SUITE');
  console.log('====================================================');

  // 1. PLAYERS
  await runEntityTest(
    'Players',
    'team',
    (tag) => ({ id: `player_seq_${tag}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, n: `Player ${tag}`, num: tag === 'A' ? 1 : (tag === 'B' ? 2 : 3), pos: 'Setter', cat: 'boys team', clubId: 'spikers' }),
    (item) => ({ ...item, n: `${item.n} (Modified)`, updated: true })
  );

  // 2. EVENTS
  await runEntityTest(
    'Events',
    'events',
    (tag) => ({ id: `event_seq_${tag}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, title: `Event ${tag}`, date: '2026-10-15', venue: 'Main Arena', clubId: 'spikers' }),
    (item) => ({ ...item, title: `${item.title} (Updated)`, updated: true })
  );

  // 3. GALLERY
  await runEntityTest(
    'Gallery',
    'gallery',
    (tag) => ({ id: `gallery_seq_${tag}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, label: `Photo ${tag}`, photo: 'banner1.jpg', cat: 'matches', clubId: 'spikers' }),
    (item) => ({ ...item, label: `${item.label} (Updated)`, updated: true })
  );

  // 4. NEWS
  await runEntityTest(
    'News',
    'news',
    (tag) => ({ id: `news_seq_${tag}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, title: `Headline ${tag}`, tag: 'Recap', date: '2026-08-29', body: 'Story details...', clubId: 'spikers' }),
    (item) => ({ ...item, title: `${item.title} (Updated)`, updated: true })
  );

  // 5. MATCHES
  await runEntityTest(
    'Matches',
    'matches',
    (tag) => ({ id: `match_seq_${tag}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, team1: 'ACEIT Spikers', opp: `Opponent ${tag}`, date: '2026-09-01T10:00', venue: 'Court 1', status: 'upcoming', clubId: 'spikers' }),
    (item) => ({ ...item, venue: 'Updated Court 2', updated: true })
  );

  // 6. HERO SLIDESHOW
  await runEntityTest(
    'Hero Slideshow',
    'slideshow',
    (tag) => ({ id: `slide_seq_${tag}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, title: `Slide ${tag}`, date: '2026 Cup', image: 'banner1.jpg', clubId: 'spikers' }),
    (item) => ({ ...item, title: `${item.title} (Updated)`, updated: true })
  );

  // 7. TRAINING
  await runEntityTest(
    'Training',
    'training',
    (tag) => ({ id: `train_seq_${tag}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`, title: `Drill ${tag}`, time: '06:00 AM', desc: 'Tactical conditioning', clubId: 'spikers' }),
    (item) => ({ ...item, title: `${item.title} (Updated)`, updated: true })
  );

  console.log('\n====================================================');
  console.log(`OVERALL SUITE RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

runAll().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
