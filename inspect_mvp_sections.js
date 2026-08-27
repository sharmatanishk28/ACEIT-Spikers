const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
const lines = html.split('\n');

const keywords = ['podium', 'mvp', 'badge', 'athlete', 'standings', 'player of the match', 'top performers', 'leader'];
keywords.forEach(kw => {
  let count = 0;
  lines.forEach((l, i) => {
    if (l.toLowerCase().includes(kw)) {
      count++;
      if (count <= 5) {
        console.log(`[${kw}] L${i+1}: ${l.trim().slice(0, 120)}`);
      }
    }
  });
  console.log(`Total for ${kw}: ${count}`);
});
