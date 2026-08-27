const fs = require('fs');
const path = require('path');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const lines = server.split('\n');

for (let i = 2240; i < 2360; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
