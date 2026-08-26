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
        resolve({ statusCode: res.statusCode, body: data, json: json, headers: res.headers });
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
  console.log('LOADER VOLLEYBALL & SPIKERS PAGE LOGO TEST SUITE');
  console.log('====================================================');

  // [1] Static Assets Verification
  console.log('\n[1] Static Logo & Loader Assets Delivery');
  const vballRes = await request('GET', '/volleyball-loader.png');
  test('HTTP 200 returned for /volleyball-loader.png', () => {
    assert.strictEqual(vballRes.statusCode, 200);
    assert(vballRes.headers['content-type'].includes('image/png'));
  });

  const spikersRes = await request('GET', '/spikers-logo.png');
  test('HTTP 200 returned for /spikers-logo.png', () => {
    assert.strictEqual(spikersRes.statusCode, 200);
    assert(spikersRes.headers['content-type'].includes('image/png'));
  });

  // [2] HTML Markup & CSS Alpha Background Rules
  console.log('\n[2] HTML Markup & Alpha Transparency Styling');
  const htmlPath = path.join(__dirname, 'aceit-spikers-1.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  test('Loader logo uses volleyball-loader.png', () => {
    assert(htmlContent.includes('id="loaderLogoImg"'), 'loaderLogoImg tag exists');
    assert(htmlContent.includes('src="volleyball-loader.png"'), 'loaderLogoImg src is volleyball-loader.png');
  });

  test('Navbar brand uses spikers-logo.png', () => {
    assert(htmlContent.includes('id="navBrandLogo"'), 'navBrandLogo tag exists');
    assert(htmlContent.includes('src="spikers-logo.png"'), 'navBrandLogo src is spikers-logo.png');
  });

  test('Hero section uses spikers-logo.png', () => {
    assert(htmlContent.includes('id="heroLogoImg"'), 'heroLogoImg tag exists');
    assert(htmlContent.includes('src="spikers-logo.png"'), 'heroLogoImg src is spikers-logo.png');
  });

  test('CSS enforces transparent background on loader & hero logos', () => {
    assert(htmlContent.includes('.loader img {') && htmlContent.includes('background: transparent !important;'), 'loader img transparent bg');
    assert(htmlContent.includes('.hero-logo-wrap img {') && htmlContent.includes('background: transparent !important;'), 'hero logo transparent bg');
  });

  // [3] Admin Club Customization Modal Verification
  console.log('\n[3] Admin Club Customization Modal UI Controls');
  test('Admin club modal includes Page Logo uploader', () => {
    assert(htmlContent.includes('id="cModalLogoFile"'), 'Page logo file input exists');
    assert(htmlContent.includes('id="cModalLogoUrlInput"'), 'Page logo url input exists');
    assert(htmlContent.includes('id="cModalLogoPreviewBox"'), 'Page logo preview box exists');
  });

  test('Admin club modal includes Loading Screen Logo uploader', () => {
    assert(htmlContent.includes('id="cModalLoaderLogoFile"'), 'Loader logo file input exists');
    assert(htmlContent.includes('id="cModalLoaderLogoUrlInput"'), 'Loader logo url input exists');
    assert(htmlContent.includes('id="cModalLoaderLogoPreviewBox"'), 'Loader logo preview box exists');
  });

  // [4] API Logo & Loader Customization Endpoint
  console.log('\n[4] API Clubs CRUD for Page Logo and Loader Logo');
  const loginRes = await request('POST', '/api/auth/login', {
    username: 'founder',
    password: 'OwnerSecret123!'
  });
  const ownerToken = loginRes.json.token;

  const updateRes = await request('PUT', '/api/clubs/spikers', {
    logo: 'spikers-logo.png',
    loaderLogo: 'volleyball-loader.png',
    name: 'ACEIT Spikers',
    sport: 'Volleyball'
  }, { 'Authorization': `Bearer ${ownerToken}` });

  test('PUT /api/clubs/spikers accepts logo and loaderLogo', () => {
    assert.strictEqual(updateRes.statusCode, 200);
    assert.strictEqual(updateRes.json.success, true);
    assert.strictEqual(updateRes.json.club.logo, 'spikers-logo.png');
    assert.strictEqual(updateRes.json.club.loaderLogo, 'volleyball-loader.png');
  });

  const getClubRes = await request('GET', '/api/clubs/spikers');
  test('GET /api/clubs/spikers returns persisted logo and loaderLogo', () => {
    assert.strictEqual(getClubRes.statusCode, 200);
    assert.strictEqual(getClubRes.json.club.logo, 'spikers-logo.png');
    assert.strictEqual(getClubRes.json.club.loaderLogo, 'volleyball-loader.png');
  });

  // [5] Dynamic applyClubBranding Loader vs Page Logo Binding
  console.log('\n[5] Dynamic applyClubBranding Binding Verification');
  test('applyClubBranding binds loaderLogo to loaderLogoImg', () => {
    assert(htmlContent.includes('loaderLogoImg.src = loaderLogo;'), 'loaderLogo bound to loaderLogoImg');
  });

  test('applyClubBranding binds clubLogo to heroLogoImg & navBrandLogo', () => {
    assert(htmlContent.includes('heroLogoImg.src = clubLogo || defaultCrest;'), 'clubLogo bound to heroLogoImg');
    assert(htmlContent.includes('navBrandLogo.src = clubLogo || defaultCrest;'), 'clubLogo bound to navBrandLogo');
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
