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
  console.log('EXPLORE SPORTS CLUBS CONTINUOUS MOTION SLIDESHOW TEST');
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

  // 1. Verify All Clubs from /api/clubs API
  console.log('[1] All Sports Clubs API Verification');
  const clubsRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/clubs',
    method: 'GET'
  });

  assert(clubsRes.status === 200, 'GET /api/clubs returned HTTP 200');
  const clubs = clubsRes.body.clubs || [];
  assert(Array.isArray(clubs) && clubs.length >= 6, `API returns all core sports clubs (Found: ${clubs.length})`);
  
  const expectedSports = ['volleyball', 'kabaddi', 'basketball', 'football', 'badminton', 'cricket'];
  expectedSports.forEach(sport => {
    const found = clubs.some(c => (c.sport || '').toLowerCase() === sport);
    assert(found, `Clubs list contains ${sport.toUpperCase()} club`);
  });

  // 2. Verify HTML Structure & Continuous Motion Showcase Elements
  console.log('\n[2] Public HTML Structure Verification');
  const pageRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/',
    method: 'GET'
  });

  assert(pageRes.status === 200, 'Served main page HTML');
  assert(pageRes.body.includes('id="clubs"'), 'HTML contains sports clubs section #clubs');
  assert(pageRes.body.includes('id="clubsShowcaseViewport"'), 'HTML contains #clubsShowcaseViewport');
  assert(pageRes.body.includes('id="clubsShowcaseTrack"'), 'HTML contains #clubsShowcaseTrack');
  assert(pageRes.body.includes('id="clubsShowcaseDots"'), 'HTML contains #clubsShowcaseDots pagination');
  
  // 3. Verify No Play/Pause Button in Clubs Section
  console.log('\n[3] Clean Visual Aesthetic (No Play/Pause Button in Clubs Section)');
  const clubsSectionHtml = pageRes.body.slice(pageRes.body.indexOf('id="clubs"'), pageRes.body.indexOf('id="about"'));
  assert(!clubsSectionHtml.includes('clubsPlayPauseBtn') && !clubsSectionHtml.includes('clubs-play-pause'), 'No play/pause toggle button added to Explore Clubs section');

  // 4. Verify Multi-Club Page Consistency
  console.log('\n[4] Multi-Club Consistency across Club URLs');
  const kabaddiPage = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/club/kabaddi',
    method: 'GET'
  });
  assert(kabaddiPage.status === 200 && kabaddiPage.body.includes('id="clubsShowcaseViewport"'), 'Explore Clubs slideshow present on /club/kabaddi');

  const dunkersPage = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/club/dunkers',
    method: 'GET'
  });
  assert(dunkersPage.status === 200 && dunkersPage.body.includes('id="clubsShowcaseViewport"'), 'Explore Clubs slideshow present on /club/dunkers');

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
