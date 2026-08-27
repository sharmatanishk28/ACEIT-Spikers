const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'aceit-spikers-1.html'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

function findInFile(content, term, contextLines = 5) {
  const lines = content.split('\n');
  const results = [];
  lines.forEach((line, idx) => {
    if (line.includes(term)) {
      const start = Math.max(0, idx - contextLines);
      const end = Math.min(lines.length - 1, idx + contextLines);
      results.push({
        lineNum: idx + 1,
        match: line.trim(),
        snippet: lines.slice(start, end + 1).map((l, i) => `${start + i + 1}: ${l}`).join('\n')
      });
    }
  });
  return results;
}

console.log('=== SEARCHING HTML FUNCTIONS ===');
const terms = ['function loadData', 'function saveData', 'function deletePlayer', 'function deleteUser', 'function deleteCategory', 'function renderCategories', 'function renderTeam', 'function renderUsers', 'function login', 'function handleLogin', 'function createUser', 'function register'];
terms.forEach(t => {
  const res = findInFile(html, t, 10);
  console.log(`\n--- Term: ${t} (${res.length} matches) ---`);
  res.forEach(r => console.log(r.snippet));
});
