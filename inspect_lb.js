const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
const lines = html.split('\n');

for (let i = 4260; i < 4330; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}

console.log('\n=== USAGES OF lb-podium ===');
lines.forEach((l, i) => {
  if (l.includes('lb-') || l.includes('leaderboard')) {
    console.log(`L${i+1}: ${l.trim()}`);
  }
});
