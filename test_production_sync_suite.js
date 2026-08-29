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

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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

async function runSuite() {
  console.log('================================================================');
  console.log('PRODUCTION DATA SYNC & DETERMINISTIC ORDERING VERIFICATION SUITE');
  console.log('================================================================\n');

  // 1. Authenticate as Owner
  console.log('[STAGE 1] OWNER AUTHENTICATION');
  const loginRes = await request('POST', '/api/auth/login', { username: 'founder', password: 'OwnerSecret123!' });
  assert(loginRes.status === 200 && loginRes.body.success, 'Owner login successful');
  const token = loginRes.body.token;
  const authHeader = { 'Authorization': `Bearer ${token}` };

  const testClub = 'spikers';

  // 2. Test Sequential CRUD on Players (A, B, C -> Edit B -> Delete B -> Verify A, C)
  console.log('\n[STAGE 2] PLAYERS: SEQUENTIAL CRUD & DETERMINISTIC ORDERING');
  
  // Create Player A
  const pA = await request('POST', `/api/team?clubId=${testClub}`, {
    n: 'Real Player Alpha',
    pos: 'Setter',
    num: 1,
    photo: 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg',
    clubId: testClub
  }, authHeader);
  assert(pA.status === 200 && pA.body.success, 'Created Player A');
  const pA_id = pA.body.player.id;

  // Create Player B
  const pB = await request('POST', `/api/team?clubId=${testClub}`, {
    n: 'Real Player Beta',
    pos: 'Spiker',
    num: 2,
    photo: 'https://res.cloudinary.com/demo/image/upload/v1/cld-sample.jpg',
    clubId: testClub
  }, authHeader);
  assert(pB.status === 200 && pB.body.success, 'Created Player B');
  const pB_id = pB.body.player.id;

  // Create Player C
  const pC = await request('POST', `/api/team?clubId=${testClub}`, {
    n: 'Real Player Gamma',
    pos: 'Libero',
    num: 3,
    photo: 'https://res.cloudinary.com/demo/image/upload/v1/cld-sample-2.jpg',
    clubId: testClub
  }, authHeader);
  assert(pC.status === 200 && pC.body.success, 'Created Player C');
  const pC_id = pC.body.player.id;

  await sleep(200);

  // Fetch from /api/db and verify A, B, C exist in exact order
  const getDB1 = await request('GET', `/api/db?clubId=${testClub}`);
  const teamList1 = getDB1.body.data.team || [];
  const idxA1 = teamList1.findIndex(p => p.id === pA_id);
  const idxB1 = teamList1.findIndex(p => p.id === pB_id);
  const idxC1 = teamList1.findIndex(p => p.id === pC_id);

  assert(idxA1 !== -1 && idxB1 !== -1 && idxC1 !== -1, 'All 3 players exist in MongoDB');
  assert(idxA1 < idxB1 && idxB1 < idxC1, 'Players are in exact creation order [A -> B -> C]');
  assert(teamList1[idxA1].photo === 'https://res.cloudinary.com/demo/image/upload/v1/sample.jpg', 'Player A Cloudinary photo preserved');
  assert(teamList1[idxB1].photo === 'https://res.cloudinary.com/demo/image/upload/v1/cld-sample.jpg', 'Player B Cloudinary photo preserved');

  // Edit Player B
  const editB = await request('PUT', `/api/team/${pB_id}`, {
    n: 'Real Player Beta (Updated)',
    pos: 'Opposite Spiker',
    num: 22,
    photo: 'https://res.cloudinary.com/demo/image/upload/v1/cld-sample-updated.jpg',
    clubId: testClub
  }, authHeader);
  assert(editB.status === 200 && editB.body.success, 'Updated Player B');

  await sleep(200);

  // Fetch after edit and verify order is strictly preserved: A -> B(updated) -> C
  const getDB2 = await request('GET', `/api/db?clubId=${testClub}`);
  const teamList2 = getDB2.body.data.team || [];
  const idxA2 = teamList2.findIndex(p => p.id === pA_id);
  const idxB2 = teamList2.findIndex(p => p.id === pB_id);
  const idxC2 = teamList2.findIndex(p => p.id === pC_id);

  assert(idxA2 < idxB2 && idxB2 < idxC2, 'Order strictly preserved after edit: [A -> B(updated) -> C]');
  assert(teamList2[idxB2].n === 'Real Player Beta (Updated)', 'Player B updated content persisted');
  assert(teamList2[idxB2].photo === 'https://res.cloudinary.com/demo/image/upload/v1/cld-sample-updated.jpg', 'Player B updated photo persisted');

  // Delete Player B
  const delB = await request('DELETE', `/api/team/${pB_id}`, null, authHeader);
  assert(delB.status === 200 && delB.body.success, 'Deleted Player B');

  await sleep(200);

  // Fetch after delete and verify ONLY A and C remain in order
  const getDB3 = await request('GET', `/api/db?clubId=${testClub}`);
  const teamList3 = getDB3.body.data.team || [];
  const hasA3 = teamList3.some(p => p.id === pA_id);
  const hasB3 = teamList3.some(p => p.id === pB_id);
  const hasC3 = teamList3.some(p => p.id === pC_id);

  assert(hasA3 && !hasB3 && hasC3, 'Player B permanently removed, Players A and C remain');

  // Clean up test players A and C
  await request('DELETE', `/api/team/${pA_id}`, null, authHeader);
  await request('DELETE', `/api/team/${pC_id}`, null, authHeader);
  await sleep(150);

  // 3. Test Sequential CRUD on Gallery (A, B, C -> Edit B -> Delete B -> Verify A, C)
  console.log('\n[STAGE 3] GALLERY: SEQUENTIAL CRUD & DETERMINISTIC PERSISTENCE');
  
  const gA = await request('POST', `/api/gallery?clubId=${testClub}`, {
    label: 'Gallery Photo Alpha',
    photo: 'https://res.cloudinary.com/demo/image/upload/v1/photo-a.jpg',
    clubId: testClub
  }, authHeader);
  assert(gA.status === 200 && gA.body.success, 'Created Gallery item A');
  const gA_id = gA.body.item.id;

  const gB = await request('POST', `/api/gallery?clubId=${testClub}`, {
    label: 'Gallery Photo Beta',
    photo: 'https://res.cloudinary.com/demo/image/upload/v1/photo-b.jpg',
    clubId: testClub
  }, authHeader);
  assert(gB.status === 200 && gB.body.success, 'Created Gallery item B');
  const gB_id = gB.body.item.id;

  const gC = await request('POST', `/api/gallery?clubId=${testClub}`, {
    label: 'Gallery Photo Gamma',
    photo: 'https://res.cloudinary.com/demo/image/upload/v1/photo-c.jpg',
    clubId: testClub
  }, authHeader);
  assert(gC.status === 200 && gC.body.success, 'Created Gallery item C');
  const gC_id = gC.body.item.id;

  await sleep(200);

  // Edit Gallery B
  const editGB = await request('PUT', `/api/gallery/${gB_id}`, {
    label: 'Gallery Photo Beta (Updated)',
    photo: 'https://res.cloudinary.com/demo/image/upload/v1/photo-b-updated.jpg',
    clubId: testClub
  }, authHeader);
  assert(editGB.status === 200 && editGB.body.success, 'Updated Gallery item B');

  await sleep(200);

  // Delete Gallery B
  const delGB = await request('DELETE', `/api/gallery/${gB_id}`, null, authHeader);
  assert(delGB.status === 200 && delGB.body.success, 'Deleted Gallery item B');

  await sleep(200);

  // Verify A and C remain
  const getDBG = await request('GET', `/api/db?clubId=${testClub}`);
  const gallList = getDBG.body.data.gallery || [];
  assert(gallList.some(g => g.id === gA_id) && !gallList.some(g => g.id === gB_id) && gallList.some(g => g.id === gC_id), 'Gallery: Item B deleted, Items A and C remain');

  // Clean up A and C
  await request('DELETE', `/api/gallery/${gA_id}`, null, authHeader);
  await request('DELETE', `/api/gallery/${gC_id}`, null, authHeader);
  await sleep(150);

  // 4. Test Sequential CRUD on Events (A, B, C -> Edit B -> Delete B -> Verify A, C)
  console.log('\n[STAGE 4] EVENTS: SEQUENTIAL CRUD & DETERMINISTIC PERSISTENCE');
  
  const eA = await request('POST', `/api/events?clubId=${testClub}`, {
    title: 'Tournament Alpha',
    description: 'Championship event Alpha',
    date: '2026-11-01',
    venue: 'ACEIT Grounds',
    clubId: testClub
  }, authHeader);
  assert(eA.status === 200 && eA.body.success, 'Created Event A');
  const eA_id = eA.body.event.id;

  const eB = await request('POST', `/api/events?clubId=${testClub}`, {
    title: 'Tournament Beta',
    description: 'Championship event Beta',
    date: '2026-11-02',
    venue: 'ACEIT Grounds',
    clubId: testClub
  }, authHeader);
  assert(eB.status === 200 && eB.body.success, 'Created Event B');
  const eB_id = eB.body.event.id;

  const eC = await request('POST', `/api/events?clubId=${testClub}`, {
    title: 'Tournament Gamma',
    description: 'Championship event Gamma',
    date: '2026-11-03',
    venue: 'ACEIT Grounds',
    clubId: testClub
  }, authHeader);
  assert(eC.status === 200 && eC.body.success, 'Created Event C');
  const eC_id = eC.body.event.id;

  await sleep(200);

  // Edit Event B
  const editEB = await request('PUT', `/api/events/${eB_id}`, {
    title: 'Tournament Beta (Finals)',
    description: 'Championship event Beta Updated',
    date: '2026-11-02',
    venue: 'ACEIT Indoor Stadium',
    clubId: testClub
  }, authHeader);
  assert(editEB.status === 200 && editEB.body.success, 'Updated Event B');

  await sleep(200);

  // Delete Event B
  const delEB = await request('DELETE', `/api/events/${eB_id}`, null, authHeader);
  assert(delEB.status === 200 && delEB.body.success, 'Deleted Event B');

  await sleep(200);

  // Verify A and C remain
  const getDBE = await request('GET', `/api/db?clubId=${testClub}`);
  const eventList = getDBE.body.data.events || [];
  assert(eventList.some(e => e.id === eA_id) && !eventList.some(e => e.id === eB_id) && eventList.some(e => e.id === eC_id), 'Events: Item B deleted, Items A and C remain');

  // Clean up A and C
  await request('DELETE', `/api/events/${eA_id}`, null, authHeader);
  await request('DELETE', `/api/events/${eC_id}`, null, authHeader);
  await sleep(150);

  // 5. Test Sequential CRUD on News (A, B, C -> Edit B -> Delete B -> Verify A, C)
  console.log('\n[STAGE 5] NEWS: SEQUENTIAL CRUD & DETERMINISTIC PERSISTENCE');
  
  const nA = await request('POST', `/api/news?clubId=${testClub}`, {
    title: 'News Headline Alpha',
    body: 'Content for article Alpha',
    tag: 'Victory',
    date: '28 Aug 2026',
    clubId: testClub
  }, authHeader);
  assert(nA.status === 200 && nA.body.success, 'Created News item A');
  const nA_id = nA.body.item.id;

  const nB = await request('POST', `/api/news?clubId=${testClub}`, {
    title: 'News Headline Beta',
    body: 'Content for article Beta',
    tag: 'Training',
    date: '29 Aug 2026',
    clubId: testClub
  }, authHeader);
  assert(nB.status === 200 && nB.body.success, 'Created News item B');
  const nB_id = nB.body.item.id;

  const nC = await request('POST', `/api/news?clubId=${testClub}`, {
    title: 'News Headline Gamma',
    body: 'Content for article Gamma',
    tag: 'Announcement',
    date: '30 Aug 2026',
    clubId: testClub
  }, authHeader);
  assert(nC.status === 200 && nC.body.success, 'Created News item C');
  const nC_id = nC.body.item.id;

  await sleep(200);

  // Edit News B
  const editNB = await request('PUT', `/api/news/${nB_id}`, {
    title: 'News Headline Beta (Updated)',
    body: 'Updated content for article Beta',
    tag: 'Training Special',
    date: '29 Aug 2026',
    clubId: testClub
  }, authHeader);
  assert(editNB.status === 200 && editNB.body.success, 'Updated News item B');

  await sleep(200);

  // Delete News B
  const delNB = await request('DELETE', `/api/news/${nB_id}`, null, authHeader);
  assert(delNB.status === 200 && delNB.body.success, 'Deleted News item B');

  await sleep(200);

  // Verify A and C remain
  const getDBN = await request('GET', `/api/db?clubId=${testClub}`);
  const newsList = getDBN.body.data.news || [];
  assert(newsList.some(n => n.id === nA_id) && !newsList.some(n => n.id === nB_id) && newsList.some(n => n.id === nC_id), 'News: Item B deleted, Items A and C remain');

  // Clean up A and C
  await request('DELETE', `/api/news/${nA_id}`, null, authHeader);
  await request('DELETE', `/api/news/${nC_id}`, null, authHeader);
  await sleep(150);

  // 6. Test Slideshow Scoped CRUD via /api/save-all
  console.log('\n[STAGE 6] HERO SLIDESHOW: PERSISTENCE & ORDERING');
  
  const currentDbSlides = (await request('GET', `/api/db?clubId=${testClub}`)).body.data;
  const testSlides = [
    { id: 'slide_test_1', title: 'Championship Match 2026', image: 'https://res.cloudinary.com/demo/image/upload/v1/slide1.jpg', clubId: testClub },
    { id: 'slide_test_2', title: 'Summer Training Camp', image: 'https://res.cloudinary.com/demo/image/upload/v1/slide2.jpg', clubId: testClub }
  ];

  const saveSlidesRes = await request('POST', `/api/save-all?clubId=${testClub}`, {
    ...currentDbSlides,
    slideshow: testSlides
  }, authHeader);
  assert(saveSlidesRes.status === 200 && saveSlidesRes.body.success, 'Saved Slideshow items to MongoDB');

  await sleep(200);

  const getDBSlides = await request('GET', `/api/db?clubId=${testClub}`);
  const savedSlides = getDBSlides.body.data.slideshow || [];
  assert(savedSlides.length === 2 && savedSlides[0].title === 'Championship Match 2026', 'Slideshow items retrieved in exact order');
  assert(savedSlides[0].image === 'https://res.cloudinary.com/demo/image/upload/v1/slide1.jpg', 'Slide 1 Cloudinary image preserved');

  // Clean up test slides
  await request('POST', `/api/save-all?clubId=${testClub}`, {
    ...getDBSlides.body.data,
    slideshow: []
  }, authHeader);
  await sleep(150);

  console.log('\n================================================================');
  console.log(`FINAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    console.error('Failed tests:');
    failures.forEach(f => console.error('  -', f));
    process.exit(1);
  }
}

runSuite().catch(err => {
  console.error('[Suite Fatal Error]', err);
  process.exit(1);
});
