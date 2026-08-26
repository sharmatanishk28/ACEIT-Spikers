/**
 * Automated Verification for Transparent PNG Logo & Asset Uploads and Seamless Blending
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

function request(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('TRANSPARENT PNG UPLOAD & SEAMLESS BLEND TEST SUITE');
  console.log('====================================================\n');

  // 1-pixel transparent PNG in base64:
  const sampleTransparentPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

  // [1] HTML Client-side Compression & Transparency Support
  console.log('[1] HTML Code Verification for Transparent Image Compression');
  const htmlPath = path.join(__dirname, 'aceit-spikers-1.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  assert(htmlContent.includes("file.type === 'image/png'"), 'compressImage detects PNG file format');
  assert(htmlContent.includes("canvas.toDataURL('image/png')"), 'compressImage uses PNG data URL to preserve alpha channel');
  assert(htmlContent.includes("ctx.clearRect(0, 0, w, h)"), 'compressImage clears canvas with clearRect to prevent black background');
  assert(htmlContent.includes("sReader.readAsDataURL(file)"), 'SVG files bypass rasterization to maintain vector transparency');

  // [2] CSS Styling for Seamless Blending (Contain & Transparent Background)
  console.log('\n[2] CSS Styling Verification for Seamless Blending');
  assert(htmlContent.includes('.hero-logo-wrap img') && htmlContent.includes('object-fit: contain'), '.hero-logo-wrap img has object-fit: contain');
  assert(htmlContent.includes('.nav-brand img') && htmlContent.includes('object-fit: contain'), '.nav-brand img has object-fit: contain');
  assert(htmlContent.includes('background: transparent') || htmlContent.includes('background:transparent'), 'Logos and crests have transparent backgrounds');

  // [3] Transparent PNG Club Logo Update via API
  console.log('\n[3] Transparent PNG Club Logo API Storage & Retrieval');
  // Login as owner
  const loginRes = await request('POST', '/api/auth/login', {
    username: 'founder',
    password: 'OwnerSecret123!'
  });
  assert(loginRes.status === 200, 'Owner authentication successful');
  const ownerToken = loginRes.json?.token;

  // Update club logo with transparent PNG data URL
  const updateRes = await request('PUT', '/api/clubs/spikers', {
    name: 'ACEIT Spikers',
    sport: 'Volleyball',
    description: 'The official volleyball club of ACEIT.',
    logo: sampleTransparentPng
  }, { 'Authorization': `Bearer ${ownerToken}` });

  assert(updateRes.status === 200, 'PUT /api/clubs/spikers accepted transparent PNG logo');
  assert(updateRes.json?.club?.logo === sampleTransparentPng, 'Club logo persisted as transparent PNG base64 format');

  // Retrieve club via public GET
  const getClubRes = await request('GET', '/api/clubs/spikers');
  assert(getClubRes.status === 200, 'GET /api/clubs/spikers returned HTTP 200');
  const retrievedLogo = getClubRes.json?.club?.logo || getClubRes.json?.logo;
  assert(retrievedLogo === sampleTransparentPng, 'Public API returns exact transparent PNG data URL without corruption');

  // [4] Dynamic Logo Binding in Front-End Logic
  console.log('\n[4] Front-End Dynamic Logo & Crest Binding');
  assert(htmlContent.includes('navBrandLogo.src = club.logo'), 'applyClubBranding sets navBrandLogo.src dynamically from club.logo');
  assert(htmlContent.includes('heroLogoImg.src = club.logo'), 'applyClubBranding sets heroLogoImg.src dynamically from club.logo');

  // Restore official spikers-logo.png
  await request('PUT', '/api/clubs/spikers', {
    name: 'ACEIT Spikers',
    sport: 'Volleyball',
    description: 'The official volleyball club of ACEIT. Built on discipline, driven by teamwork, and playing for every point that matters.',
    logo: 'spikers-logo.png'
  }, { 'Authorization': `Bearer ${ownerToken}` });

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
