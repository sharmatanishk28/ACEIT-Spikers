const fs = require('fs');
const path = require('path');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const lines = server.split('\n');

for (let i = 3045; i < 3165; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
