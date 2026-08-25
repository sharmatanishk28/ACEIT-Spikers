const http = require('http');

function req(options, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    r.on('error', reject);
    if (body) {
      r.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    r.end();
  });
}

async function runTests() {
  console.log('=== RUNNING PHASE 2 AUTOMATED TEST SUITE ===\n');
  let passed = 0, failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log('  PASS: ' + message);
      passed++;
    } else {
      console.error('  FAIL: ' + message);
      failed++;
    }
  }

  try {
    // 1. Admin/Owner Login
    console.log('1. Testing Admin Authentication...');
    const adminLogin = await req({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { username: 'founder', password: 'OwnerSecret123!' });

    assert(adminLogin.status === 200 && adminLogin.data.success, 'Admin logged in successfully');
    const adminToken = adminLogin.data.token;

    // 2. GET /api/roles (Default Roles Verification)
    console.log('\n2. Testing GET /api/roles (Default Roles & Glow Styling)...');
    const rolesRes = await req({
      hostname: 'localhost',
      port: 3000,
      path: '/api/roles',
      method: 'GET'
    });

    assert(rolesRes.status === 200 && rolesRes.data.success, 'Roles fetched successfully');
    const roles = rolesRes.data.roles || [];
    const roleNames = roles.map(r => r.name);
    assert(roleNames.includes('OWNER'), 'Includes OWNER role');
    assert(roleNames.includes('ADMIN'), 'Includes ADMIN role');
    assert(roleNames.includes('COORDINATOR'), 'Includes COORDINATOR role');
    assert(roleNames.includes('CAPTAIN'), 'Includes CAPTAIN role');
    assert(roleNames.includes('STUDENT'), 'Includes STUDENT role');

    const coordRole = roles.find(r => r.name === 'COORDINATOR');
    assert(coordRole && coordRole.badgeGlow && coordRole.badgeBg, 'COORDINATOR has glow and background color defined');

    // 3. POST /api/roles (Create Custom Role with Glow & Perms)
    console.log('\n3. Testing POST /api/roles (Create Custom Role)...');
    const newRoleRes = await req({
      hostname: 'localhost',
      port: 3000,
      path: '/api/roles',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + adminToken
      }
    }, {
      name: 'VICE_CAPTAIN',
      title: 'Vice Captain',
      description: 'Assists Captain in drills and match strategies',
      badgeBg: '#E91E63',
      badgeText: '#FFFFFF',
      badgeGlow: 'rgba(233, 30, 99, 0.85)',
      permissions: ['players.*', 'training.*', 'matches.view']
    });

    assert(newRoleRes.status === 200 && newRoleRes.data.success, 'Created custom role VICE_CAPTAIN');
    const createdRoleId = newRoleRes.data.role._id || newRoleRes.data.role.id;

    // 4. PUT /api/roles/:id (Update Custom Role)
    console.log('\n4. Testing PUT /api/roles/:id (Update Custom Role)...');
    const updateRoleRes = await req({
      hostname: 'localhost',
      port: 3000,
      path: '/api/roles/' + createdRoleId,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + adminToken
      }
    }, {
      title: 'Assistant Captain / Lead Setter',
      badgeGlow: 'rgba(233, 30, 99, 0.95)',
      permissions: ['players.*', 'training.*', 'matches.*']
    });

    assert(updateRoleRes.status === 200 && updateRoleRes.data.success, 'Updated custom role metadata and glow');
    assert(updateRoleRes.data.role.title === 'Assistant Captain / Lead Setter', 'Role title updated');

    // 5. Student Sign Up & Login
    console.log('\n5. Testing Student Account Creation...');
    const testUsername = 'spikertest_' + Date.now().toString().slice(-4);
    const signupRes = await req({
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/signup',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: 'Rahul Sharma',
      username: testUsername,
      rtuRollNo: '22EATCS999',
      email: testUsername + '@aceit.ac.in',
      mobile: '9876543210',
      password: 'SecurePassword123'
    });

    assert(signupRes.status === 200 && signupRes.data.success, 'Student signed up successfully');
    const studentToken = signupRes.data.token;

    // 6. Student Submits Club Application
    console.log('\n6. Testing POST /api/profile/applications (Tryout Application)...');
    const appSubmitRes = await req({
      hostname: 'localhost',
      port: 3000,
      path: '/api/profile/applications',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + studentToken
      }
    }, {
      clubSlug: 'aceit-spikers',
      role: 'Outside Hitter',
      experience: '2 years district level',
      message: 'Excited to represent ACEIT Spikers in upcoming inter-college tourney!'
    });

    assert(appSubmitRes.status === 200 && appSubmitRes.data.success, 'Tryout application submitted successfully');
    const appId = appSubmitRes.data.application._id || appSubmitRes.data.application.id;

    // 7. Student Views Submitted Applications
    console.log('\n7. Testing GET /api/profile/applications (Track Real-time Status)...');
    const getAppsRes = await req({
      hostname: 'localhost',
      port: 3000,
      path: '/api/profile/applications',
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + studentToken }
    });

    assert(getAppsRes.status === 200 && getAppsRes.data.success, 'Applications retrieved');
    assert(getAppsRes.data.applications.length > 0, 'Found student application');
    assert(getAppsRes.data.applications[0].status === 'Pending', 'Initial status is Pending');

    // 8. Admin Reviews & Accepts Application (with auto-club addition)
    console.log('\n8. Testing PUT /api/applications/:id/status (Accept Application)...');
    const acceptRes = await req({
      hostname: 'localhost',
      port: 3000,
      path: '/api/applications/' + appId + '/status',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + adminToken
      }
    }, {
      status: 'Accepted',
      adminFeedback: 'Welcome to the team! Training starts 6:00 AM on Monday.'
    });

    assert(acceptRes.status === 200 && acceptRes.data.success, 'Admin accepted application');

    // 9. Assign Custom Role to Student User
    console.log('\n9. Testing Admin Assigning Custom Role to Student User...');
    const targetUserId = signupRes.data.user._id || signupRes.data.user.id;
    const assignRoleRes = await req({
      hostname: 'localhost',
      port: 3000,
      path: '/api/users/' + targetUserId,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + adminToken
      }
    }, {
      role: 'COORDINATOR'
    });

    assert(assignRoleRes.status === 200 && assignRoleRes.data.success, 'Assigned COORDINATOR role to user');

    // 10. Verify Public Profile Enrichment & Privacy
    console.log('\n10. Testing GET /api/users/profile/:username (Glowing Role Badge & Privacy)...');
    const pubProfileRes = await req({
      hostname: 'localhost',
      port: 3000,
      path: '/api/users/profile/' + testUsername,
      method: 'GET'
    });

    assert(pubProfileRes.status === 200 && pubProfileRes.data.success, 'Public profile retrieved');
    const pub = pubProfileRes.data.profile;
    assert(pub.role === 'COORDINATOR', 'Public profile shows updated role');
    assert(pub.badgeGlow && pub.badgeBg && pub.badgeText, 'Public profile includes glowing badge metadata');
    assert(!pub.rtuRollNo && !pub.email && !pub.mobile && !pub.password, 'Sensitive fields strictly omitted from public profile');
    assert(Array.isArray(pub.clubs) && pub.clubs.includes('aceit-spikers'), 'Applicant automatically has joined the club upon acceptance');

    // 11. Delete Custom Role
    console.log('\n11. Testing DELETE /api/roles/:id...');
    const delRoleRes = await req({
      hostname: 'localhost',
      port: 3000,
      path: '/api/roles/' + createdRoleId,
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });

    assert(delRoleRes.status === 200 && delRoleRes.data.success, 'Deleted custom role VICE_CAPTAIN');

    // 12. Protection on System Roles
    console.log('\n12. Testing System Role Deletion Protection...');
    const ownerRole = roles.find(r => r.name === 'OWNER');
    const delOwnerRes = await req({
      hostname: 'localhost',
      port: 3000,
      path: '/api/roles/' + (ownerRole._id || ownerRole.id),
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + adminToken }
    });

    assert(delOwnerRes.status === 400 || !delOwnerRes.data.success, 'Protected system role OWNER cannot be deleted');

  } catch (err) {
    console.error('Unhandled test exception:', err);
    failed++;
  }

  console.log(`\n=== TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
