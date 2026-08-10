require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const MONGODB_URI = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// ==========================================
// MONGODB CONNECTION & SERVERLESS CACHING
// ==========================================
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (!MONGODB_URI) {
    return null;
  }
  if (cached.conn) {
    return cached.conn;
  }
  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    };
    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => m);
  }
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error('[MongoDB Error]', e);
    return null;
  }
  return cached.conn;
}

// Club Schema for MongoDB Atlas
const clubSchema = new mongoose.Schema({
  key: { type: String, default: 'main', unique: true },
  team: { type: Array, default: [] },
  matches: { type: Array, default: [] },
  news: { type: Array, default: [] },
  sponsors: { type: Array, default: [] },
  testimonials: { type: Array, default: [] },
  stats: { type: Array, default: [] },
  gallery: { type: Array, default: [] },
  pin: { type: String, default: '2026' }
}, { timestamps: true });

const ClubDoc = mongoose.models.ClubDoc || mongoose.model('ClubDoc', clubSchema);

// Helper: Read default data.json fallback
function readLocalFileDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {}
  return { team: [], matches: [], news: [], sponsors: [], testimonials: [], stats: [], gallery: [] };
}

// Helper: Write to local data.json backup
function writeLocalFileDB(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {}
}

// Helper: Fetch full database (MongoDB Atlas -> data.json auto-migration fallback)
async function getDB() {
  const dbConn = await connectToDatabase();
  if (dbConn) {
    try {
      let doc = await ClubDoc.findOne({ key: 'main' });
      if (!doc) {
        // Auto-seed from data.json if MongoDB collection is empty
        const initial = readLocalFileDB();
        doc = await ClubDoc.create({ key: 'main', ...initial, pin: process.env.ADMIN_PIN || '2026' });
        console.log('[MongoDB Atlas] Auto-seeded initial player & club data from data.json!');
      }
      return doc.toObject();
    } catch (err) {
      console.error('[MongoDB Fetch Error]', err);
    }
  }
  return readLocalFileDB();
}

// Helper: Save full database
async function saveDB(data) {
  writeLocalFileDB(data);
  const dbConn = await connectToDatabase();
  if (dbConn) {
    try {
      await ClubDoc.findOneAndUpdate(
        { key: 'main' },
        {
          team: data.team || [],
          matches: data.matches || [],
          news: data.news || [],
          sponsors: data.sponsors || [],
          testimonials: data.testimonials || [],
          stats: data.stats || [],
          gallery: data.gallery || []
        },
        { upsert: true, new: true }
      );
      return true;
    } catch (err) {
      console.error('[MongoDB Save Error]', err);
    }
  }
  return true;
}

// Helper: Unique ID generator
function generateId() {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ==========================================
// API ENDPOINTS
// ==========================================

// 1. Get full database
app.get('/api/db', async (req, res) => {
  const db = await getDB();
  res.json({ success: true, data: db });
});

// 2. Save full database
app.post('/api/save-all', async (req, res) => {
  const db = req.body;
  if (!db || typeof db !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }
  await saveDB(db);
  res.json({ success: true, message: 'Database saved online' });
});

// 3. Get players team array
app.get('/api/team', async (req, res) => {
  const db = await getDB();
  res.json({ success: true, team: db.team || [] });
});

// 4. Add a player
app.post('/api/team', async (req, res) => {
  const db = await getDB();
  const player = req.body;
  if (!player.n) {
    return res.status(400).json({ success: false, message: 'Player name is required' });
  }
  player.id = player.id || generateId();
  db.team = db.team || [];
  db.team.push(player);
  await saveDB(db);
  console.log(`[API] Player Added to MongoDB: ${player.n} (${player.id})`);
  res.json({ success: true, player, team: db.team });
});

// 5. Update a player by ID
app.put('/api/team/:id', async (req, res) => {
  const db = await getDB();
  const { id } = req.params;
  const updatedPlayer = req.body;
  db.team = db.team || [];
  const idx = db.team.findIndex(p => String(p.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Player not found' });
  }
  updatedPlayer.id = id;
  db.team[idx] = updatedPlayer;
  await saveDB(db);
  console.log(`[API] Player Updated in MongoDB: ${updatedPlayer.n} (${id})`);
  res.json({ success: true, player: updatedPlayer, team: db.team });
});

// 6. Delete a player by ID
app.delete('/api/team/:id', async (req, res) => {
  const db = await getDB();
  const { id } = req.params;
  db.team = db.team || [];
  const initialLen = db.team.length;
  db.team = db.team.filter(p => String(p.id) !== String(id));
  if (db.team.length === initialLen) {
    return res.status(404).json({ success: false, message: 'Player not found' });
  }
  await saveDB(db);
  console.log(`[API] Player Deleted in MongoDB: ${id}`);
  res.json({ success: true, message: 'Player deleted', team: db.team });
});

// 7. Duplicate a player by ID
app.post('/api/team/duplicate/:id', async (req, res) => {
  const db = await getDB();
  const { id } = req.params;
  db.team = db.team || [];
  const orig = db.team.find(p => String(p.id) === String(id));
  if (!orig) {
    return res.status(404).json({ success: false, message: 'Original player not found' });
  }
  const copy = Object.assign({}, orig, { id: generateId(), n: orig.n + ' (Copy)' });
  const idx = db.team.findIndex(p => String(p.id) === String(id));
  db.team.splice(idx + 1, 0, copy);
  await saveDB(db);
  console.log(`[API] Player Duplicated in MongoDB: ${copy.n} (${copy.id})`);
  res.json({ success: true, player: copy, team: db.team });
});

// 8. Admin PIN endpoints & verification
app.get('/api/pin', async (req, res) => {
  const db = await getDB();
  const pin = process.env.ADMIN_PIN || db.pin || '2026';
  res.json({ success: true, pin });
});

app.post('/api/verify-pin', async (req, res) => {
  const { pin } = req.body;
  const db = await getDB();
  const expectedPin = process.env.ADMIN_PIN || db.pin || '2026';
  if (String(pin).trim() === String(expectedPin).trim()) {
    return res.json({ success: true, message: 'PIN Verified' });
  }
  res.status(401).json({ success: false, message: 'Incorrect PIN' });
});

app.post('/api/pin', async (req, res) => {
  const { pin } = req.body;
  if (!pin || pin.length < 4) {
    return res.status(400).json({ success: false, message: 'PIN must be at least 4 characters' });
  }
  const db = await getDB();
  db.pin = pin;
  await saveDB(db);
  res.json({ success: true, message: 'PIN updated' });
});

// Fallback route serving the HTML app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'aceit-spikers-1.html'));
});

// Start standalone Express server if run directly (node server.js)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`ACEIT Spikers API Server running on port ${PORT}`);
    console.log(`MongoDB Status: ${MONGODB_URI ? 'Atlas URI Configured' : 'Local Fallback (Set MONGODB_URI)'}`);
    console.log(`Access website: http://localhost:${PORT}/`);
    console.log(`====================================================`);
  });
}

module.exports = app;
