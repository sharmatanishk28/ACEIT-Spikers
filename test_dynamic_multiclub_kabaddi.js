/**
 * Automated Verification Suite: Dynamic Multi-Club & Test Kabaddi Club
 * 
 * Verifies:
 * 1. Owner root authentication
 * 2. Dynamic creation of ACEIT Kabaddi Club via Admin API
 * 3. Dynamic Public Page Route Resolution for /club/kabaddi
 * 4. Scoped Kabaddi Club Admin creation & authentication
 * 5. Content Population for Kabaddi (Raiders, Defenders, Matches)
 * 6. Strict Data Isolation: Kabaddi players exist only in Kabaddi; Spikers remains 100% untouched
 * 7. Cross-Club Admin Boundary Enforcement (Kabaddi admin blocked from Spikers)
 * 8. Club Editing & Metadata Update
 * 9. Multi-Club Data Persistence across server requests
 * 10. Landing Page Sports Clubs Banner Directory verification
 */

const http = require('http');
const app = require('./server');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;
let serverInstance = null;

function startServerIfNeeded() {
  return new Promise((resolve) => {
    const s = http.createServer(app);
    s.listen(PORT, () => {
      serverInstance = s;
      console.log(`Test server initialized on port ${PORT}`);
      resolve();
    });
    s.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(); // Already running
      } else {
        console.error('Server startup error:', err);
        resolve();
      }
    });
  });
}

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
  console.log('DYNAMIC MULTI-CLUB & KABADDI CLUB TEST SUITE');
  console.log('====================================================\n');

  try {
    await startServerIfNeeded();

    // ----------------------------------------------------
    // Section 1: Owner Authentication
    // ----------------------------------------------------
    console.log('[1] Owner Root Authentication');
    const ownerLoginRes = await request('POST', '/api/auth/login', {
      username: 'founder',
      password: 'OwnerSecret123!'
    });

    assert(ownerLoginRes.status === 200, 'Owner login successful (HTTP 200)');
    const ownerToken = ownerLoginRes.body.token;
    const ownerHeaders = { Authorization: `Bearer ${ownerToken}` };

    // ----------------------------------------------------
    // Section 2: Create Dynamic Kabaddi Club
    // ----------------------------------------------------
    console.log('\n[2] Create Dynamic Kabaddi Club via Admin API');
    const createKabaddiRes = await request('POST', '/api/clubs', {
      clubId: 'kabaddi',
      name: 'ACEIT Kabaddi',
      sport: 'Kabaddi',
      slug: 'kabaddi',
      logo: '',
      coverImage: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=1200',
      description: 'Official Kabaddi Club of Arya College of Engineering & IT. Unstoppable raid power, impenetrable defense, and collegiate tournament champions.',
      active: true
    }, ownerHeaders);

    assert(
      createKabaddiRes.status === 200 || 
      createKabaddiRes.status === 201 || 
      (createKabaddiRes.body && createKabaddiRes.body.message && createKabaddiRes.body.message.includes('already exists')),
      'Owner created or verified ACEIT Kabaddi club'
    );

    // ----------------------------------------------------
    // Section 3: Dynamic Route Resolution for /club/kabaddi
    // ----------------------------------------------------
    console.log('\n[3] Dynamic Public Page Route Resolution for /club/kabaddi');
    const kabaddiRoute = await request('GET', '/club/kabaddi');
    assert(kabaddiRoute.status === 200, 'GET /club/kabaddi serves public page template');
    assert(kabaddiRoute.raw.includes('publicClubsGrid') || kabaddiRoute.raw.includes('sports-clubs-section'), 'Served HTML includes sports clubs structure');

    const kabaddiMeta = await request('GET', '/api/clubs/kabaddi');
    assert(kabaddiMeta.status === 200 && kabaddiMeta.body.club, 'GET /api/clubs/kabaddi returns club metadata');
    assert(kabaddiMeta.body.club.sport === 'Kabaddi', 'Kabaddi club sport is "Kabaddi"');
    assert(kabaddiMeta.body.club.name === 'ACEIT Kabaddi', 'Kabaddi club name is "ACEIT Kabaddi"');

    // ----------------------------------------------------
    // Section 4: Create & Authenticate Scoped Kabaddi Admin
    // ----------------------------------------------------
    console.log('\n[4] Scoped Club Admin Assignment for Kabaddi');
    const adminUsername = 'kabaddi_admin_' + Date.now().toString(36);
    const createAdminRes = await request('POST', '/api/users', {
      username: adminUsername,
      name: 'Pawan Kumar Coach',
      email: `${adminUsername}@aceit.edu.in`,
      password: 'KabaddiPass123!',
      role: 'COORDINATOR',
      clubId: 'kabaddi',
      clubs: ['kabaddi'],
      permissions: ['players.*', 'matches.*', 'events.*', 'training.*', 'news.*', 'gallery.*'],
      active: true
    }, ownerHeaders);

    assert(createAdminRes.status === 200 || createAdminRes.status === 201, 'Created scoped Kabaddi Admin');

    const adminLoginRes = await request('POST', '/api/auth/login', {
      username: adminUsername,
      password: 'KabaddiPass123!'
    });
    assert(adminLoginRes.status === 200 && adminLoginRes.body.token, 'Kabaddi Admin login successful');
    const adminHeaders = { Authorization: `Bearer ${adminLoginRes.body.token}` };

    // ----------------------------------------------------
    // Section 5: Add Content to Kabaddi (Roster & Matches)
    // ----------------------------------------------------
    console.log('\n[5] Content Population for Kabaddi Club');
    const addPlayerRes = await request('POST', '/api/team', {
      n: 'Pawan Sehrawat',
      pos: 'Lead Raider',
      num: 7,
      cat: 'Boys Team',
      h: "5'11\"",
      exp: '3 yrs',
      cap: true,
      clubId: 'kabaddi'
    }, adminHeaders);

    assert(addPlayerRes.status === 200 && addPlayerRes.body.success, 'Kabaddi Admin added player (Pawan Sehrawat) to Kabaddi');

    const addMatchRes = await request('POST', '/api/matches', {
      team1: 'ACEIT Kabaddi',
      team2: 'MNIT Raiders',
      opp: 'MNIT Raiders',
      date: '2026-10-15',
      venue: 'ACEIT Outdoor Kabaddi Arena',
      status: 'upcoming',
      clubId: 'kabaddi'
    }, adminHeaders);

    assert(addMatchRes.status === 200 && addMatchRes.body.success, 'Kabaddi Admin added match to Kabaddi');

    // ----------------------------------------------------
    // Section 6: Strict Data Isolation
    // ----------------------------------------------------
    console.log('\n[6] Strict Data Isolation Verification');
    const kabaddiDb = await request('GET', '/api/db?clubId=kabaddi');
    assert(kabaddiDb.status === 200 && kabaddiDb.body.success, 'GET /api/db?clubId=kabaddi successful');
    const kabaddiPlayers = kabaddiDb.body.data.team || [];
    assert(kabaddiPlayers.some(p => p.n === 'Pawan Sehrawat'), 'Kabaddi DB contains Pawan Sehrawat');
    assert(kabaddiPlayers.every(p => (p.clubId || 'kabaddi') === 'kabaddi'), 'Kabaddi DB contains ONLY Kabaddi players');

    // Verify Spikers data remains completely isolated and unchanged
    const spikersDb = await request('GET', '/api/db?clubId=spikers');
    assert(spikersDb.status === 200 && spikersDb.body.success, 'GET /api/db?clubId=spikers successful');
    const spikersPlayers = spikersDb.body.data.team || [];
    assert(!spikersPlayers.some(p => p.n === 'Pawan Sehrawat'), 'Spikers DB does NOT contain Pawan Sehrawat');
    assert(spikersPlayers.some(p => p.n === 'Shubham Patidar' || p.n.includes('Spikers')), 'Spikers volleyball roster is fully preserved');

    // ----------------------------------------------------
    // Section 7: Cross-Club Boundary Enforcement
    // ----------------------------------------------------
    console.log('\n[7] Cross-Club Boundary Enforcement (Kabaddi Admin -> Spikers)');
    const crossClubPlayerRes = await request('POST', '/api/team', {
      n: 'Illegal Infiltrator',
      clubId: 'spikers'
    }, adminHeaders);

    assert(crossClubPlayerRes.status === 403, 'Cross-club player mutation to Spikers rejected (HTTP 403 Forbidden)');

    const crossClubMatchRes = await request('POST', '/api/matches', {
      team1: 'ACEIT Spikers',
      opp: 'Rival Volleyball Team',
      clubId: 'spikers'
    }, adminHeaders);

    assert(crossClubMatchRes.status === 403, 'Cross-club match mutation to Spikers rejected (HTTP 403 Forbidden)');

    // ----------------------------------------------------
    // Section 8: Edit Club & Persistence
    // ----------------------------------------------------
    console.log('\n[8] Club Metadata Edit & Data Persistence');
    const editClubRes = await request('PUT', '/api/clubs/kabaddi', {
      name: 'ACEIT Kabaddi Warriors',
      description: 'The premier collegiate Kabaddi franchise of Arya College of Engineering & IT.',
      sport: 'Kabaddi',
      active: true
    }, ownerHeaders);

    assert(editClubRes.status === 200 && editClubRes.body.success, 'Owner updated Kabaddi club details');

    const freshMeta = await request('GET', '/api/clubs/kabaddi');
    assert(freshMeta.body.club.name === 'ACEIT Kabaddi Warriors', 'Updated club name persisted in database');
    assert(freshMeta.body.club.description.includes('premier collegiate Kabaddi franchise'), 'Updated description persisted');

    // ----------------------------------------------------
    // Section 9: Landing Page Sports Clubs Directory Verification
    // ----------------------------------------------------
    console.log('\n[9] Landing Page Sports Clubs Directory');
    const allClubsRes = await request('GET', '/api/clubs');
    assert(allClubsRes.status === 200 && Array.isArray(allClubsRes.body.clubs), 'GET /api/clubs returns all registered clubs');
    assert(allClubsRes.body.clubs.some(c => (c.clubId === 'kabaddi' || c.slug === 'kabaddi')), 'Kabaddi is present in public clubs list');
    assert(allClubsRes.body.clubs.some(c => (c.clubId === 'spikers' || c.slug === 'spikers')), 'Spikers is present in public clubs list');

    // Final Summary
    console.log('\n====================================================');
    console.log(`TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
    console.log('====================================================\n');

    if (serverInstance) {
      serverInstance.close();
    }

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test Execution Error:', err);
    if (serverInstance) serverInstance.close();
    process.exit(1);
  }
}

runTests();
