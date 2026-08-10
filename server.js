const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const PIN_FILE = path.join(__dirname, 'pin.json');

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// Helper: Read DB from JSON file
function readDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading data.json:', err);
  }
  return { team: [], matches: [], news: [], sponsors: [], testimonials: [], stats: [], gallery: [] };
}

// Helper: Write DB to JSON file
function writeDB(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing data.json:', err);
    return false;
  }
}

// Helper: Read PIN
function getPIN() {
  try {
    if (fs.existsSync(PIN_FILE)) {
      const raw = fs.readFileSync(PIN_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.pin) return parsed.pin;
    }
  } catch (err) { }
  return '2026';
}

// Helper: Save PIN
function savePIN(pin) {
  try {
    fs.writeFileSync(PIN_FILE, JSON.stringify({ pin }, null, 2), 'utf-8');
    return true;
  } catch (err) {
    return false;
  }
}

// Helper: Unique ID generator
function generateId() {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ==========================================
// API ENDPOINTS
// ==========================================

// 1. Get full database
app.get('/api/db', (req, res) => {
  const db = readDB();
  res.json({ success: true, data: db });
});

// 2. Save full database
app.post('/api/save-all', (req, res) => {
  const db = req.body;
  if (!db || typeof db !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }
  if (writeDB(db)) {
    return res.json({ success: true, message: 'Database saved online' });
  }
  res.status(500).json({ success: false, message: 'Failed to write data' });
});

// 3. Get players team array
app.get('/api/team', (req, res) => {
  const db = readDB();
  res.json({ success: true, team: db.team || [] });
});

// 4. Add a player
app.post('/api/team', (req, res) => {
  const db = readDB();
  const player = req.body;
  if (!player.n) {
    return res.status(400).json({ success: false, message: 'Player name is required' });
  }
  player.id = player.id || generateId();
  db.team = db.team || [];
  db.team.push(player);
  writeDB(db);
  console.log(`[API] Player Added: ${player.n} (${player.id})`);
  res.json({ success: true, player, team: db.team });
});

// 5. Update a player by ID
app.put('/api/team/:id', (req, res) => {
  const db = readDB();
  const { id } = req.params;
  const updatedPlayer = req.body;
  db.team = db.team || [];
  const idx = db.team.findIndex(p => String(p.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Player not found' });
  }
  updatedPlayer.id = id;
  db.team[idx] = updatedPlayer;
  writeDB(db);
  console.log(`[API] Player Updated: ${updatedPlayer.n} (${id})`);
  res.json({ success: true, player: updatedPlayer, team: db.team });
});

// 6. Delete a player by ID
app.delete('/api/team/:id', (req, res) => {
  const db = readDB();
  const { id } = req.params;
  db.team = db.team || [];
  const initialLen = db.team.length;
  db.team = db.team.filter(p => String(p.id) !== String(id));
  if (db.team.length === initialLen) {
    return res.status(404).json({ success: false, message: 'Player not found' });
  }
  writeDB(db);
  console.log(`[API] Player Deleted ID: ${id}`);
  res.json({ success: true, message: 'Player deleted', team: db.team });
});

// 7. Duplicate a player by ID
app.post('/api/team/duplicate/:id', (req, res) => {
  const db = readDB();
  const { id } = req.params;
  db.team = db.team || [];
  const orig = db.team.find(p => String(p.id) === String(id));
  if (!orig) {
    return res.status(404).json({ success: false, message: 'Original player not found' });
  }
  const copy = Object.assign({}, orig, { id: generateId(), n: orig.n + ' (Copy)' });
  const idx = db.team.findIndex(p => String(p.id) === String(id));
  db.team.splice(idx + 1, 0, copy);
  writeDB(db);
  console.log(`[API] Player Duplicated: ${copy.n} (${copy.id})`);
  res.json({ success: true, player: copy, team: db.team });
});

// 8. Admin PIN endpoints
app.get('/api/pin', (req, res) => {
  res.json({ success: true, pin: getPIN() });
});

app.post('/api/pin', (req, res) => {
  const { pin } = req.body;
  if (!pin || pin.length < 4) {
    return res.status(400).json({ success: false, message: 'PIN must be at least 4 characters' });
  }
  savePIN(pin);
  res.json({ success: true, message: 'PIN updated' });
});

// Fallback route serving the HTML app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'aceit-spikers-1.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`ACEIT Spikers API Server running on port ${PORT}`);
  console.log(`Access website: http://localhost:${PORT}/`);
  console.log(`API Base URL:   http://localhost:${PORT}/api/`);
  console.log(`====================================================`);
});
