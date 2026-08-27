const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
const lines = html.split('\n');

lines.forEach((l, i) => {
  if (l.includes('@media')) {
    console.log(`L${i+1}: ${l.trim()}`);
  }
});
