const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(method, path, data, headers = {}) {
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
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`  ✗ [FAIL] ${message}`);
    failed++;
    failures.push(message);
  }
}

async function runComprehensiveSuite() {
  function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString(); }
  console.log('================================================================');
  console.log('STARTING FULL MULTI-CLUB CLEANING, AUTH & CRUD VERIFICATION SUITE');
  console.log('================================================================\n');

  // ====================================================
  // 1. VERIFY DEFAULT 6 CLUBS
  // ====================================================
  console.log('[SECTION 1] DEFAULT 6 CLUBS VERIFICATION');
  const clubsRes = await request('GET', '/api/clubs');
  assert(clubsRes.status === 200 && clubsRes.body.success, 'Clubs list API returned HTTP 200');
  const clubs = clubsRes.body.clubs || [];
  const requiredClubs = ['spikers', 'kabaddi', 'cricket', 'dunkers', 'shuttlers', 'strikers-fc'];
  
  requiredClubs.forEach(slug => {
    const found = clubs.find(c => (c.slug || c.clubId || '').toLowerCase() === slug);
    assert(!!found, `Club '${slug}' exists with name: "${found ? found.name : 'MISSING'}"`);
    if (found) {
      assert(found.active === true, `Club '${slug}' is marked active`);
      assert(!!found.sport, `Club '${slug}' has designated sport: ${found.sport}`);
    }
  });

  // ====================================================
  // 2. VERIFY CLEAN SEPARATE DATA FOR EVERY CLUB
  // ====================================================
  console.log('\n[SECTION 2] VERIFY CLEAN SEPARATE DATA FOR EVERY CLUB');
  const clubModules = ['team', 'matches', 'news', 'events', 'training', 'sponsors', 'stats', 'slideshow'];

  for (const cSlug of requiredClubs) {
    const dbRes = await request('GET', `/api/db?clubId=${cSlug}`);
    assert(dbRes.status === 200 && dbRes.body.success, `Scoped /api/db?clubId=${cSlug} returned HTTP 200`);
    const cData = dbRes.body.data || {};

    assert(Array.isArray(cData.team) && cData.team.length > 0, `[${cSlug}] Has players (Count: ${cData.team.length})`);
    assert(Array.isArray(cData.matches) && cData.matches.length > 0, `[${cSlug}] Has matches (Count: ${cData.matches.length})`);
    assert(Array.isArray(cData.news) && cData.news.length > 0, `[${cSlug}] Has news (Count: ${cData.news.length})`);
    assert(Array.isArray(cData.events) && cData.events.length > 0, `[${cSlug}] Has events (Count: ${cData.events.length})`);
    assert(Array.isArray(cData.training) && cData.training.length > 0, `[${cSlug}] Has training sessions (Count: ${cData.training.length})`);
    assert(cData.about && !!cData.about.title, `[${cSlug}] Has scoped About section`);
    assert(cData.contact && !!cData.contact.email, `[${cSlug}] Has scoped Contact section`);

    // Verify all players in this scoped query belong ONLY to this club
    const playerClubMismatches = (cData.team || []).filter(p => {
      const pClub = (p.clubId || 'spikers').toLowerCase();
      if (cSlug === 'spikers' || cSlug === 'c_spikers') {
        return pClub !== 'spikers' && pClub !== 'c_spikers' && pClub !== 'aceit-spikers';
      }
      return pClub !== cSlug;
    });
    assert(playerClubMismatches.length === 0, `[${cSlug}] Zero cross-club player leaks (All ${cData.team.length} players belong to ${cSlug})`);
  }

  // ====================================================
  // 3. TEST ACCOUNTS AUTHENTICATION & MULTI-CLUB ACCESS
  // ====================================================
  console.log('\n[SECTION 3] TEST ACCOUNTS AUTHENTICATION & MULTI-CLUB ACCESS');
  const testAccounts = [
    { username: 'owner', password: 'OwnerSecret123!', role: 'OWNER', clubId: 'ALL' },
    { username: 'founder', password: 'OwnerSecret123!', role: 'OWNER', clubId: 'ALL' },
    { username: 'cricket_admin', password: 'AdminSecret123!', role: 'ADMIN', clubId: 'cricket' },
    { username: 'kabaddi_admin', password: 'AdminSecret123!', role: 'ADMIN', clubId: 'kabaddi' },
    { username: 'football_admin', password: 'AdminSecret123!', role: 'ADMIN', clubId: 'strikers-fc' },
    { username: 'sports_coord', password: 'AdminSecret123!', role: 'COORDINATOR', clubId: 'spikers' },
    { username: 'dunkers_coord', password: 'AdminSecret123!', role: 'COORDINATOR', clubId: 'dunkers' },
    { username: 'student_athlete', password: 'StudentSecret123!', role: 'STUDENT', clubId: 'spikers' },
    { username: 'rahul_sharma', password: 'StudentSecret123!', role: 'STUDENT', clubId: 'spikers' }
  ];

  const authTokens = {};

  for (const acc of testAccounts) {
    // 3a. Login
    const loginRes = await request('POST', '/api/auth/login', {
      username: acc.username,
      password: acc.password
    });
    assert(loginRes.status === 200 && loginRes.body.success, `Account '${acc.username}' logged in successfully`);
    assert(loginRes.body.user.role === acc.role, `Account '${acc.username}' has expected role: ${acc.role}`);
    const token = loginRes.body.token;
    assert(!!token, `Account '${acc.username}' received valid JWT token`);
    authTokens[acc.username] = token;

    // 3b. Verify token via /api/auth/me
    const meRes = await request('GET', '/api/auth/me', null, { 'Authorization': `Bearer ${token}` });
    assert(meRes.status === 200 && meRes.body.success, `Account '${acc.username}' /api/auth/me verified successfully`);
  }

  // Test Case-Insensitive Login (e.g. 'CRICKET_ADMIN' uppercase)
  const caseInsensitiveRes = await request('POST', '/api/auth/login', {
    username: 'CRICKET_ADMIN',
    password: 'AdminSecret123!'
  });
  assert(caseInsensitiveRes.status === 200 && caseInsensitiveRes.body.success, 'Case-insensitive username login (CRICKET_ADMIN) succeeded');

  // Test Login with RTU Roll No ('22EATCS089')
  const rollLoginRes = await request('POST', '/api/auth/login', {
    username: '22EATCS089',
    password: 'StudentSecret123!'
  });
  assert(rollLoginRes.status === 200 && rollLoginRes.body.success, 'Login with RTU Roll No (22EATCS089) succeeded');

  // Test Login with Email ('student.athlete@aceit.edu.in')
  const emailLoginRes = await request('POST', '/api/auth/login', {
    username: 'student.athlete@aceit.edu.in',
    password: 'StudentSecret123!'
  });
  assert(emailLoginRes.status === 200 && emailLoginRes.body.success, 'Login with Email (student.athlete@aceit.edu.in) succeeded');

  // ====================================================
  // 4. CROSS-CLUB ISOLATION & PERMISSIONS ENFORCEMENT
  // ====================================================
  console.log('\n[SECTION 4] CROSS-CLUB ISOLATION & PERMISSIONS ENFORCEMENT');
  const ownerToken = authTokens['owner'];
  const cricketToken = authTokens['cricket_admin'];
  const kabaddiToken = authTokens['kabaddi_admin'];
  const studentToken = authTokens['student_athlete'];

  // 4a. Cricket admin attempting to create player in Volleyball -> MUST BE 403 FORBIDDEN
  const badVolleyAdd = await request('POST', '/api/team?clubId=spikers', {
    n: 'Illegal Volleyball Player',
    clubId: 'spikers'
  }, { 'Authorization': `Bearer ${cricketToken}` });
  assert(badVolleyAdd.status === 403, 'Cricket admin rejected from adding player to Volleyball (HTTP 403)');

  // 4b. Kabaddi admin attempting to create match in Basketball -> MUST BE 403 FORBIDDEN
  const badBasketAdd = await request('POST', '/api/matches?clubId=dunkers', {
    team1: 'ACEIT Dunkers',
    opp: 'Opponent',
    clubId: 'dunkers'
  }, { 'Authorization': `Bearer ${kabaddiToken}` });
  assert(badBasketAdd.status === 403, 'Kabaddi admin rejected from adding match to Basketball (HTTP 403)');

  // 4c. Student attempting to access admin endpoints -> MUST BE 403 FORBIDDEN
  const badStudentAdd = await request('POST', '/api/team?clubId=spikers', {
    n: 'Student Player Add Attempt',
    clubId: 'spikers'
  }, { 'Authorization': `Bearer ${studentToken}` });
  assert(badStudentAdd.status === 403, 'Student rejected from admin team management (HTTP 403)');

  // 4d. Cricket admin adding player to Cricket -> MUST SUCCEED (200)
  const cricketAddSuccess = await request('POST', '/api/team?clubId=cricket', {
    n: 'Test Cricket AllRounder',
    pos: 'All-Rounder',
    num: 33,
    clubId: 'cricket',
    cats: ['batsmen']
  }, { 'Authorization': `Bearer ${cricketToken}` });
  assert(cricketAddSuccess.status === 200 && cricketAddSuccess.body.success, 'Cricket admin permitted to add player to Cricket (HTTP 200)');
  const testCricketPlayerId = cricketAddSuccess.body.player.id;

  // Verify Cricket player appears in Cricket query but NEVER in Volleyball or Kabaddi
  const vCheck = await request('GET', '/api/team?clubId=spikers');
  const kCheck = await request('GET', '/api/team?clubId=kabaddi');
  const cCheck = await request('GET', '/api/team?clubId=cricket');
  assert(!vCheck.body.team.some(p => p.id === testCricketPlayerId), 'New Cricket player DOES NOT appear in Volleyball');
  assert(!kCheck.body.team.some(p => p.id === testCricketPlayerId), 'New Cricket player DOES NOT appear in Kabaddi');
  assert(cCheck.body.team.some(p => p.id === testCricketPlayerId), 'New Cricket player appears in Cricket dataset');

  // Clean up test cricket player
  await request('DELETE', `/api/team/${testCricketPlayerId}`, null, { 'Authorization': `Bearer ${cricketToken}` });

  // ====================================================
  // 5. TEST FULL CRUD CYCLE ON EVERY CLUB
  // ====================================================
  console.log('\n[SECTION 5] FULL CRUD CYCLE (CREATE -> EDIT -> DELETE -> VERIFY PERSISTENCE) FOR EVERY CLUB');

  for (const cSlug of requiredClubs) {
    const testPlayerName = `Temp Player ${cSlug.toUpperCase()}`;
    const testMatchOpp = `Temp Rival ${cSlug.toUpperCase()}`;
    const testNewsTitle = `Temp News ${cSlug.toUpperCase()}`;
    const testEventTitle = `Temp Tournament ${cSlug.toUpperCase()}`;

    // A. Create Player
    const createP = await request('POST', `/api/team?clubId=${cSlug}`, {
      n: testPlayerName,
      pos: 'Starter',
      num: 99,
      clubId: cSlug
    }, { 'Authorization': `Bearer ${ownerToken}` });
    assert(createP.status === 200 && createP.body.success, `[${cSlug}] CREATE Player succeeded`);
    const pId = createP.body.player.id;

    // B. Edit Player
    const editP = await request('PUT', `/api/team/${pId}`, {
      n: `${testPlayerName} (Updated)`,
      pos: 'Captain Starter',
      num: 99,
      clubId: cSlug
    }, { 'Authorization': `Bearer ${ownerToken}` });
    assert(editP.status === 200 && editP.body.success, `[${cSlug}] EDIT Player succeeded`);
    assert(editP.body.player.n === `${testPlayerName} (Updated)`, `[${cSlug}] Player name updated in response`);

    // Verify Persistence before delete
    const getPList = await request('GET', `/api/team?clubId=${cSlug}`);
    const foundP = (getPList.body.team || []).find(p => p.id === pId);
    assert(!!foundP && foundP.n === `${testPlayerName} (Updated)`, `[${cSlug}] Player persistence verified`);

    // Delete Player
    const delP = await request('DELETE', `/api/team/${pId}`, null, { 'Authorization': `Bearer ${ownerToken}` });
    assert(delP.status === 200 && delP.body.success, `[${cSlug}] DELETE Player succeeded`);

    // Verify Deleted
    const getPListAfter = await request('GET', `/api/team?clubId=${cSlug}`);
    assert(!getPListAfter.body.team.some(p => p.id === pId), `[${cSlug}] Player deletion confirmed`);

    // C. Create Match
    const createM = await request('POST', `/api/matches?clubId=${cSlug}`, {
      team1: `ACEIT ${cSlug}`,
      opp: testMatchOpp,
      team2: testMatchOpp,
      date: addDays(10),
      venue: 'ACEIT Campus Arena',
      status: 'upcoming',
      winner: 'none',
      clubId: cSlug
    }, { 'Authorization': `Bearer ${ownerToken}` });
    assert(createM.status === 200 && createM.body.success, `[${cSlug}] CREATE Match succeeded`);
    const mId = createM.body.match.id;

    // Delete Match
    const delM = await request('DELETE', `/api/matches/${mId}`, null, { 'Authorization': `Bearer ${ownerToken}` });
    assert(delM.status === 200 && delM.body.success, `[${cSlug}] DELETE Match succeeded`);

    // D. Create News
    const createN = await request('POST', `/api/news?clubId=${cSlug}`, {
      tag: 'Update',
      date: '27 Aug 2026',
      title: testNewsTitle,
      body: 'Testing news article content persistence.',
      featured: false,
      clubId: cSlug
    }, { 'Authorization': `Bearer ${ownerToken}` });
    assert(createN.status === 200 && createN.body.success, `[${cSlug}] CREATE News succeeded`);
    const nId = (createN.body.item && createN.body.item.id) || (createN.body.newsItem && createN.body.newsItem.id);

    // Delete News
    const delN = await request('DELETE', `/api/news/${nId}`, null, { 'Authorization': `Bearer ${ownerToken}` });
    assert(delN.status === 200 && delN.body.success, `[${cSlug}] DELETE News succeeded`);

    // E. Create Event
    const createE = await request('POST', `/api/events?clubId=${cSlug}`, {
      title: testEventTitle,
      description: 'Testing event item persistence.',
      date: '30 Oct 2026',
      venue: 'ACEIT Grounds',
      clubId: cSlug
    }, { 'Authorization': `Bearer ${ownerToken}` });
    assert(createE.status === 200 && createE.body.success, `[${cSlug}] CREATE Event succeeded`);
    const eId = createE.body.event.id;

    // Delete Event
    const delE = await request('DELETE', `/api/events/${eId}`, null, { 'Authorization': `Bearer ${ownerToken}` });
    assert(delE.status === 200 && delE.body.success, `[${cSlug}] DELETE Event succeeded`);
  }

  // ====================================================
  // 6. USER CRUD COMPLETE TEST
  // ====================================================
  console.log('\n[SECTION 6] USER CRUD (CREATE, EDIT, DUP CHECK, DELETE)');
  const dummyUser = `test_crud_${Date.now()}`;
  const createU = await request('POST', '/api/users', {
    name: 'Temporary Coordinator',
    username: dummyUser,
    email: `${dummyUser}@aceit.edu.in`,
    rtuRollNo: '23EATTMP01',
    password: 'Password123!',
    role: 'COORDINATOR',
    clubId: 'kabaddi',
    clubs: ['kabaddi'],
    permissions: ['players.*', 'matches.*']
  }, { 'Authorization': `Bearer ${ownerToken}` });
  assert(createU.status === 200 && createU.body.success, 'Created test user');
  const uId = createU.body.user._id || createU.body.user.id;

  // Edit user
  const editU = await request('PUT', `/api/users/${uId}`, {
    name: 'Temporary Coordinator Senior',
    position: 'Lead Mat Coach'
  }, { 'Authorization': `Bearer ${ownerToken}` });
  assert(editU.status === 200 && editU.body.success, 'Edited test user');
  assert(editU.body.user.name === 'Temporary Coordinator Senior', 'User name updated');

  // Verify exactly 1 user exists with this username
  const allUsersRes = await request('GET', '/api/users', null, { 'Authorization': `Bearer ${ownerToken}` });
  const matching = (allUsersRes.body.users || []).filter(u => u.username === dummyUser);
  assert(matching.length === 1, 'Exactly 1 user record exists (Zero duplicate creation)');

  // Delete user
  const delU = await request('DELETE', `/api/users/${uId}`, null, { 'Authorization': `Bearer ${ownerToken}` });
  assert(delU.status === 200 && delU.body.success, 'Deleted test user');

  // Verify deleted user cannot log in
  const failLogin = await request('POST', '/api/auth/login', {
    username: dummyUser,
    password: 'Password123!'
  });
  assert(failLogin.status === 401, 'Deleted user cannot log in (HTTP 401)');

  // ====================================================
  // 7. ROUTING & DIRECT CLUB PAGES
  // ====================================================
  console.log('\n[SECTION 7] ROUTING & DIRECT CLUB PAGES');
  const publicRoutes = ['/', '/club/spikers', '/club/kabaddi', '/club/cricket', '/club/dunkers', '/club/shuttlers', '/club/strikers-fc'];
  for (const r of publicRoutes) {
    const res = await request('GET', r);
    assert(res.status === 200, `Direct route '${r}' returned HTTP 200`);
    assert(typeof res.body === 'string' && res.body.includes('<!DOCTYPE html>'), `Route '${r}' delivered valid HTML shell`);
  }

  // ====================================================
  // 8. FINAL SUMMARY
  // ====================================================
  console.log('\n================================================================');
  console.log(`FINAL TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');
  if (failed > 0) {
    console.error('\nFailed tests summary:');
    failures.forEach((f, idx) => console.error(`  ${idx + 1}. ${f}`));
    process.exit(1);
  } else {
    console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
    process.exit(0);
  }
}

runComprehensiveSuite().catch(err => {
  console.error('Fatal error in comprehensive test suite:', err);
  process.exit(1);
});
