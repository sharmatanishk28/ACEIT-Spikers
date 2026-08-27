const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

console.log('=== CATEGORY LOGIC IN HTML ===');
const htmlLines = html.split('\n');
htmlLines.forEach((l, i) => {
  if (l.includes('getAllCategories') || l.includes('customCategories') || l.includes('deletedCategories') || l.includes('defaultCategories') || l.includes('renderCategories') || l.includes('deleteCategory') || l.includes('addCategory')) {
    console.log(`L${i+1}: ${l.trim().slice(0, 140)}`);
  }
});

console.log('\n=== CATEGORY LOGIC IN SERVER ===');
const serverLines = server.split('\n');
serverLines.forEach((l, i) => {
  if (l.includes('categories') || l.includes('customCategories') || l.includes('deletedCategories')) {
    console.log(`L${i+1}: ${l.trim().slice(0, 140)}`);
  }
});
