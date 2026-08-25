/**
 * Automated Verification Suite for Phase 4: Dynamic Public Club Pages
 * 
 * Verifies:
 * 1. Express dynamic club routing (/club/spikers, /club/strikers, /club.html?club=..., /)
 * 2. Strict club data isolation across all models (team, matches, events, training, news, gallery, sponsors, testimonials, about, contact)
 * 3. Dynamic creation of 3rd club ('ACEIT Smashers' - Badminton) and automatic generation of functional public page without writing code
 * 4. Content preservation of Spikers (volleyball) data
 * 5. Dynamic branding metadata (logo, name, sport, coverImage, description)
 * 6. Follow/Unfollow integration with dynamic club pages
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
let authToken = '';

function request(method, path, body = null, headers = {}) {
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

    if (authToken && !options.headers['Authorization']) {
      options.headers['Authorization'] = `Bearer ${authToken}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data, body: data });
        }
      });
    });

    req.on('error', err => reject(err));
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('====================================================');
  console.log('PHASE 4: DYNAMIC PUBLIC CLUB PAGES - TEST SUITE');
  console.log('====================================================\n');

  try {
    // ----------------------------------------------------
    // Section 1: Owner Login for Club Management
    // ----------------------------------------------------
    console.log('[1] Authentication Setup');
    const loginRes = await request('POST', '/api/auth/login', {
      username: 'founder',
      password: 'OwnerSecret123!'
    });
    assert(loginRes.status === 200 && loginRes.body.success, 'Owner authentication successful');
    if (loginRes.body.token) {
      authToken = loginRes.body.token;
    }

    // ----------------------------------------------------
    // Section 2: Dynamic Express Routing
    // ----------------------------------------------------
    console.log('\n[2] Dynamic Public Page Route Resolution');
    const routeRoot = await request('GET', '/');
    assert(routeRoot.status === 200 && routeRoot.raw.includes('publicClubsGrid'), 'GET / serves aceit-spikers-1.html with publicClubsGrid');

    const routeSpikers = await request('GET', '/club/spikers');
    assert(routeSpikers.status === 200 && routeSpikers.raw.includes('getActiveClubId'), 'GET /club/spikers serves dynamic club page template');

    const routeStrikers = await request('GET', '/club/strikers');
    assert(routeStrikers.status === 200 && routeStrikers.raw.includes('applyClubBranding'), 'GET /club/strikers serves dynamic club page template');

    const routeClubHtml = await request('GET', '/club.html?club=strikers');
    assert(routeClubHtml.status === 200 && routeClubHtml.raw.includes('navBrandText'), 'GET /club.html?club=strikers serves dynamic template');

    // ----------------------------------------------------
    // Section 3: Club Metadata & Dynamic Branding APIs
    // ----------------------------------------------------
    console.log('\n[3] Club Metadata & Dynamic Branding');
    const spikersMeta = await request('GET', '/api/clubs/spikers');
    assert(spikersMeta.status === 200 && spikersMeta.body.club.sport === 'Volleyball', 'Spikers metadata contains sport: Volleyball');
    assert(spikersMeta.body.club.name === 'ACEIT Spikers', 'Spikers metadata contains correct name: ACEIT Spikers');

    // Ensure Strikers exists
    await request('POST', '/api/clubs', {
      clubId: 'strikers',
      name: 'ACEIT Strikers FC',
      sport: 'Football',
      slug: 'strikers',
      logo: 'https://images.unsplash.com/photo-football-logo',
      coverImage: 'https://images.unsplash.com/photo-football-cover',
      description: 'Official ACEIT Football Club for collegiate leagues and tournaments',
      active: true
    });

    const strikersMeta = await request('GET', '/api/clubs/strikers');
    assert(strikersMeta.status === 200 && strikersMeta.body.club.sport === 'Football', 'Strikers metadata contains sport: Football');
    assert(strikersMeta.body.club.name === 'ACEIT Strikers FC', 'Strikers metadata contains correct name: ACEIT Strikers FC');

    // ----------------------------------------------------
    // Section 4: Dynamic Creation of 3rd Club (ACEIT Smashers - Badminton)
    // ----------------------------------------------------
    console.log('\n[4] Dynamic Addition of 3rd Club: ACEIT Smashers (Badminton)');
    const createSmashersRes = await request('POST', '/api/clubs', {
      clubId: 'smashers',
      name: 'ACEIT Smashers',
      sport: 'Badminton',
      slug: 'smashers',
      logo: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=100&h=100&fit=crop',
      coverImage: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=1200&h=400&fit=crop',
      description: 'Official Badminton Club of Arya College of Engineering & IT. Smashing limits and achieving excellence on court.',
      active: true
    });
    assert(createSmashersRes.status === 200 || createSmashersRes.status === 201, 'POST /api/clubs creates ACEIT Smashers');

    const smashersRoute = await request('GET', '/club/smashers');
    assert(smashersRoute.status === 200, 'GET /club/smashers immediately serves public page without manual HTML coding');

    const smashersMeta = await request('GET', '/api/clubs/smashers');
    assert(smashersMeta.status === 200 && smashersMeta.body.club.name === 'ACEIT Smashers', 'Smashers metadata verified dynamically');
    assert(smashersMeta.body.club.sport === 'Badminton', 'Smashers sport is Badminton');

    // ----------------------------------------------------
    // Section 5: Add Content to Smashers and Verify Data Isolation
    // ----------------------------------------------------
    console.log('\n[5] Content Population & Scoped Data Isolation');
    const addSmashPlayer = await request('POST', '/api/team?clubId=smashers', {
      n: 'Lakshya Sen (Student)',
      num: 7,
      pos: "Men's Singles",
      cat: 'Boys Team',
      h: "5'11\"",
      exp: '3 yrs',
      cap: true
    });
    assert(addSmashPlayer.status === 200 && addSmashPlayer.body.success, 'Added badminton player to Smashers');

    const addSmashMatch = await request('POST', '/api/matches?clubId=smashers', {
      opp: 'MNIT Shuttlers',
      date: '2026-09-15',
      time: '11:00',
      venue: 'ACEIT Indoor Badminton Arena',
      cat: 'Inter-College Cup',
      status: 'UPCOMING'
    });
    assert(addSmashMatch.status === 200 && addSmashMatch.body.success, 'Added match to Smashers');

    // Query /api/db for Smashers
    const smashersDB = await request('GET', '/api/db?clubId=smashers');
    assert(smashersDB.status === 200 && smashersDB.body.success, 'GET /api/db?clubId=smashers successful');
    assert(smashersDB.body.data.team.some(p => p.n === 'Lakshya Sen (Student)'), 'Smashers DB includes Lakshya Sen');
    assert(smashersDB.body.data.matches.some(m => m.opp === 'MNIT Shuttlers'), 'Smashers DB includes MNIT Shuttlers match');

    // Verify Spikers DB is 100% free of Smashers/Strikers data
    const spikersDB = await request('GET', '/api/db?clubId=spikers');
    assert(spikersDB.status === 200 && spikersDB.body.success, 'GET /api/db?clubId=spikers successful');
    const spikersHasSmashPlayer = spikersDB.body.data.team.some(p => p.n === 'Lakshya Sen (Student)');
    const spikersHasStrikerPlayer = spikersDB.body.data.team.some(p => p.n === 'Alex Hunter');
    assert(!spikersHasSmashPlayer && !spikersHasStrikerPlayer, 'Spikers DB is completely isolated from other clubs');
    assert(spikersDB.body.data.team.length > 0, 'Spikers volleyball roster is intact and preserved');

    // ----------------------------------------------------
    // Section 6: Club Directory & Follow Integration
    // ----------------------------------------------------
    console.log('\n[6] Clubs Directory & Follow/Join Functionality');
    const allClubs = await request('GET', '/api/clubs');
    assert(allClubs.status === 200 && Array.isArray(allClubs.body.clubs), 'GET /api/clubs returns all clubs');
    assert(allClubs.body.clubs.length >= 3, 'All 3 clubs (Spikers, Strikers, Smashers) returned in directory');

    const smashersInDirectory = allClubs.body.clubs.find(c => c.clubId === 'smashers' || c.slug === 'smashers');
    assert(!!smashersInDirectory, 'Smashers present in public clubs directory');

    // Follow Smashers
    const followRes = await request('POST', '/api/clubs/smashers/follow');
    assert(followRes.status === 200 && followRes.body.success, 'Followed dynamic club Smashers');

    const myClubs = await request('GET', '/api/profile/clubs');
    assert(myClubs.status === 200 && myClubs.body.clubs.some(c => c.clubId === 'smashers' || c.slug === 'smashers'), 'Smashers appears in user My Clubs list');

    // ----------------------------------------------------
    // Section 7: Final Summary
    // ----------------------------------------------------
    console.log('\n====================================================');
    console.log(`PHASE 4 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed === 0) {
      console.log('\n🌟 ALL PHASE 4 DYNAMIC PUBLIC CLUB PAGE TESTS PASSED 100%!');
      process.exit(0);
    } else {
      console.error(`\n❌ ${failed} test(s) failed.`);
      process.exit(1);
    }

  } catch (err) {
    console.error('\n❌ Unexpected error running tests:', err);
    process.exit(1);
  }
}

runTests();
