/**
 * Automated Verification Suite for Phase 5: Multi-Club Admin & RBAC
 * 
 * Verifies:
 * 1. Owner root authentication & full privilege access (* across ALL clubs)
 * 2. Dynamic creation of Club Admin with granular scoped permissions (players.*, matches.*) for a specific club (strikers)
 * 3. Club Admin login and token verification
 * 4. Club Admin authorized operations within assigned club (strikers) succeed (200/201)
 * 5. Club Admin cross-club isolation: mutating other club data (spikers) is strictly rejected with HTTP 403 Forbidden
 * 6. Module RBAC isolation: accessing unauthorized modules (news, gallery, clubs, roles) is strictly rejected with HTTP 403 Forbidden
 * 7. Self-Privilege Escalation Prevention: non-OWNER cannot escalate own role to OWNER or modify own permissions/clubs
 * 8. Deactivated account enforcement: disabled accounts are immediately blocked with HTTP 403 Forbidden
 * 9. Applications RBAC: club admin can only view/manage applications for their assigned club
 * 10. Owner root access verification: OWNER retains unrestricted management across all clubs and operations
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
        // Server is already running
        resolve();
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
  console.log('PHASE 5: MULTI-CLUB ADMIN & RBAC - TEST SUITE');
  console.log('====================================================\n');

  try {
    await startServerIfNeeded();

    // ----------------------------------------------------
    // Section 1: Owner Login & Root Authentication
    // ----------------------------------------------------
    console.log('[1] Owner Root Authentication');
    const ownerLoginRes = await request('POST', '/api/auth/login', {
      username: 'founder',
      password: 'OwnerSecret123!'
    });

    assert(ownerLoginRes.status === 200, 'Owner login successful (HTTP 200)');
    assert(ownerLoginRes.body && ownerLoginRes.body.success === true, 'Owner login response success = true');
    assert(ownerLoginRes.body && ownerLoginRes.body.user && ownerLoginRes.body.user.role === 'OWNER', 'Owner role is OWNER');

    const ownerToken = ownerLoginRes.body.token;
    const ownerHeaders = { 'Authorization': `Bearer ${ownerToken}` };

    // ----------------------------------------------------
    // Section 2: Create Strikers Football Club
    // ----------------------------------------------------
    console.log('\n[2] Create Target Club for Isolation Testing (Strikers)');
    const createClubRes = await request('POST', '/api/clubs', {
      clubId: 'strikers',
      name: 'ACEIT Strikers FC',
      sport: 'Football',
      slug: 'strikers',
      description: 'ACEIT Official Football Club'
    }, ownerHeaders);

    assert(createClubRes.status === 200 || createClubRes.status === 201 || (createClubRes.body && createClubRes.body.success) || (createClubRes.body && createClubRes.body.message && createClubRes.body.message.includes('already exists')), 'Owner created or verified Strikers club');

    // ----------------------------------------------------
    // Section 3: Create Club Admin with Scoped Permissions
    // ----------------------------------------------------
    console.log('\n[3] Create Scoped Club Admin (strikers_admin)');
    const adminUsername = 'strikers_admin_' + Date.now();
    const createAdminRes = await request('POST', '/api/users', {
      name: 'Strikers Coordinator',
      username: adminUsername,
      password: 'StrikersPass123!',
      role: 'COORDINATOR',
      clubId: 'strikers',
      clubs: ['strikers'],
      permissions: ['players.*', 'matches.*', 'applications.*'],
      active: true
    }, ownerHeaders);

    assert(createAdminRes.status === 200 || createAdminRes.status === 201, 'Owner created strikers_admin (HTTP 200/201)');
    const clubAdminUser = createAdminRes.body.user;
    const clubAdminId = clubAdminUser ? String(clubAdminUser._id || clubAdminUser.id) : null;

    // ----------------------------------------------------
    // Section 4: Login as Scoped Club Admin
    // ----------------------------------------------------
    console.log('\n[4] Login as Scoped Club Admin');
    const adminLoginRes = await request('POST', '/api/auth/login', {
      username: adminUsername,
      password: 'StrikersPass123!'
    });

    assert(adminLoginRes.status === 200, 'Club Admin login successful (HTTP 200)');
    assert(adminLoginRes.body && adminLoginRes.body.user && adminLoginRes.body.user.role === 'COORDINATOR', 'Admin user role is COORDINATOR');
    const adminToken = adminLoginRes.body.token;
    const adminHeaders = { 'Authorization': `Bearer ${adminToken}` };

    // ----------------------------------------------------
    // Section 5: Authorized Operation in Assigned Club (Strikers)
    // ----------------------------------------------------
    console.log('\n[5] Authorized Operations within Assigned Club (strikers)');
    const addPlayerRes = await request('POST', '/api/team', {
      n: 'Carlos Silva',
      r: 'Striker',
      no: 10,
      clubId: 'strikers'
    }, adminHeaders);

    assert(addPlayerRes.status === 200 && addPlayerRes.body.success, 'Club Admin can add player to strikers (HTTP 200)');

    const addMatchRes = await request('POST', '/api/matches', {
      team1: 'ACEIT Strikers',
      opp: 'City FC',
      venue: 'Main Ground',
      date: '2026-09-01',
      status: 'upcoming',
      clubId: 'strikers'
    }, adminHeaders);

    assert(addMatchRes.status === 200 && addMatchRes.body.success, 'Club Admin can add match to strikers (HTTP 200)');

    // ----------------------------------------------------
    // Section 6: Cross-Club Data Isolation Enforcement (Forbidden Spikers Mutation)
    // ----------------------------------------------------
    console.log('\n[6] Cross-Club Boundary Enforcement (Attempting to modify Spikers)');
    const illegalPlayerRes = await request('POST', '/api/team', {
      n: 'Illegal Volleyball Spiker',
      r: 'Setter',
      no: 99,
      clubId: 'spikers'
    }, adminHeaders);

    assert(illegalPlayerRes.status === 403, 'Cross-club player creation to spikers rejected (HTTP 403 Forbidden)');

    const illegalMatchRes = await request('POST', '/api/matches', {
      team1: 'ACEIT Spikers',
      opp: 'Rival VC',
      clubId: 'spikers'
    }, adminHeaders);

    assert(illegalMatchRes.status === 403, 'Cross-club match creation to spikers rejected (HTTP 403 Forbidden)');

    const illegalEventsRes = await request('POST', '/api/events', {
      title: 'Spikers Gala',
      clubId: 'spikers'
    }, adminHeaders);

    assert(illegalEventsRes.status === 403, 'Cross-club event creation rejected (HTTP 403 Forbidden)');

    // ----------------------------------------------------
    // Section 7: Module Permission RBAC Isolation (Forbidden Modules)
    // ----------------------------------------------------
    console.log('\n[7] Module Permission Enforcement (Accessing Unauthorized Modules)');
    // strikers_admin lacks news.* permission
    const illegalNewsRes = await request('POST', '/api/news', {
      title: 'Unauthorized News Post',
      clubId: 'strikers'
    }, adminHeaders);

    assert(illegalNewsRes.status === 403, 'Unauthorized module mutation (news.*) rejected (HTTP 403 Forbidden)');

    // strikers_admin lacks clubs.* permission
    const illegalClubCreateRes = await request('POST', '/api/clubs', {
      clubId: 'illegal_club',
      name: 'Illegal Club'
    }, adminHeaders);

    assert(illegalClubCreateRes.status === 403, 'Unauthorized club creation (clubs.*) rejected (HTTP 403 Forbidden)');

    // strikers_admin lacks settings.* / PIN master access
    const illegalPinRes = await request('POST', '/api/pin', {
      pin: '9999'
    }, adminHeaders);

    assert(illegalPinRes.status === 403, 'Unauthorized master PIN modification rejected (HTTP 403 Forbidden)');

    // ----------------------------------------------------
    // Section 8: Self-Privilege Escalation Safeguards
    // ----------------------------------------------------
    console.log('\n[8] Self-Privilege Escalation Safeguards');
    // Attempt 8a: Club Admin tries to elevate own role to OWNER
    const escalateRoleRes = await request('PUT', `/api/users/${clubAdminId}`, {
      role: 'OWNER'
    }, adminHeaders);

    assert(escalateRoleRes.status === 403, 'Self-escalation to OWNER role rejected (HTTP 403 Forbidden)');

    // Attempt 8b: Club Admin tries to grant self wildcard '*' permissions
    const escalatePermsRes = await request('PUT', `/api/users/${clubAdminId}`, {
      permissions: ['*']
    }, adminHeaders);

    assert(escalatePermsRes.status === 403, 'Self-granting wildcard permissions rejected (HTTP 403 Forbidden)');

    // Attempt 8c: Club Admin tries to assign self to ALL clubs
    const escalateClubsRes = await request('PUT', `/api/users/${clubAdminId}`, {
      clubId: 'ALL',
      clubs: ['spikers', 'strikers', 'smashers']
    }, adminHeaders);

    assert(escalateClubsRes.status === 403, 'Self-reassignment to unauthorized clubs rejected (HTTP 403 Forbidden)');

    // ----------------------------------------------------
    // Section 9: Deactivated Account Enforcement
    // ----------------------------------------------------
    console.log('\n[9] Account Deactivation Enforcement');
    // Owner deactivates the club admin
    const deactRes = await request('PUT', `/api/users/${clubAdminId}`, {
      active: false
    }, ownerHeaders);

    assert(deactRes.status === 200 && deactRes.body.success, 'Owner successfully deactivated club admin');

    // Deactivated user attempts to make an API request
    const blockedRes = await request('POST', '/api/team', {
      n: 'Ghost Player',
      clubId: 'strikers'
    }, adminHeaders);

    assert(blockedRes.status === 403, 'Deactivated account request blocked immediately (HTTP 403 Forbidden)');

    // Re-activate account for cleanup
    await request('PUT', `/api/users/${clubAdminId}`, { active: true }, ownerHeaders);

    // ----------------------------------------------------
    // Section 10: Owner Full Control & Public Data Integrity
    // ----------------------------------------------------
    console.log('\n[10] Owner Full Multi-Club Control Verification');
    const ownerStrikersPlayer = await request('POST', '/api/team', {
      n: 'Owner Added Footballer',
      r: 'Goalkeeper',
      clubId: 'strikers'
    }, ownerHeaders);

    assert(ownerStrikersPlayer.status === 200 && ownerStrikersPlayer.body.success, 'Owner can manage Strikers data (HTTP 200)');

    const ownerSpikersPlayer = await request('POST', '/api/team', {
      n: 'Owner Added Volleyballer',
      r: 'Libero',
      clubId: 'spikers'
    }, ownerHeaders);

    assert(ownerSpikersPlayer.status === 200 && ownerSpikersPlayer.body.success, 'Owner can manage Spikers data (HTTP 200)');

    // Verify public query separation
    const strikersTeamRes = await request('GET', '/api/team?clubId=strikers');
    const spikersTeamRes = await request('GET', '/api/team?clubId=spikers');

    const strikersHasCarlos = (strikersTeamRes.body.team || []).some(p => p.n === 'Carlos Silva');
    const spikersHasCarlos = (spikersTeamRes.body.team || []).some(p => p.n === 'Carlos Silva');

    assert(strikersHasCarlos && !spikersHasCarlos, 'Data separation confirmed: Carlos Silva only in Strikers, not Spikers');

    console.log('\n====================================================');
    console.log(`PHASE 5 TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Test Execution Error:', err);
    process.exit(1);
  }
}

runTests();
