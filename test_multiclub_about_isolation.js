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
  console.log('MULTI-CLUB ABOUT & MISSION/VISION ISOLATION TEST');
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
  console.log('[1] Authentication');
  const loginRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, { username: 'founder', password: 'OwnerSecret123!' });

  assert(loginRes.status === 200 && loginRes.body.token, 'Owner login successful');
  const token = loginRes.body.token;

  // 2. Fetch Spikers About
  console.log('\n[2] Spikers About Section (Volleyball Master)');
  const spikersRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/db?clubId=spikers',
    method: 'GET'
  });

  assert(spikersRes.status === 200 && spikersRes.body.data, 'Fetched Spikers database');
  const spikersAbout = spikersRes.body.data.about || {};
  assert(spikersAbout.mission && spikersAbout.mission.includes('volleyball'), 'Spikers mission contains volleyball context');
  assert(spikersAbout.vision && spikersAbout.vision.includes('volleyball'), 'Spikers vision contains volleyball context');

  // 3. Save Custom About for Dunkers (Basketball)
  console.log('\n[3] Save Custom About for Dunkers (Basketball)');
  const customDunkersAbout = {
    eyebrow: 'Court Dominance',
    title: 'Every possession counts,\nevery basket earned.',
    sub: 'ACEIT Dunkers squad trains with relentless pace, sharpshooting accuracy, and lockdown team defense.',
    mission: 'To develop high-IQ, fast-paced basketball players who execute under pressure with unity, grit, and passion.',
    vision: 'To build an elite championship-winning basketball legacy representing Arya College across national tourneys.'
  };

  const saveDunkersRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/save-all?clubId=dunkers',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, {
    about: customDunkersAbout,
    clubId: 'dunkers'
  });

  assert(saveDunkersRes.status === 200 && saveDunkersRes.body.success, 'Saved custom About section for Dunkers');

  // 4. Save Custom About for Kabaddi
  console.log('\n[4] Save Custom About for Kabaddi');
  const customKabaddiAbout = {
    eyebrow: 'Pride of ACEIT',
    title: 'Strength on the mat,\nunstoppable in raid.',
    sub: 'ACEIT Kabaddi brings together fierce raiders and ironclad defenders trained for collegiate championships.',
    mission: 'To cultivate mental grit, explosive raid power, and tactical defense in traditional and modern collegiate Kabaddi.',
    vision: 'To be the premier collegiate Kabaddi powerhouse in Rajasthan, producing champion athletes who play with honor.'
  };

  const saveKabaddiRes = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/save-all?clubId=kabaddi',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, {
    about: customKabaddiAbout,
    clubId: 'kabaddi'
  });

  assert(saveKabaddiRes.status === 200 && saveKabaddiRes.body.success, 'Saved custom About section for Kabaddi');

  // 5. Verify Isolation: Fetch each club's About independently
  console.log('\n[5] Strict Isolation Verification Across Clubs');
  
  const getDunkers = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/db?clubId=dunkers',
    method: 'GET'
  });
  assert(getDunkers.body.data.about.mission === customDunkersAbout.mission, 'Dunkers returns its own custom basketball mission');
  assert(getDunkers.body.data.about.vision === customDunkersAbout.vision, 'Dunkers returns its own custom basketball vision');

  const getKabaddi = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/db?clubId=kabaddi',
    method: 'GET'
  });
  assert(getKabaddi.body.data.about.mission === customKabaddiAbout.mission, 'Kabaddi returns its own custom kabaddi mission');
  assert(getKabaddi.body.data.about.vision === customKabaddiAbout.vision, 'Kabaddi returns its own custom kabaddi vision');

  const getSpikers = await req({
    hostname: 'localhost',
    port: 3000,
    path: '/api/db?clubId=spikers',
    method: 'GET'
  });
  assert(getSpikers.body.data.about.mission !== customDunkersAbout.mission, 'Spikers was NOT overwritten by Dunkers');
  assert(getSpikers.body.data.about.mission !== customKabaddiAbout.mission, 'Spikers was NOT overwritten by Kabaddi');
  assert(getSpikers.body.data.about.mission.includes('volleyball'), 'Spikers retains its original volleyball mission');

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
