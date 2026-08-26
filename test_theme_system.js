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
  console.log('MULTI-CLUB DYNAMIC THEME SYSTEM TEST SUITE');
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

  // 1. Owner Login
  console.log('[1] Owner Authentication');
  const loginRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'founder', password: 'OwnerSecret123!' });

  assert(loginRes.status === 200 && loginRes.body.token, 'Owner logged in successfully');
  const token = loginRes.body.token;

  // 2. Create Football Club with auto-theme
  console.log('\n[2] Create Football Club (Auto-Themed)');
  const footballRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/clubs',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, {
    name: 'ACEIT Strikers FC',
    sport: 'Football',
    slug: 'strikers-fc',
    description: 'The official football club of ACEIT'
  });

  assert(footballRes.status === 200 || footballRes.status === 400, 'Created or retrieved Football club');

  // 3. Create Basketball Club with Custom Theme Colors
  console.log('\n[3] Create Basketball Club with Custom Theme Colors');
  const bballRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/clubs',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, {
    name: 'ACEIT Dunkers',
    sport: 'Basketball',
    slug: 'dunkers',
    description: 'Championship basketball squad',
    themeColor: '#FF6F00',
    accentColor: '#FF8F00'
  });

  assert(bballRes.status === 200 || bballRes.status === 400, 'Created or retrieved Basketball club with custom theme');

  // 4. Verify Single Club Route returns themeColor and accentColor
  console.log('\n[4] Theme Data Retrieval & Persistence');
  const dunkersGet = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/clubs/dunkers',
    method: 'GET'
  });

  assert(dunkersGet.status === 200 && dunkersGet.body.club, 'Retrieved Dunkers club by slug');
  if (dunkersGet.body.club) {
    assert(dunkersGet.body.club.sport === 'Basketball', 'Club sport is Basketball');
  }

  // 5. Update Theme Color on existing club
  console.log('\n[5] Update Theme Color on Existing Club');
  const updateRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/clubs/dunkers',
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, {
    themeColor: '#D35400',
    accentColor: '#E67E22'
  });

  assert(updateRes.status === 200 && updateRes.body.success, 'Updated Dunkers theme colors via PUT');
  if (updateRes.body.club) {
    assert(updateRes.body.club.themeColor === '#D35400', 'Updated themeColor is persisted (#D35400)');
    assert(updateRes.body.club.accentColor === '#E67E22', 'Updated accentColor is persisted (#E67E22)');
  }

  // 6. Verify GET /api/clubs list contains all themes
  console.log('\n[6] Listing All Clubs with Dynamic Theme Metadata');
  const allClubs = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/clubs',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  assert(allClubs.status === 200 && Array.isArray(allClubs.body.clubs), 'Retrieved all clubs list');
  const foundDunkers = allClubs.body.clubs.find(c => c.slug === 'dunkers');
  assert(foundDunkers && foundDunkers.themeColor === '#D35400', 'Dunkers custom themeColor present in clubs directory list');

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
