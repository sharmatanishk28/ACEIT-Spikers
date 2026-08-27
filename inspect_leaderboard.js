const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
const lines = html.split('\n');

lines.forEach((l, i) => {
  if (l.toLowerCase().includes('leaderboard') || l.toLowerCase().includes('athlete mvp') || l.toLowerCase().includes('mvp podium')) {
    console.log(`Line ${i+1}: ${l.trim()}`);
  }
});
