const fs = require('fs');
const path = require('path');

const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');

console.log('=== 1. SERVER API ROUTES ===');
const routeMatches = server.match(/app\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/g) || [];
console.log(routeMatches.join('\n'));

console.log('\n=== 2. AUTH / USER ENDPOINTS IN SERVER.JS ===');
const serverLines = server.split('\n');
serverLines.forEach((line, idx) => {
  if (line.includes('/api/auth') || line.includes('/api/users') || line.includes('/api/register') || line.includes('/api/login')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});

console.log('\n=== 3. CATEGORY / TEAM CRUD IN SERVER.JS ===');
serverLines.forEach((line, idx) => {
  if (line.includes('/api/team') || line.includes('/api/players') || line.includes('/api/categories')) {
    console.log(`L${idx+1}: ${line.trim()}`);
  }
});
