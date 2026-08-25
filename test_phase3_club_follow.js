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
  console.log('PHASE 3 CLUB FOLLOW / JOIN TEST SUITE');
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
    // 0. Ensure secondary test club 'strikers' exists
    const ownerLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'founder', password: 'OwnerSecret123!' }
    });
    const ownerHeaders = { 'Authorization': `Bearer ${ownerLogin.data.token}` };

    await request('/api/clubs', {
      method: 'POST',
      headers: ownerHeaders,
      body: {
        clubId: 'strikers',
        name: 'ACEIT Strikers',
        sport: 'Football',
        slug: 'strikers',
        description: 'Official Football Club'
      }
    });

    // Also add a third club 'smashers' (Badminton)
    await request('/api/clubs', {
      method: 'POST',
      headers: ownerHeaders,
      body: {
        clubId: 'smashers',
        name: 'ACEIT Smashers',
        sport: 'Badminton',
        slug: 'smashers',
        description: 'Official Badminton Club'
      }
    });

    // 1. Create a clean student user
    console.log('1. Setting Up Student Athlete...');
    const testUsername = 'student_fan_' + Date.now().toString(36);
    const testEmail = `fan_${Date.now().toString(36)}@arya.edu.in`;
    const testPassword = 'FanPassword123!';

    const signupRes = await request('/api/auth/signup', {
      method: 'POST',
      body: {
        name: 'Aryan Sports Fan',
        username: testUsername,
        rtuRollNo: '21EARYCS555',
        email: testEmail,
        password: testPassword,
        clubs: [] // starts with zero follows to test clean follow flow
      }
    });

    assert(signupRes.status === 200 && signupRes.data.success, 'Student registered successfully');
    const studentToken = signupRes.data.token;
    const studentHeaders = { 'Authorization': `Bearer ${studentToken}` };

    // 2. View Active Clubs
    console.log('\n2. Testing Active Clubs Discovery...');
    const clubsRes = await request('/api/clubs', { headers: studentHeaders });
    assert(clubsRes.status === 200 && Array.isArray(clubsRes.data.clubs), 'GET /api/clubs returns clubs list');
    const clubIds = clubsRes.data.clubs.map(c => c.clubId || c.slug);
    assert(clubIds.includes('spikers'), 'Clubs list includes "spikers"');
    assert(clubIds.includes('strikers'), 'Clubs list includes "strikers"');
    assert(clubIds.includes('smashers'), 'Clubs list includes "smashers"');

    // 3. Follow Spikers
    console.log('\n3. Testing Follow Primary Club (Spikers)...');
    const followSpikers = await request('/api/profile/clubs/join', {
      method: 'POST',
      headers: studentHeaders,
      body: { clubSlug: 'spikers' }
    });
    assert(followSpikers.status === 200 && followSpikers.data.success, 'POST /api/profile/clubs/join followed "spikers"');
    assert(followSpikers.data.clubs.includes('spikers'), 'Spikers is now in clubs list');

    // 4. Follow Second Club (Strikers)
    console.log('\n4. Testing Follow Second Club (Strikers)...');
    const followStrikers = await request('/api/clubs/strikers/follow', {
      method: 'POST',
      headers: studentHeaders
    });
    assert(followStrikers.status === 200 && followStrikers.data.success, 'POST /api/clubs/:id/follow followed "strikers"');
    assert(followStrikers.data.clubs.includes('strikers'), 'Strikers is now in clubs list');
    assert(followStrikers.data.clubs.includes('spikers'), 'User follows multiple clubs simultaneously');

    // 5. Prevent Duplicate Follows
    console.log('\n5. Testing Duplicate Follow Prevention...');
    const dupFollow = await request('/api/profile/clubs/join', {
      method: 'POST',
      headers: studentHeaders,
      body: { clubSlug: 'strikers' }
    });
    assert(dupFollow.status === 200 && dupFollow.data.success, 'Duplicate follow handled gracefully');
    const countStrikers = dupFollow.data.clubs.filter(c => c === 'strikers').length;
    assert(countStrikers === 1, 'Duplicate follow prevented: "strikers" appears exactly once in clubs array');

    // 6. Verify "My Clubs" Endpoint (Full Details)
    console.log('\n6. Testing "My Clubs" Details Endpoint (/api/profile/clubs)...');
    const myClubsRes = await request('/api/profile/clubs', { headers: studentHeaders });
    assert(myClubsRes.status === 200 && myClubsRes.data.success, 'GET /api/profile/clubs responds OK');
    assert(Array.isArray(myClubsRes.data.clubs) && myClubsRes.data.clubs.length >= 2, 'Returns full details for followed clubs');
    const myClubNames = myClubsRes.data.clubs.map(c => c.name);
    assert(myClubNames.includes('ACEIT Spikers'), '"ACEIT Spikers" present in My Clubs details');
    assert(myClubNames.includes('ACEIT Strikers'), '"ACEIT Strikers" present in My Clubs details');

    // 7. Test Follow/Following Toggle
    console.log('\n7. Testing Follow/Following Toggle Button (/api/clubs/:id/toggle-follow)...');
    const toggleJoinSmashers = await request('/api/clubs/smashers/toggle-follow', {
      method: 'POST',
      headers: studentHeaders
    });
    assert(toggleJoinSmashers.status === 200 && toggleJoinSmashers.data.isFollowing === true, 'Toggle follow on "smashers" joins club (isFollowing: true)');

    const toggleLeaveSmashers = await request('/api/clubs/smashers/toggle-follow', {
      method: 'POST',
      headers: studentHeaders
    });
    assert(toggleLeaveSmashers.status === 200 && toggleLeaveSmashers.data.isFollowing === false, 'Toggle follow on "smashers" leaves club (isFollowing: false)');
    assert(!toggleLeaveSmashers.data.clubs.includes('smashers'), 'Smashers removed from clubs list');

    // 8. Test Unfollow / Leave Club
    console.log('\n8. Testing Unfollow / Leave Club (/api/profile/clubs/leave)...');
    const leaveSpikers = await request('/api/profile/clubs/leave', {
      method: 'POST',
      headers: studentHeaders,
      body: { clubSlug: 'spikers' }
    });
    assert(leaveSpikers.status === 200 && leaveSpikers.data.success, 'POST /api/profile/clubs/leave unfollows "spikers"');
    assert(!leaveSpikers.data.clubs.includes('spikers'), '"spikers" removed from user clubs');
    assert(leaveSpikers.data.clubs.includes('strikers'), '"strikers" remains followed');

    // 9. Verify Refresh & Persistence
    console.log('\n9. Testing Database Persistence Across Fresh Requests...');
    const freshProfile = await request('/api/profile/me', { headers: studentHeaders });
    assert(freshProfile.status === 200 && freshProfile.data.success, 'GET /api/profile/me retrieved fresh profile');
    assert(!freshProfile.data.profile.clubs.includes('spikers'), 'Unfollowed "spikers" state persisted in database');
    assert(freshProfile.data.profile.clubs.includes('strikers'), 'Followed "strikers" state persisted in database');

    const freshMyClubs = await request('/api/profile/clubs', { headers: studentHeaders });
    const freshNames = freshMyClubs.data.clubs.map(c => c.name);
    assert(!freshNames.includes('ACEIT Spikers'), 'My Clubs reflects unfollowed state');
    assert(freshNames.includes('ACEIT Strikers'), 'My Clubs reflects followed state');

  } catch (err) {
    console.error('Unexpected error during Phase 3 test execution:', err);
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
