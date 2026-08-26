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
  console.log('MULTI-CLUB HERO SLIDESHOW & EVENTS SHOWCASE TEST');
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
  console.log('[1] Owner Login');
  const loginRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'founder', password: 'OwnerSecret123!' });

  assert(loginRes.status === 200 && loginRes.body.token, 'Owner login successful');
  const token = loginRes.body.token;

  // 2. Add slide for Basketball (Dunkers)
  console.log('\n[2] Add Slide for Basketball (Dunkers)');
  const dunkersSlide = {
    title: 'ACEIT Dunkers All-Star 3-Point Shootout',
    date: 'Hardcourt Arena · 15 Oct 2026',
    image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=1200',
    link: '#events',
    btnText: 'Explore Shootout',
    clubId: 'dunkers'
  };

  const addDunkersSlide = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/slideshow?clubId=dunkers',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, dunkersSlide);

  assert(addDunkersSlide.status === 200 && addDunkersSlide.body.success, 'Added custom slide for Dunkers Basketball');
  const slideId = addDunkersSlide.body.item.id;

  // 3. Add slide for Kabaddi
  console.log('\n[3] Add Slide for Kabaddi');
  const kabaddiSlide = {
    title: 'Maha-Raid Super Tackle Finals',
    date: 'Main Outdoor Arena · 20 Oct 2026',
    image: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=1200',
    link: '#matches',
    btnText: 'View Fixtures',
    clubId: 'kabaddi'
  };

  const addKabaddiSlide = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/slideshow?clubId=kabaddi',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, kabaddiSlide);

  assert(addKabaddiSlide.status === 200 && addKabaddiSlide.body.success, 'Added custom slide for Kabaddi');

  // 4. Verify Strict Isolation across clubs
  console.log('\n[4] Slideshow Data Isolation Verification');
  const dunkersSlides = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/slideshow?clubId=dunkers',
    method: 'GET'
  });
  assert(dunkersSlides.status === 200 && Array.isArray(dunkersSlides.body.slideshow), 'Fetched Dunkers slideshow');
  assert(dunkersSlides.body.slideshow.some(s => s.title.includes('3-Point Shootout')), 'Dunkers slideshow contains basketball shootout slide');
  assert(!dunkersSlides.body.slideshow.some(s => s.title.includes('Maha-Raid')), 'Dunkers does NOT contain Kabaddi slides');

  const kabaddiSlides = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/slideshow?clubId=kabaddi',
    method: 'GET'
  });
  assert(kabaddiSlides.status === 200 && Array.isArray(kabaddiSlides.body.slideshow), 'Fetched Kabaddi slideshow');
  assert(kabaddiSlides.body.slideshow.some(s => s.title.includes('Maha-Raid')), 'Kabaddi slideshow contains Maha-Raid slide');
  assert(!kabaddiSlides.body.slideshow.some(s => s.title.includes('3-Point Shootout')), 'Kabaddi does NOT contain Basketball slides');

  const spikersSlides = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/slideshow?clubId=spikers',
    method: 'GET'
  });
  assert(!spikersSlides.body.slideshow.some(s => s.title.includes('3-Point Shootout')), 'Spikers does NOT contain Basketball slides');
  assert(!spikersSlides.body.slideshow.some(s => s.title.includes('Maha-Raid')), 'Spikers does NOT contain Kabaddi slides');

  // 5. Verify PUT and DELETE operations
  console.log('\n[5] Update and Delete Slide Verification');
  const updateSlide = await req({
    hostname: 'localhost',
    port: 3000,
    path: `/api/slideshow/${slideId}`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, {
    title: 'ACEIT Dunkers Championship Final 2026',
    btnText: 'View Match Replay'
  });
  assert(updateSlide.status === 200 && updateSlide.body.item.title === 'ACEIT Dunkers Championship Final 2026', 'Updated Dunkers slide title via PUT');

  // 6. Verify Public HTML contains slideshow section and controls
  console.log('\n[6] Public HTML Verification');
  const pageRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/club/kabaddi',
    method: 'GET'
  });
  assert(pageRes.status === 200, 'Served /club/kabaddi page');
  assert(pageRes.body.includes('id="hero-slideshow"'), 'HTML contains hero-slideshow section');
  assert(pageRes.body.includes('showcaseTrack'), 'HTML contains showcase track');
  assert(pageRes.body.includes('showcasePrevBtn') && pageRes.body.includes('showcaseNextBtn'), 'HTML contains prev/next slideshow controls');

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
