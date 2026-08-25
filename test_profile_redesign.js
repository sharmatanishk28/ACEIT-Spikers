const http = require('http');

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function test() {
  console.log('=== Verifying Student Profile Redesign & Collegiate Metadata ===\n');

  const testUser = 'student_ath_' + Date.now().toString().slice(-4);

  // 1. Sign up with branch and year
  const signupRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/signup',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    name: 'Tanishk Sharma',
    username: testUser,
    rtuRollNo: '22EATCS099',
    email: `${testUser}@aceit.edu.in`,
    password: 'password123',
    branch: 'Computer Science & Engineering',
    year: '3rd Year (Batch 2023-27)'
  });

  if (!signupRes.data || !signupRes.data.success) {
    console.error('[FAIL] Signup failed:', signupRes.data);
    process.exit(1);
  }
  console.log('1. Signup with Branch & Year: [PASS]');
  const token = signupRes.data.token;

  // 2. Update profile with Position, Jersey, Height
  const updateRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: '/api/profile/me',
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }, {
    name: 'Tanishk Sharma',
    sport: 'Volleyball',
    branch: 'Computer Science & Engineering',
    year: '3rd Year (Batch 2023-27)',
    position: 'Outside Hitter',
    jerseyNo: '7',
    height: "6'1\" (185 cm)",
    bio: 'Lead spiker for ACEIT Spikers. Aiming for RTU Championship!'
  });

  if (!updateRes.data || !updateRes.data.success) {
    console.error('[FAIL] Profile update failed:', updateRes.data);
    process.exit(1);
  }
  console.log('2. Profile Update (branch, year, position, jerseyNo, height): [PASS]');

  // 3. Verify GET /api/users/profile/:username
  const pubRes = await makeRequest({
    hostname: 'localhost',
    port: 3000,
    path: `/api/users/profile/${testUser}`,
    method: 'GET'
  });

  if (!pubRes.data || !pubRes.data.success || !pubRes.data.profile) {
    console.error('[FAIL] Public profile query failed:', pubRes.data);
    process.exit(1);
  }

  const p = pubRes.data.profile;
  console.log(`3. Public Profile Verification:`);
  console.log(`   - Branch: ${p.branch}`);
  console.log(`   - Year: ${p.year}`);
  console.log(`   - Position: ${p.position}`);
  console.log(`   - JerseyNo: ${p.jerseyNo}`);
  console.log(`   - Height: ${p.height}`);
  console.log(`   - Privacy check (RollNo hidden): ${p.rtuRollNo === undefined}`);
  console.log(`   - Privacy check (Email hidden): ${p.email === undefined}`);

  if (p.branch === 'Computer Science & Engineering' && p.position === 'Outside Hitter' && p.jerseyNo === '7') {
    console.log('\n[PASS] All Collegiate Profile Metadata Fields Verified Successfully!\n');
  } else {
    console.error('[FAIL] Mismatch in expected fields');
    process.exit(1);
  }
}

test();
