const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function request(method, pathUrl, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const defaultHeaders = {
      'Content-Type': 'application/json'
    };
    const reqHeaders = Object.assign({}, defaultHeaders, headers);
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    if (postData) {
      reqHeaders['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: pathUrl,
      method: method,
      headers: reqHeaders
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { }
        resolve({ statusCode: res.statusCode, body: data, json: json });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

let passed = 0;
let failed = 0;
function test(desc, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${desc}\n    Error: ${err.message}`);
    failed++;
  }
}

async function runSuite() {
  console.log('====================================================');
  console.log('CROSS-CLUB UNIVERSAL STUDENT AUTHENTICATION TEST');
  console.log('====================================================');

  const stamp = Date.now();
  const testStudent = {
    name: 'Universal Student ' + stamp,
    username: 'student_' + stamp,
    rtuRollNo: '23EARYA' + (stamp % 10000),
    email: `student_${stamp}@aceit.edu.in`,
    mobile: '9876543210',
    password: 'UniversalPassword123!',
    clubId: 'spikers',
    clubs: ['spikers']
  };

  // [1] Student Registration on Spikers Club
  console.log('\n[1] Student Registration on Spikers Club');
  const signupRes = await request('POST', '/api/auth/signup', testStudent);
  test('Student registers successfully on Spikers', () => {
    assert(signupRes.statusCode === 200, 'Expected HTTP 200 on signup');
    assert(signupRes.json.success === true, 'Expected success: true');
    assert(signupRes.json.token, 'Expected JWT token');
  });

  // [2] File DB Persistence Verification
  console.log('\n[2] File Database Persistence Verification');
  const dataFilePath = path.join(__dirname, 'data.json');
  const dataRaw = fs.readFileSync(dataFilePath, 'utf-8');
  const dataJson = JSON.parse(dataRaw);
  test('User account is persisted in data.json', () => {
    assert(Array.isArray(dataJson.users), 'data.json has users array');
    const foundUser = dataJson.users.find(u => u.username === testStudent.username);
    assert(foundUser, 'Newly created user found in data.json');
    assert.strictEqual(foundUser.email, testStudent.email);
  });

  // [3] Login From Cricket Page using Username
  console.log('\n[3] Login from Cricket Club Page (using Username)');
  const cricketLoginRes = await request('POST', '/api/auth/login', {
    username: testStudent.username,
    password: testStudent.password
  });
  test('Student signs in successfully with Username on Cricket scope', () => {
    assert(cricketLoginRes.statusCode === 200, 'Expected HTTP 200');
    assert(cricketLoginRes.json.success === true, 'Expected success: true');
    assert(cricketLoginRes.json.user.username === testStudent.username);
  });
  const studentToken = cricketLoginRes.json.token;

  // [4] Login From Dunkers Basketball Page using Email
  console.log('\n[4] Login from Dunkers Basketball Page (using Email)');
  const dunkersLoginRes = await request('POST', '/api/auth/login', {
    email: testStudent.email,
    password: testStudent.password
  });
  test('Student signs in successfully with Email on Dunkers scope', () => {
    assert(dunkersLoginRes.statusCode === 200, 'Expected HTTP 200');
    assert(dunkersLoginRes.json.success === true, 'Expected success: true');
    assert(dunkersLoginRes.json.user.email === testStudent.email);
  });

  // [5] Login From Kabaddi Page using RTU Roll Number
  console.log('\n[5] Login from Kabaddi Page (using RTU Roll No)');
  const kabaddiLoginRes = await request('POST', '/api/auth/login', {
    username: testStudent.rtuRollNo,
    password: testStudent.password
  });
  test('Student signs in successfully with RTU Roll No on Kabaddi scope', () => {
    assert(kabaddiLoginRes.statusCode === 200, 'Expected HTTP 200');
    assert(kabaddiLoginRes.json.success === true, 'Expected success: true');
  });

  // [6] Shared Session Verification Across All Clubs
  console.log('\n[6] Shared Session Verification Across All Clubs');
  const meRes = await request('GET', '/api/auth/me', null, {
    'Authorization': `Bearer ${studentToken}`
  });
  test('GET /api/auth/me returns valid universal student profile', () => {
    assert(meRes.statusCode === 200);
    assert(meRes.json.success === true);
    assert.strictEqual(meRes.json.user.username, testStudent.username);
    assert.strictEqual(meRes.json.user.role, 'STUDENT');
  });

  // [7] Join Cricket Club with 1-Click
  console.log('\n[7] Join Cricket Club with 1-Click');
  const joinCricketRes = await request('POST', '/api/profile/clubs/join', {
    clubSlug: 'cricket'
  }, { 'Authorization': `Bearer ${studentToken}` });
  test('Student joins Cricket club with 1-click', () => {
    assert(joinCricketRes.statusCode === 200, 'Expected HTTP 200 on join club');
    assert(joinCricketRes.json.success === true, 'Expected success: true');
    assert(joinCricketRes.json.clubs.includes('cricket'), 'Cricket added to student clubs');
    assert(joinCricketRes.json.clubs.includes('spikers'), 'Spikers preserved in student clubs');
  });

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('Test Execution Error:', err);
  process.exit(1);
});
