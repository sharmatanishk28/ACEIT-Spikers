const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
const lines = html.split('\n');

lines.forEach((l, i) => {
  if (l.includes('.team-filters') || l.includes('.gallery-filters')) {
    const start = Math.max(0, i - 2);
    const end = Math.min(lines.length - 1, i + 10);
    console.log(`L${i+1}:`);
    for (let j = start; j <= end; j++) {
      console.log(`  ${lines[j]}`);
    }
  }
});
