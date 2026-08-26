const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

function request(method, pathUrl) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: pathUrl,
      method: method
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
  console.log('CLEAN HERO & UNIVERSAL CLUB LOGO TEST SUITE');
  console.log('====================================================');

  const htmlPath = path.join(__dirname, 'aceit-spikers-1.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  // [1] Clean Hero Section Verification (Removed Clutter Text)
  console.log('\n[1] Clean Hero Section Verification (Removed Eyebrow & Subtitle)');
  test('Hero section does not contain static hero-eyebrow clutter', () => {
    assert(!htmlContent.includes('<div class="hero-eyebrow" id="heroEyebrow">Arya College of Engineering &amp; IT — Est. Club</div>'), 'hero-eyebrow static tag removed');
  });

  test('Hero section does not contain static heroDesc volleyball subtitle clutter', () => {
    assert(!htmlContent.includes('<p id="heroDesc">The official volleyball club of ACEIT. Built on discipline, driven by teamwork, and playing for every point\n          that matters.</p>'), 'heroDesc static tag removed');
  });

  test('applyClubBranding hides eyebrow and description on all club pages', () => {
    assert(htmlContent.includes("heroEyebrow.style.display = 'none'"), 'heroEyebrow hidden in applyClubBranding');
    assert(htmlContent.includes("heroDesc.style.display = 'none'"), 'heroDesc hidden in applyClubBranding');
  });

  // [2] Universal Dynamic Crest & Error Handler in HTML Head
  console.log('\n[2] Universal Dynamic Crest & Error Handler in HTML Head');
  test('Global getSportTheme function defined in head', () => {
    assert(htmlContent.includes('window.getSportTheme = function'), 'getSportTheme is globally defined');
  });

  test('Global getSportIcon function defined in head', () => {
    assert(htmlContent.includes('window.getSportIcon = function'), 'getSportIcon is globally defined');
  });

  test('Global getSportCrestSVG function defined in head', () => {
    assert(htmlContent.includes('window.getSportCrestSVG = function'), 'getSportCrestSVG is globally defined');
  });

  test('Global handleClubLogoError function defined in head', () => {
    assert(htmlContent.includes('window.handleClubLogoError = function'), 'handleClubLogoError is globally defined');
  });

  // [3] Bulletproof Image Element Fallbacks
  console.log('\n[3] Bulletproof Image Element Fallbacks');
  test('Loader logo uses handleClubLogoError', () => {
    assert(htmlContent.includes('id="loaderLogoImg"'), 'loaderLogoImg exists');
    assert(htmlContent.includes('handleClubLogoError(this, \'Volleyball\', \'ACEIT Spikers\')'), 'loaderLogoImg attaches handleClubLogoError');
  });

  test('Nav brand logo uses handleClubLogoError', () => {
    assert(htmlContent.includes('id="navBrandLogo"'), 'navBrandLogo exists');
    assert(htmlContent.includes('onerror="handleClubLogoError(this, \'Volleyball\', \'ACEIT Spikers\')"'), 'navBrandLogo attaches handleClubLogoError');
  });

  test('Hero logo uses handleClubLogoError', () => {
    assert(htmlContent.includes('id="heroLogoImg"'), 'heroLogoImg exists');
    assert(htmlContent.includes('onerror="handleClubLogoError(this, \'Volleyball\', \'ACEIT Spikers\')"'), 'heroLogoImg attaches handleClubLogoError');
  });

  // [4] Server Multi-Club Page Responses
  console.log('\n[4] Server Multi-Club Page Delivery');
  const spikersRes = await request('GET', '/');
  test('Root page served with clean hero and active branding', () => {
    assert(spikersRes.statusCode === 200, 'HTTP 200 on root');
    assert(spikersRes.body.includes('id="heroLogoImg"'), 'Hero logo present on root');
  });

  const kabaddiRes = await request('GET', '/club/kabaddi');
  test('Kabaddi page served with clean hero and active branding', () => {
    assert(kabaddiRes.statusCode === 200, 'HTTP 200 on /club/kabaddi');
    assert(kabaddiRes.body.includes('id="heroLogoImg"'), 'Hero logo present on /club/kabaddi');
  });

  const dunkersRes = await request('GET', '/club/dunkers');
  test('Basketball page served with clean hero and active branding', () => {
    assert(dunkersRes.statusCode === 200, 'HTTP 200 on /club/dunkers');
    assert(dunkersRes.body.includes('id="heroLogoImg"'), 'Hero logo present on /club/dunkers');
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
