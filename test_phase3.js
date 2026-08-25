const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = {};
    let data = null;
    if (body) {
      data = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(url, { method, headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('=== Starting Phase 3 Automated Verification Tests ===\n');
  let passed = 0;
  let failed = 0;

  function assert(desc, condition) {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      failed++;
    }
  }

  try {
    // 1. Authenticate Owner
    console.log('1. Authenticating Admin / Owner...');
    const ownerLogin = await request('POST', '/api/auth/login', {
      username: 'founder',
      password: 'OwnerSecret123!'
    });
    assert('Owner logged in successfully', ownerLogin.status === 200 && ownerLogin.data.success);
    const ownerToken = ownerLogin.data.token;

    // 2. Register/Login Test Student
    console.log('\n2. Registering Test Student for Phase 3...');
    const ts = Date.now();
    const studentUser = `athlete_${ts}`;
    const studentSignup = await request('POST', '/api/auth/signup', {
      name: 'Rohan Sharma',
      username: studentUser,
      rtuRollNo: `22EACEX${ts.toString().slice(-4)}`,
      email: `${studentUser}@aceit.ac.in`,
      mobile: '9876543210',
      password: 'Password123!',
      sport: 'Volleyball'
    });
    assert('Student signed up successfully', studentSignup.status === 200 && studentSignup.data.success);
    const studentToken = studentSignup.data.token;
    const studentId = studentSignup.data.user._id || studentSignup.data.user.id;

    // 3. Test Event RSVP endpoints
    console.log('\n3. Testing Event RSVP Endpoints...');
    const eventId = 'ev_intercollege_2026';
    const rsvpCountsBefore = await request('GET', '/api/events/rsvp-counts');
    assert('GET /api/events/rsvp-counts returns success', rsvpCountsBefore.status === 200 && rsvpCountsBefore.data.success);

    const rsvpPost = await request('POST', `/api/events/${eventId}/rsvp`, {
      eventTitle: 'State Inter-College Volleyball Tournament',
      teamName: 'ACEIT Spikers A'
    }, studentToken);
    assert('Student RSVPed for event successfully', rsvpPost.status === 200 && rsvpPost.data.success && rsvpPost.data.rsvp.status === 'Registered');

    const myRsvps = await request('GET', '/api/profile/rsvps', null, studentToken);
    assert('GET /api/profile/rsvps contains registered event', myRsvps.status === 200 && myRsvps.data.rsvps.some(r => r.eventId === eventId));

    const attendeeList = await request('GET', `/api/events/${eventId}/attendees`, null, ownerToken);
    assert('Admin GET /api/events/:id/attendees returns student', attendeeList.status === 200 && attendeeList.data.attendees.some(a => a.username === studentUser));

    // 4. Test Match Availability & Starting Lineup
    console.log('\n4. Testing Match Availability & Starting Lineup...');
    const matchId = 'm_spk_vs_jiet';
    const setAvail = await request('POST', `/api/matches/${matchId}/availability`, {
      availability: 'Available',
      note: 'Fit and ready for outside hitter position'
    }, studentToken);
    assert('Student set match availability to Available', setAvail.status === 200 && setAvail.data.success);

    const myAvail = await request('GET', '/api/profile/match-availability', null, studentToken);
    assert('GET /api/profile/match-availability returns record', myAvail.status === 200 && myAvail.data.records.some(r => r.matchId === matchId && r.availability === 'Available'));

    // Admin sets starting lineup
    const setLineup = await request('PUT', `/api/matches/${matchId}/lineup`, {
      starters: [
        { userId: studentId, username: studentUser, name: 'Rohan Sharma', position: 'Outside Hitter' }
      ]
    }, ownerToken);
    assert('Admin set starting lineup', setLineup.status === 200 && setLineup.data.success);

    const getLineup = await request('GET', `/api/matches/${matchId}/lineup`);
    assert('GET /api/matches/:id/lineup returns starting 6', getLineup.status === 200 && Array.isArray(getLineup.data.starters) && getLineup.data.starters.some(s => s.username === studentUser));

    // 5. Test Player Stats & Performance Badges
    console.log('\n5. Testing Player Stats & Glowing Performance Badges...');
    const updateStats = await request('PUT', `/api/users/${studentUser}/stats`, {
      stats: {
        matchesPlayed: 8,
        points: 45,
        spikes: 28,
        blocks: 12,
        aces: 9,
        mvpAwards: 2
      },
      badges: [
        {
          badgeKey: 'MVP_GOLD',
          title: 'MVP of the Match',
          icon: '🏆',
          glow: 'rgba(241, 196, 15, 0.95)',
          bg: '#F1C40F',
          text: '#000000',
          description: 'Awarded for extraordinary match-winning performance'
        },
        {
          badgeKey: 'TOP_SPIKER',
          title: 'Top Spiker',
          icon: '⚡',
          glow: 'rgba(230, 126, 34, 0.9)',
          bg: '#E67E22',
          text: '#FFFFFF',
          description: 'Dominant offensive attacker'
        }
      ]
    }, ownerToken);
    assert('Admin updated player stats & awarded badges', updateStats.status === 200 && updateStats.data.success);

    // Expected MVP Points: (2 * 15) + (45 * 1) + (28 * 2) + (12 * 3) + (9 * 2) = 30 + 45 + 56 + 36 + 18 = 185
    assert('Calculated MVP points matches formula (185 pts)', updateStats.data.stats.mvpPoints === 185);
    assert('Player has 2 badges awarded', updateStats.data.badges.length === 2);

    const playerStatsPublic = await request('GET', `/api/users/${studentUser}/stats`);
    assert('GET /api/users/:username/stats returns stats & badges', playerStatsPublic.status === 200 && playerStatsPublic.data.stats.points === 45 && playerStatsPublic.data.badges.length === 2);

    const studentMyStats = await request('GET', '/api/profile/stats', null, studentToken);
    assert('GET /api/profile/stats returns personal stats', studentMyStats.status === 200 && studentMyStats.data.stats.mvpAwards === 2);

    // 6. Test MVP Leaderboard
    console.log('\n6. Testing College MVP Leaderboard...');
    const leaderboard = await request('GET', '/api/leaderboard');
    assert('GET /api/leaderboard returns athletes list', leaderboard.status === 200 && leaderboard.data.success && Array.isArray(leaderboard.data.leaderboard));
    
    const ourAthleteInLb = leaderboard.data.leaderboard.find(a => a.username === studentUser);
    assert('Student is featured on Leaderboard with MVP points', ourAthleteInLb && ourAthleteInLb.stats.mvpPoints === 185);
    assert('Privacy Check: rtuRollNo is excluded from Leaderboard', ourAthleteInLb && ourAthleteInLb.rtuRollNo === undefined);
    assert('Privacy Check: email is excluded from Leaderboard', ourAthleteInLb && ourAthleteInLb.email === undefined);
    assert('Privacy Check: mobile is excluded from Leaderboard', ourAthleteInLb && ourAthleteInLb.mobile === undefined);

    // 7. Test Cancel RSVP
    console.log('\n7. Testing Cancel RSVP...');
    const cancelRsvp = await request('DELETE', `/api/events/${eventId}/rsvp`, null, studentToken);
    assert('Student cancelled RSVP successfully', cancelRsvp.status === 200 && cancelRsvp.data.success);

    const myRsvpsAfter = await request('GET', '/api/profile/rsvps', null, studentToken);
    assert('GET /api/profile/rsvps shows Cancelled or removed', myRsvpsAfter.status === 200 && myRsvpsAfter.data.rsvps.every(r => r.eventId !== eventId || r.status === 'Cancelled'));

    console.log(`\n=== Verification Complete: ${passed} Passed, ${failed} Failed ===`);
    if (failed === 0) {
      console.log('🎉 ALL PHASE 3 TESTS PASSED PERFECTLY!\n');
      process.exit(0);
    } else {
      console.error('❌ Some tests failed.\n');
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  }
}

runTests();
