const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const dataJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));

console.log('=== DATA.JSON ANALYSIS ===');
console.log('Users count:', dataJson.users?.length);
console.log('Users list:', dataJson.users?.map(u => ({ username: u.username, role: u.role, name: u.name })));
console.log('Clubs count:', dataJson.clubs?.length);
console.log('Players count:', dataJson.team?.length);
console.log('Matches count:', dataJson.matches?.length);
console.log('News count:', dataJson.news?.length);
console.log('Events count:', dataJson.events?.length);

console.log('\n=== LOCALSTORAGE IN HTML ===');
const htmlLines = html.split('\n');
htmlLines.forEach((line, idx) => {
  if (line.includes('localStorage')) {
    console.log(`L${idx + 1}: ${line.trim().slice(0, 120)}`);
  }
});

console.log('\n=== LEADERBOARD IN HTML ===');
htmlLines.forEach((line, idx) => {
  if (line.toLowerCase().includes('leaderboard') || line.toLowerCase().includes('athlete mvp')) {
    console.log(`L${idx + 1}: ${line.trim().slice(0, 120)}`);
  }
});
