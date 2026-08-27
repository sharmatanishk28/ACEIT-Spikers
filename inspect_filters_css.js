const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
const lines = html.split('\n');

function inspectClass(className) {
  console.log(`\n=== CLASS: .${className} ===`);
  lines.forEach((l, i) => {
    if (l.includes('.' + className)) {
      const start = Math.max(0, i - 2);
      const end = Math.min(lines.length - 1, i + 8);
      console.log(`L${i+1}:`);
      for (let j = start; j <= end; j++) {
        console.log(`  ${lines[j]}`);
      }
    }
  });
}

inspectClass('filters');
inspectClass('filter-btn');
inspectClass('admin-table');
inspectClass('admin-sidebar');
