const fs = require('fs');
const path = require('path');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const lines = server.split('\n');

function printRange(start, end) {
  console.log(`\n=== Lines ${start} to ${end} ===`);
  for (let i = start - 1; i < Math.min(lines.length, end); i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}

// Signup & Login
printRange(2240, 2350);

// Users CRUD (POST /api/users, PUT /api/users/:id, DELETE /api/users/:id)
printRange(3045, 3200);
printRange(3201, 3350);
