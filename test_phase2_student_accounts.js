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
  console.log('PHASE 2 STUDENT ACCOUNTS & PROFILE TEST SUITE');
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
    const testUsername = 'rohit_test_' + Date.now().toString(36);
    const testEmail = `rohit_${Date.now().toString(36)}@arya.edu.in`;
    const testPassword = 'StudentSecret123!';
    const testRollNo = '21EARYCS999';

    // 1. Student Signup
    console.log('1. Testing Student Signup...');
    const signupRes = await request('/api/auth/signup', {
      method: 'POST',
      body: {
        name: 'Rohit Sharma',
        username: testUsername,
        rtuRollNo: testRollNo,
        email: testEmail,
        mobile: '+91 9876543210',
        password: testPassword,
        photo: 'https://images.unsplash.com/photo-student',
        branch: 'Computer Science',
        year: '3rd Year',
        position: 'Setter',
        jerseyNo: '18',
        height: '6ft 1in',
        sport: 'Volleyball',
        clubs: ['spikers']
      }
    });

    assert(signupRes.status === 200 && signupRes.data.success, 'POST /api/auth/signup registers student account', JSON.stringify(signupRes.data));
    assert(signupRes.data.token && typeof signupRes.data.token === 'string', 'Signup generates valid JWT token');
    assert(signupRes.data.user && !signupRes.data.user.passwordHash, 'Signup response does NOT leak passwordHash');
    assert(signupRes.data.user && signupRes.data.user.role === 'STUDENT', 'User is assigned STUDENT role');
    assert(signupRes.data.user && Array.isArray(signupRes.data.user.clubs), 'User has clubs array initialized');

    const studentToken = signupRes.data.token;
    const studentHeaders = { 'Authorization': `Bearer ${studentToken}` };

    // 2. Duplicate Username Rejection
    console.log('\n2. Testing Duplicate Username/Email Protections...');
    const dupUserRes = await request('/api/auth/signup', {
      method: 'POST',
      body: {
        name: 'Duplicate User',
        username: testUsername,
        rtuRollNo: '21EARYCS888',
        email: 'other_email@arya.edu.in',
        password: testPassword
      }
    });
    assert(dupUserRes.status === 400 && !dupUserRes.data.success, 'Signup with duplicate username is rejected with HTTP 400');

    // 3. Duplicate Email Rejection
    const dupEmailRes = await request('/api/auth/signup', {
      method: 'POST',
      body: {
        name: 'Duplicate Email User',
        username: 'other_user_' + Date.now().toString(36),
        rtuRollNo: '21EARYCS777',
        email: testEmail,
        password: testPassword
      }
    });
    assert(dupEmailRes.status === 400 && !dupEmailRes.data.success, 'Signup with duplicate email is rejected with HTTP 400');

    // 4. Student Login (with Username)
    console.log('\n3. Testing Student Login...');
    const loginUserRes = await request('/api/auth/login', {
      method: 'POST',
      body: { username: testUsername, password: testPassword }
    });
    assert(loginUserRes.status === 200 && loginUserRes.data.success, 'Login with username succeeds');
    assert(loginUserRes.data.token && !loginUserRes.data.user.passwordHash, 'Login returns JWT token and safe user');

    // 5. Student Login (with Email)
    const loginEmailRes = await request('/api/auth/login', {
      method: 'POST',
      body: { username: testEmail, password: testPassword }
    });
    assert(loginEmailRes.status === 200 && loginEmailRes.data.success, 'Login with email succeeds');

    // 6. Student Login with Invalid Password
    const loginBadPass = await request('/api/auth/login', {
      method: 'POST',
      body: { username: testUsername, password: 'WrongPassword999!' }
    });
    assert(loginBadPass.status === 401 && !loginBadPass.data.success, 'Login with wrong password is rejected with HTTP 401');

    // 7. My Profile (Authenticated)
    console.log('\n4. Testing My Profile (Authenticated Full Details)...');
    const myProfileRes = await request('/api/profile/me', { headers: studentHeaders });
    assert(myProfileRes.status === 200 && myProfileRes.data.success, 'GET /api/profile/me returns student profile');
    assert(myProfileRes.data.profile.rtuRollNo === testRollNo, 'Personal profile contains private RTU Roll No.');
    assert(myProfileRes.data.profile.email === testEmail, 'Personal profile contains private Email');
    assert(myProfileRes.data.profile.mobile === '+91 9876543210', 'Personal profile contains private Mobile');

    // 8. Edit Profile
    console.log('\n5. Testing Edit Profile...');
    const editProfileRes = await request('/api/profile/me', {
      method: 'PUT',
      headers: studentHeaders,
      body: {
        bio: 'ACEIT Volleyball Setter & Passionate Athlete',
        jerseyNo: '7',
        position: 'Captain & Setter',
        height: '6ft 2in',
        mobile: '+91 9123456789'
      }
    });
    assert(editProfileRes.status === 200 && editProfileRes.data.success, 'PUT /api/profile/me updates student profile');
    assert(editProfileRes.data.profile.jerseyNo === '7', 'Updated Jersey No. persisted');
    assert(editProfileRes.data.profile.bio.includes('Passionate Athlete'), 'Updated Bio persisted');
    assert(editProfileRes.data.profile.mobile === '+91 9123456789', 'Updated Mobile persisted');

    // 9. Multi-Club Following / Joining
    console.log('\n6. Testing Multi-Club Affiliation (Join / Leave Clubs)...');
    const joinClubRes = await request('/api/profile/clubs/join', {
      method: 'POST',
      headers: studentHeaders,
      body: { clubSlug: 'strikers' }
    });
    assert(joinClubRes.status === 200 && joinClubRes.data.success, 'POST /api/profile/clubs/join joins "strikers"');
    assert(joinClubRes.data.clubs.includes('strikers') && joinClubRes.data.clubs.includes('spikers'), 'User now belongs to multiple clubs (Spikers + Strikers)');

    const leaveClubRes = await request('/api/profile/clubs/leave', {
      method: 'POST',
      headers: studentHeaders,
      body: { clubSlug: 'spikers' }
    });
    assert(leaveClubRes.status === 200 && leaveClubRes.data.success, 'POST /api/profile/clubs/leave leaves "spikers"');
    assert(!leaveClubRes.data.clubs.includes('spikers') && leaveClubRes.data.clubs.includes('strikers'), 'User clubs updated accurately after leave');

    // 10. Public Profile & Privacy Protection
    console.log('\n7. Testing Public Profile & Data Privacy...');
    const publicProfileRes = await request(`/api/users/profile/${testUsername}`);
    assert(publicProfileRes.status === 200 && publicProfileRes.data.success, `GET /api/users/profile/${testUsername} returns public profile`);
    assert(publicProfileRes.data.profile.name === 'Rohit Sharma', 'Public profile includes Name');
    assert(publicProfileRes.data.profile.username === testUsername, 'Public profile includes Username');
    assert(Array.isArray(publicProfileRes.data.profile.clubs), 'Public profile includes Clubs list');

    // Strictly verify private fields are OMITTED in public profile
    assert(publicProfileRes.data.profile.rtuRollNo === undefined, 'Public profile strictly OMITS RTU Roll No.');
    assert(publicProfileRes.data.profile.email === undefined, 'Public profile strictly OMITS Email');
    assert(publicProfileRes.data.profile.mobile === undefined, 'Public profile strictly OMITS Mobile');
    assert(publicProfileRes.data.profile.passwordHash === undefined, 'Public profile strictly OMITS PasswordHash');

    // 11. Logout Workflow
    console.log('\n8. Testing Logout...');
    const logoutRes = await request('/api/auth/logout', { method: 'POST', headers: studentHeaders });
    assert(logoutRes.status === 200 && logoutRes.data.success, 'POST /api/auth/logout logs out user');

    // 12. Account Deactivation / Security Enforcement
    console.log('\n9. Testing Disabled Account Security Enforcement...');
    // Login as OWNER
    const ownerLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: 'founder', password: 'OwnerSecret123!' }
    });
    const ownerToken = ownerLogin.data.token;
    const ownerHeaders = { 'Authorization': `Bearer ${ownerToken}` };

    // Get Student ID
    const studentUserDoc = await request('/api/users', { headers: ownerHeaders });
    const studentDoc = studentUserDoc.data.users.find(u => u.username === testUsername);
    assert(studentDoc !== undefined, 'Found created student in user database');

    // Disable student account
    const disableRes = await request(`/api/users/${studentDoc._id}`, {
      method: 'PUT',
      headers: ownerHeaders,
      body: { active: false }
    });
    assert(disableRes.status === 200 && disableRes.data.success, 'Admin disabled student account (active: false)');

    // Attempt student login while disabled -> MUST FAIL with 403
    const disabledLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: testUsername, password: testPassword }
    });
    assert(disabledLogin.status === 403 && !disabledLogin.data.success, 'Disabled user login is BLOCKED with HTTP 403 Forbidden');

    // Attempt protected API access with old student token -> MUST FAIL with 403 (or 401)
    const disabledApiAccess = await request('/api/profile/me', { headers: studentHeaders });
    assert((disabledApiAccess.status === 403 || disabledApiAccess.status === 401) && !disabledApiAccess.data.success, 'Disabled user API access is BLOCKED with HTTP 403 Forbidden / 401 Unauthorized');

    // Re-enable student account
    const reEnableRes = await request(`/api/users/${studentDoc._id}`, {
      method: 'PUT',
      headers: ownerHeaders,
      body: { active: true }
    });
    assert(reEnableRes.status === 200 && reEnableRes.data.success, 'Admin re-enabled student account');

    // Login again -> MUST SUCCEED
    const reLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { username: testUsername, password: testPassword }
    });
    assert(reLogin.status === 200 && reLogin.data.success, 'Re-enabled student can log in again successfully');

  } catch (err) {
    console.error('Unexpected error during Phase 2 test execution:', err);
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
