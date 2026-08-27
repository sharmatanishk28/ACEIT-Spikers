const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
const lines = html.split('\n');

function searchHtml(term, count = 3) {
  console.log(`\n=== SEARCH: "${term}" ===`);
  lines.forEach((l, i) => {
    if (l.includes(term)) {
      const start = Math.max(0, i - count);
      const end = Math.min(lines.length - 1, i + count);
      console.log(`Line ${i+1}:`);
      for (let j = start; j <= end; j++) {
        console.log(`  ${j+1}: ${lines[j]}`);
      }
    }
  });
}

searchHtml('/api/users');
searchHtml('/api/auth/login');
searchHtml('openUserModal');
searchHtml('saveUser');
