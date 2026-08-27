const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
const lines = html.split('\n');

for (let i = 7255; i < 7290; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
