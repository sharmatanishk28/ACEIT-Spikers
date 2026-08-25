const http = require('http');

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    let bodyData = null;
    const reqHeaders = Object.assign({}, options.headers || {});

    if (options.body) {
      if (typeof options.body === 'object') {
        reqHeaders['Content-Type'] = 'application/json';
        bodyData = JSON.stringify(options.body);
      } else {
        bodyData = String(options.body);
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyData);
    }

    const reqOptions = {
      method: options.method || 'GET',
      headers: reqHeaders
    };

    const req = http.request(url, reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);

    if (bodyData) {
      req.write(bodyData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('========================================================');
  console.log('PHASE 1 MULTI-CLUB FOUNDATION TEST SUITE');
  console.log('========================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, name, details = '') {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${details ? '--> ' + details : ''}`);
      failed++;
    }
  }

  try {
    // 1. Check Server is alive and DB connects
    console.log('1. Testing Server & Database Connectivity...');
    const testDb = await request('/api/debug-db');
    assert(testDb.status === 200, 'Server /api/debug-db responds OK', JSON.stringify(testDb.data));

    // 2. Authenticate as OWNER
    console.log('\n2. Testing OWNER / Admin Authentication...');
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'founder', password: 'OwnerSecret123!' }
    });
    assert(loginRes.status === 200 && loginRes.data.success && loginRes.data.token, 'OWNER Login successfully generates JWT token');
    const token = loginRes.data.token;
    const authHeaders = { 'Authorization': `Bearer ${token}` };

    // 3. Verify Existing Spikers Data & Club
    console.log('\n3. Testing Existing Spikers Data & Central Club Entity...');
    const clubsRes = await request('/api/clubs', { headers: authHeaders });
    assert(clubsRes.status === 200 && clubsRes.data.success && Array.isArray(clubsRes.data.clubs), 'GET /api/clubs returns club list');

    const spikersClub = clubsRes.data.clubs.find(c => c.clubId === 'spikers' || c.slug === 'spikers' || c.slug === 'aceit-spikers');
    assert(spikersClub !== undefined, 'Spikers Club exists in clubs list');
    assert(spikersClub && spikersClub.sport === 'Volleyball', 'Spikers sport is Volleyball');
    assert(spikersClub && (spikersClub.clubId === 'spikers' || spikersClub.slug === 'spikers'), 'Spikers has clubId/slug defined');

    // 4. Test Single Club Fetch by ID
    const singleClubRes = await request('/api/clubs/spikers');
    assert(singleClubRes.status === 200 && singleClubRes.data.success, 'GET /api/clubs/spikers returns Spikers club entity');

    // 5. Test Backward Compatibility of public data endpoints
    const dbDefault = await request('/api/db');
    assert(dbDefault.status === 200 && dbDefault.data.success && dbDefault.data.data, 'GET /api/db (default) loads Spikers data without breaking');

    const teamDefault = await request('/api/team');
    assert(teamDefault.status === 200 && teamDefault.data.success && Array.isArray(teamDefault.data.team), 'GET /api/team returns team array');
    const initialSpikersPlayerCount = teamDefault.data.team.length;
    console.log(`   Found ${initialSpikersPlayerCount} existing Spikers players`);

    // 6. Create Second Independent Club: ACEIT Strikers (Football)
    console.log('\n4. Testing Second Club Creation (ACEIT Strikers - Football)...');
    // First, check if strikers already exists (e.g. from previous run) and delete or update
    const existingStrikers = clubsRes.data.clubs.find(c => c.clubId === 'strikers' || c.slug === 'strikers');
    if (existingStrikers) {
      await request(`/api/clubs/${existingStrikers._id}`, { method: 'DELETE', headers: authHeaders });
    }

    const createClubRes = await request('/api/clubs', {
      method: 'POST',
      headers: authHeaders,
      body: {
        clubId: 'strikers',
        name: 'ACEIT Strikers',
        sport: 'Football',
        slug: 'strikers',
        logo: 'https://images.unsplash.com/photo-football-logo',
        coverImage: 'https://images.unsplash.com/photo-football-cover',
        description: 'Official ACEIT Football Club for collegiate leagues and tournaments',
        active: true,
        status: 'active'
      }
    });

    assert(createClubRes.status === 200 && createClubRes.data.success, 'POST /api/clubs creates second club (Strikers)');
    assert(createClubRes.data.club && createClubRes.data.club.clubId === 'strikers', 'Created club has clubId: "strikers"');
    assert(createClubRes.data.club && createClubRes.data.club.sport === 'Football', 'Created club has sport: "Football"');
    assert(createClubRes.data.club && createClubRes.data.club.coverImage.includes('cover'), 'Created club has coverImage field');

    // 7. Verify Both Clubs Co-Exist
    const allClubsRes = await request('/api/clubs', { headers: authHeaders });
    const hasSpikers = allClubsRes.data.clubs.some(c => c.clubId === 'spikers' || c.slug === 'spikers');
    const hasStrikers = allClubsRes.data.clubs.some(c => c.clubId === 'strikers' || c.slug === 'strikers');
    assert(hasSpikers && hasStrikers, 'Both Spikers and Strikers co-exist in the database');

    // 8. Add Content to Second Club (Strikers)
    console.log('\n5. Testing Multi-Club Content Segregation & Tagging...');
    const addPlayerRes = await request('/api/team', {
      method: 'POST',
      headers: authHeaders,
      body: {
        n: 'Alex Hunter',
        num: '9',
        pos: 'Center Forward / Striker',
        role: 'Captain',
        sport: 'Football',
        clubId: 'strikers'
      }
    });
    assert(addPlayerRes.status === 200 && addPlayerRes.data.success, 'POST /api/team adds Football player to Strikers');
    assert(addPlayerRes.data.player.clubId === 'strikers', 'Player is tagged with clubId: "strikers"');

    const addMatchRes = await request('/api/matches', {
      method: 'POST',
      headers: authHeaders,
      body: {
        team1: 'ACEIT Strikers',
        team2: 'SKIT Football Club',
        opp: 'SKIT Football Club',
        score1: '3',
        score2: '1',
        winner: 't1',
        date: '2026-09-15',
        status: 'Upcoming',
        clubId: 'strikers'
      }
    });
    assert(addMatchRes.status === 200 && addMatchRes.data.success, 'POST /api/matches adds match to Strikers');
    assert(addMatchRes.data.match.clubId === 'strikers', 'Match is tagged with clubId: "strikers"');

    const addEventRes = await request('/api/events', {
      method: 'POST',
      headers: authHeaders,
      body: {
        title: 'ACEIT Inter-College Football League 2026',
        description: 'Annual football championship hosted at ACEIT football grounds.',
        venue: 'ACEIT Football Stadium',
        date: '2026-10-05',
        clubId: 'strikers'
      }
    });
    assert(addEventRes.status === 200 && addEventRes.data.success, 'POST /api/events adds event to Strikers');
    assert(addEventRes.data.event.clubId === 'strikers', 'Event is tagged with clubId: "strikers"');

    // 9. Strict Data Isolation Tests
    console.log('\n6. Testing Strict Data Isolation Between Clubs...');

    // Test Strikers Players
    const strikersTeam = await request('/api/team?clubId=strikers');
    assert(strikersTeam.data.team.some(p => p.n === 'Alex Hunter'), 'GET /api/team?clubId=strikers contains "Alex Hunter"');
    assert(strikersTeam.data.team.every(p => p.clubId === 'strikers'), 'GET /api/team?clubId=strikers contains ONLY Strikers players');

    // Test Spikers Players (Should NOT contain Alex Hunter)
    const spikersTeam = await request('/api/team?clubId=spikers');
    assert(!spikersTeam.data.team.some(p => p.n === 'Alex Hunter'), 'GET /api/team?clubId=spikers does NOT contain "Alex Hunter"');
    assert(!spikersTeam.data.team.some(p => p.clubId === 'strikers'), 'GET /api/team?clubId=spikers has ZERO Strikers players');

    // Test Default /api/team without query param (Spikers Website)
    const defaultTeamAfter = await request('/api/team');
    assert(!defaultTeamAfter.data.team.some(p => p.n === 'Alex Hunter' && p.clubId === 'strikers'), 'GET /api/team (default Spikers site) is unaffected');

    // Test Strikers Matches
    const strikersMatches = await request('/api/matches?clubId=strikers');
    assert(strikersMatches.data.matches.some(m => m.opp === 'SKIT Football Club'), 'GET /api/matches?clubId=strikers contains Football match');
    assert(strikersMatches.data.matches.every(m => m.clubId === 'strikers'), 'GET /api/matches?clubId=strikers contains ONLY Strikers matches');

    // Test Spikers Matches
    const spikersMatches = await request('/api/matches?clubId=spikers');
    assert(!spikersMatches.data.matches.some(m => m.opp === 'SKIT Football Club'), 'GET /api/matches?clubId=spikers does NOT contain Strikers match');

    // Test Strikers Events
    const strikersEvents = await request('/api/events?clubId=strikers');
    assert(strikersEvents.data.events.some(e => e.title === 'ACEIT Inter-College Football League 2026'), 'GET /api/events?clubId=strikers contains Football event');
    assert(strikersEvents.data.events.every(e => e.clubId === 'strikers'), 'GET /api/events?clubId=strikers contains ONLY Strikers events');

    // Test Spikers Events
    const spikersEvents = await request('/api/events?clubId=spikers');
    assert(!spikersEvents.data.events.some(e => e.title === 'ACEIT Inter-College Football League 2026'), 'GET /api/events?clubId=spikers does NOT contain Strikers event');

    // 10. Test DB Segregation via /api/db?clubId=
    console.log('\n7. Testing Multi-Club Full Database Filtering (/api/db?clubId=)...');
    const strikersDb = await request('/api/db?clubId=strikers');
    assert(strikersDb.data.data.team.length > 0 && strikersDb.data.data.team.every(p => p.clubId === 'strikers'), '/api/db?clubId=strikers returns filtered Strikers team');
    assert(strikersDb.data.data.matches.length > 0 && strikersDb.data.data.matches.every(m => m.clubId === 'strikers'), '/api/db?clubId=strikers returns filtered Strikers matches');
    assert(strikersDb.data.data.events.length > 0 && strikersDb.data.data.events.every(e => e.clubId === 'strikers'), '/api/db?clubId=strikers returns filtered Strikers events');

    // 11. Test Primary Club Protection
    console.log('\n8. Testing Primary Club Protection...');
    const deleteSpikersAttempt = await request('/api/clubs/spikers', { method: 'DELETE', headers: authHeaders });
    assert(deleteSpikersAttempt.status === 400, 'DELETE /api/clubs/spikers is blocked with 400 (Cannot delete primary club)');

  } catch (err) {
    console.error('Unexpected error during test execution:', err);
    failed++;
  }

  console.log('\n========================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
