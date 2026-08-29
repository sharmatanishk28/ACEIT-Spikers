const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('Testing Multi-Sport Live Scorer Suite...');
  let passed = 0;
  let failed = 0;

  function assert(desc, condition) {
    if (condition) {
      console.log(`  ✅ ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. Authenticate as owner/admin
  const loginRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'founder', password: 'OwnerSecret123!' });

  assert('Admin/Owner Login', loginRes.status === 200 && loginRes.data.success);
  const token = loginRes.data.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };

  // Test clubs
  const sportsToTest = [
    { clubId: 'cricket', sport: 'cricket', actions: [{ pointType: 'run', actionId: 'single', points: 1 }, { pointType: 'boundary', actionId: 'four', points: 4 }, { pointType: 'wicket', actionId: 'wicket', points: 0 }] },
    { clubId: 'strikers-fc', sport: 'football', actions: [{ pointType: 'goal', actionId: 'goal', points: 1 }, { pointType: 'shot', actionId: 'shot', points: 0 }, { pointType: 'yellow_card', actionId: 'yellow_card', points: 0 }] },
    { clubId: 'dunkers', sport: 'basketball', actions: [{ pointType: 'freethrow', actionId: 'freethrow', points: 1 }, { pointType: 'threepointer', actionId: 'threepointer', points: 3 }, { pointType: 'foul', actionId: 'foul', points: 0 }] },
    { clubId: 'kabaddi', sport: 'kabaddi', actions: [{ pointType: 'touch', actionId: 'touch', points: 1 }, { pointType: 'super_raid', actionId: 'super_raid', points: 3 }, { pointType: 'tackle', actionId: 'tackle', points: 1 }] },
    { clubId: 'spikers', sport: 'volleyball', actions: [{ pointType: 'spike', actionId: 'spike', points: 1 }, { pointType: 'block', actionId: 'block', points: 1 }, { pointType: 'ace', actionId: 'ace', points: 1 }] },
    { clubId: 'shuttlers', sport: 'badminton', actions: [{ pointType: 'point', actionId: 'point', points: 1 }, { pointType: 'smash', actionId: 'smash', points: 1 }, { pointType: 'ace', actionId: 'ace', points: 1 }] }
  ];

  for (const s of sportsToTest) {
    console.log(`\nTesting sport: ${s.sport} (Club: ${s.clubId})`);
    
    // Create match
    const createRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/api/matches',
      method: 'POST',
      headers: authHeaders
    }, {
      team1: 'ACEIT ' + s.sport.toUpperCase(),
      team2: 'Rival ' + s.sport.toUpperCase(),
      venue: 'Main Arena',
      clubId: s.clubId,
      sport: s.sport,
      status: 'upcoming'
    });

    assert(`Create match for ${s.sport}`, createRes.status === 200 && createRes.data.success);
    const matchId = createRes.data.match ? (createRes.data.match.id || createRes.data.match._id) : null;
    assert(`Match ID exists (${matchId})`, !!matchId);

    // Start Live
    const startRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/matches/${matchId}/live-start`,
      method: 'POST',
      headers: authHeaders
    }, {});
    if (startRes.status !== 200) console.error('Start live failed response:', startRes);
    assert(`Start live match for ${s.sport}`, startRes.status === 200 && startRes.data && startRes.data.success);

    // Score actions
    for (const act of s.actions) {
      const scoreRes = await request({
        hostname: 'localhost',
        port: 3000,
        path: `/api/matches/${matchId}/live-score`,
        method: 'POST',
        headers: authHeaders
      }, {
        team: 'home',
        pointType: act.pointType,
        actionId: act.actionId,
        points: act.points,
        playerUsername: 'admin'
      });
      if (scoreRes.status !== 200) console.error('Score action failed response:', scoreRes);
      assert(`Score action ${act.actionId} (+${act.points} pts) for ${s.sport}`, scoreRes.status === 200 && scoreRes.data && scoreRes.data.success);
    }

    // Get live status
    const getLiveRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/matches/${matchId}/live`,
      method: 'GET',
      headers: authHeaders
    });
    if (getLiveRes.status !== 200) console.error('Get live failed response:', getLiveRes);
    assert(`Get live status for ${s.sport}`, getLiveRes.status === 200 && getLiveRes.data && getLiveRes.data.success);
    assert(`Sport is resolved correctly as ${s.sport}`, getLiveRes.data && getLiveRes.data.liveState && getLiveRes.data.liveState.sport === s.sport);

    // Finalize match
    const finishRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: `/api/matches/${matchId}/live-finish`,
      method: 'POST',
      headers: authHeaders
    }, {
      winner: 'team1',
      finalScore1: getLiveRes.data && getLiveRes.data.liveState ? getLiveRes.data.liveState.liveScoreHome : 1,
      finalScore2: 0,
      scoreSummary: getLiveRes.data && getLiveRes.data.liveState ? (getLiveRes.data.liveState.scoreSummary || 'Match Finished') : 'Match Finished'
    });
    assert(`Finalize match for ${s.sport}`, finishRes.status === 200 && finishRes.data && finishRes.data.success);
  }

  console.log(`\n========================================`);
  console.log(`Summary: Passed: ${passed}, Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
