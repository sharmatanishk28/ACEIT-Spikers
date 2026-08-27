const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
const lines = html.split('\n');

lines.forEach((l, i) => {
  if (i > 4500 && (l.includes('lb-') || l.includes('leaderboard') || l.includes('Leaderboard') || l.includes('MVP') || l.includes('mvp'))) {
    console.log(`L${i+1}: ${l.trim().slice(0, 140)}`);
  }
});
