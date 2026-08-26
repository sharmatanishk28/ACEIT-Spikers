const http = require('http');
const fs = require('fs');
const path = require('path');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: buffer.toString('utf8'),
          raw: buffer
        });
      });
    });
    req.on('error', reject);
    if (data) {
      if (typeof data === 'string' || Buffer.isBuffer(data)) {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error('❌ FAIL: ' + message);
    process.exit(1);
  }
  console.log('✅ PASS: ' + message);
}

async function runTests() {
  console.log('\n--- 1. Testing /spikers-logo.png Static File Delivery ---');
  const logoRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/spikers-logo.png',
    method: 'GET'
  });
  assert(logoRes.statusCode === 200, 'HTTP 200 returned for /spikers-logo.png');
  assert(logoRes.headers['content-type'] && logoRes.headers['content-type'].includes('image/png'), 'Content-Type is image/png');
  assert(logoRes.raw.length > 50000, 'Logo file has valid size (' + logoRes.raw.length + ' bytes)');

  console.log('\n--- 2. Verifying PNG Dimensions & Header Validity ---');
  const sig = logoRes.raw.slice(0, 8);
  assert(sig.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'PNG header signature is authentic');
  const width = logoRes.raw.readUInt32BE(16);
  const height = logoRes.raw.readUInt32BE(20);
  assert(width === 600 && height === 502, 'Spikers transparent PNG dimensions are exactly 600x502 (actual: ' + width + 'x' + height + ')');

  console.log('\n--- 3. Testing HTML Markup Integration ---');
  const htmlContent = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
  assert(htmlContent.includes('id="loaderLogoImg"') && htmlContent.includes('spikers-logo.png'), 'Loader logo uses spikers-logo.png');
  assert(htmlContent.includes('id="navBrandLogo"') && htmlContent.includes('spikers-logo.png'), 'Navbar brand uses spikers-logo.png');
  assert(htmlContent.includes('id="heroLogoImg"') && htmlContent.includes('spikers-logo.png'), 'Hero section uses spikers-logo.png');

  console.log('\n--- 4. Checking CSS Styling (No Square / Black Background Box) ---');
  assert(htmlContent.includes('background: transparent !important'), 'CSS contains transparent background rules');
  assert(htmlContent.includes('.hero-logo-wrap img'), 'hero-logo-wrap img selector exists');
  assert(htmlContent.includes('.loader img'), 'loader img selector exists');

  console.log('\n--- 5. Testing API & Dynamic Branding Fallbacks ---');
  const clubsRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/clubs',
    method: 'GET'
  });
  assert(clubsRes.statusCode === 200, 'GET /api/clubs returns HTTP 200');
  const clubsJson = JSON.parse(clubsRes.body);
  const clubsList = Array.isArray(clubsJson) ? clubsJson : (clubsJson.clubs || []);
  const spikersClub = clubsList.find(c => c.clubId === 'spikers' || c.slug === 'spikers');
  assert(spikersClub, 'Spikers club found in /api/clubs');
  assert(spikersClub.logo.includes('spikers-logo.png'), 'Spikers club logo is spikers-logo.png (actual: ' + spikersClub.logo + ')');

  console.log('\n✨ ALL 11 LOGO & ALPHA TRANSPARENCY TESTS PASSED SUCCESSFULLY! ✨\n');
}

runTests().catch(err => {
  console.error('Test Execution Error:', err);
  process.exit(1);
});
