require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
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

let lastMongoError = null;

function safeSanitizeMongoUri(rawUri) {
  if (!rawUri || typeof rawUri !== 'string') return rawUri;
  let uri = rawUri.trim();
  
  if ((uri.startsWith('"') && uri.endsWith('"')) || (uri.startsWith("'") && uri.endsWith("'"))) {
    uri = uri.slice(1, -1).trim();
  }

  if (uri.includes('mongodb.net/?')) {
    uri = uri.replace('mongodb.net/?', 'mongodb.net/spikers?');
  } else if (uri.includes('mongodb.net/') && !uri.includes('mongodb.net/spikers') && !uri.includes('?')) {
    uri = uri.endsWith('/') ? uri + 'spikers' : uri + '/spikers';
  }

  try {
    const schemeIdx = uri.indexOf('://');
    if (schemeIdx !== -1) {
      const scheme = uri.slice(0, schemeIdx + 3);
      const afterScheme = uri.slice(schemeIdx + 3);
      const lastAtIdx = afterScheme.lastIndexOf('@');
      if (lastAtIdx !== -1) {
        const userInfo = afterScheme.slice(0, lastAtIdx);
        const hostAndRest = afterScheme.slice(lastAtIdx + 1);
        const firstColonIdx = userInfo.indexOf(':');
        if (firstColonIdx !== -1) {
          const rawUser = userInfo.slice(0, firstColonIdx);
          const rawPass = userInfo.slice(firstColonIdx + 1);

          let decodedUser = rawUser;
          try { decodedUser = decodeURIComponent(rawUser); } catch(e) {}
          const safeUser = encodeURIComponent(decodedUser);

          let decodedPass = rawPass;
          try { decodedPass = decodeURIComponent(rawPass); } catch(e) {}
          const safePass = encodeURIComponent(decodedPass);

          uri = `${scheme}${safeUser}:${safePass}@${hostAndRest}`;
        }
      }
    }
  } catch (err) {
    console.error('[URI Parsing Warning]', err.message);
  }

  return uri;
}

async function connectToDatabase() {
  const rawUri = process.env.MONGODB_URI;
  if (!rawUri) {
    lastMongoError = 'MONGODB_URI environment variable is missing in Vercel Settings';
    return null;
  }

  const uri = safeSanitizeMongoUri(rawUri);

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 8000,
      dbName: 'spikers'
    };
    console.log('[MongoDB Atlas] Connecting to database cluster...');
    cached.promise = mongoose.connect(uri, opts).then((m) => {
      console.log('[MongoDB Atlas] Connected successfully to spikers database!');
      lastMongoError = null;
      return m;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    lastMongoError = e.message || String(e);
    console.error('[MongoDB Atlas Error] Connection failed:', lastMongoError);
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

// Helper: Read default data.json fallback (used ONLY for initial empty collection seeding or local standalone dev)
function readLocalFileDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {}
  return { team: [], matches: [], news: [], sponsors: [], testimonials: [], stats: [], gallery: [] };
}

function writeLocalFileDB(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {}
}

// Helper: Fetch full database from MongoDB Atlas (Strict Production Mode)
async function getDB() {
  const hasUri = !!process.env.MONGODB_URI;
  const dbConn = await connectToDatabase();
  
  if (dbConn) {
    try {
      let doc = await ClubDoc.findOne({ key: 'main' });
      if (!doc) {
        const count = await ClubDoc.countDocuments();
        if (count === 0) {
          const initial = readLocalFileDB();
          doc = await ClubDoc.create({ key: 'main', ...initial, pin: process.env.ADMIN_PIN || '2026' });
          console.log('[MongoDB Atlas] Collection empty. Auto-seeded initial data from data.json!');
        } else {
          doc = await ClubDoc.findOne({});
        }
      }
      if (doc) return { success: true, data: doc.toObject() };
    } catch (err) {
      console.error('[MongoDB Atlas Error] Fetch failed:', err.message);
      if (hasUri) {
        return { success: false, error: err.message };
      }
    }
  }

  if (hasUri) {
    // In production with MONGODB_URI configured, DO NOT silently fall back to data.json if connection failed!
    return { success: false, error: lastMongoError || 'Could not connect to MongoDB Atlas cluster' };
  }

  // Local standalone dev mode without MONGODB_URI
  return { success: true, data: readLocalFileDB() };
}

// Helper: Save full database to MongoDB Atlas
async function saveDB(data) {
  writeLocalFileDB(data);
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.warn('[MongoDB Atlas Warning] MONGODB_URI not set in process.env');
    return { success: true, warning: 'Saved to local data.json fallback only' };
  }
  const dbConn = await connectToDatabase();
  if (!dbConn) {
    const errReason = lastMongoError || 'Could not establish MongoDB connection';
    console.error('[MongoDB Atlas Save Failed]', errReason);
    return { success: false, error: errReason };
  }
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
    console.log('[MongoDB Atlas Save Success] Saved document key "main" successfully!');
    return { success: true };
  } catch (err) {
    const errReason = err.message || String(err);
    console.error('[MongoDB Atlas Save Failed]:', errReason);
    return { success: false, error: errReason };
  }
}

// Helper: Unique ID generator
function generateId() {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// ==========================================
// API ENDPOINTS
// ==========================================

// Diagnostic Endpoint
app.get('/api/debug-db', async (req, res) => {
  const uri = process.env.MONGODB_URI;
  const hasUri = !!uri;
  const maskedUri = hasUri ? uri.replace(/:([^@]+)@/, ':****@') : null;
  let mongoConnected = false;
  let docFound = false;
  let docPlayerCount = 0;
  let mongoError = null;

  try {
    const conn = await connectToDatabase();
    mongoConnected = !!conn;
    if (conn) {
      const doc = await ClubDoc.findOne({ key: 'main' });
      if (doc) {
        docFound = true;
        docPlayerCount = (doc.team || []).length;
      }
    } else {
      mongoError = lastMongoError;
    }
  } catch (err) {
    mongoError = err.message;
  }

  res.json({
    success: mongoConnected,
    hasMongoUri: hasUri,
    maskedUri: maskedUri,
    mongoConnected: mongoConnected,
    docFound: docFound,
    docPlayerCount: docPlayerCount,
    lastError: mongoError
  });
});

// 1. Get full database
app.get('/api/db', async (req, res) => {
  const result = await getDB();
  if (!result.success) {
    return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${result.error}`, error: result.error });
  }
  res.json({ success: true, data: result.data });
});

// 2. Save full database
app.post('/api/save-all', async (req, res) => {
  const db = req.body;
  if (!db || typeof db !== 'object') {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }
  const result = await saveDB(db);
  if (!result.success) {
    return res.status(500).json({ success: false, message: `Failed to save to MongoDB Atlas: ${result.error}`, error: result.error });
  }
  res.json({ success: true, message: 'Database saved online to MongoDB Atlas' });
});

// 3. Get players team array
app.get('/api/team', async (req, res) => {
  const result = await getDB();
  if (!result.success) {
    return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${result.error}`, error: result.error });
  }
  res.json({ success: true, team: result.data.team || [] });
});

// 4. Add a player
app.post('/api/team', async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) {
      return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${dbRes.error}`, error: dbRes.error });
    }
    const db = dbRes.data;
    const player = req.body;
    if (!player.n) {
      return res.status(400).json({ success: false, message: 'Player name is required' });
    }
    player.id = player.id || generateId();
    db.team = db.team || [];
    db.team.push(player);
    
    const result = await saveDB(db);
    if (!result.success) {
      console.error(`[API Player Add Failed] Could not persist player in MongoDB Atlas: ${player.n} Error: ${result.error}`);
      return res.status(500).json({ success: false, message: `Failed to persist player addition: ${result.error}`, error: result.error });
    }
    
    console.log(`[API Player Add Success] Player added to MongoDB Atlas: ${player.n} (#${player.num}) ID: ${player.id}`);
    res.json({ success: true, player, team: db.team });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, error: err.message });
  }
});

// 5. Update a player by ID
app.put('/api/team/:id', async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) {
      return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${dbRes.error}`, error: dbRes.error });
    }
    const db = dbRes.data;
    const { id } = req.params;
    const updatedPlayer = req.body;
    db.team = db.team || [];
    const idx = db.team.findIndex(p => String(p.id) === String(id));
    if (idx === -1) {
      console.error(`[API Player Update Failed] Player ID not found: ${id}`);
      return res.status(404).json({ success: false, message: 'Player not found' });
    }
    updatedPlayer.id = id;
    db.team[idx] = updatedPlayer;
    
    const result = await saveDB(db);
    if (!result.success) {
      console.error(`[API Player Update Failed] Could not persist update: ${result.error}`);
      return res.status(500).json({ success: false, message: `Failed to persist player update to MongoDB Atlas: ${result.error}`, error: result.error });
    }
    
    console.log(`[API Player Update Success] Player updated in MongoDB Atlas: ${updatedPlayer.n} (Jersey #${updatedPlayer.num}) ID: ${id}`);
    res.json({ success: true, player: updatedPlayer, team: db.team });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, error: err.message });
  }
});

// 6. Delete a player by ID
app.delete('/api/team/:id', async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) {
      return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${dbRes.error}`, error: dbRes.error });
    }
    const db = dbRes.data;
    const { id } = req.params;
    db.team = db.team || [];
    const initialLen = db.team.length;
    db.team = db.team.filter(p => String(p.id) !== String(id));
    if (db.team.length === initialLen) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }
    
    const result = await saveDB(db);
    if (!result.success) {
      console.error(`[API Player Delete Failed] Could not persist deletion: ${result.error}`);
      return res.status(500).json({ success: false, message: `Failed to persist deletion: ${result.error}`, error: result.error });
    }
    
    console.log(`[API Player Delete Success] Player deleted from MongoDB Atlas: ID ${id}`);
    res.json({ success: true, message: 'Player deleted', team: db.team });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, error: err.message });
  }
});

// 7. Duplicate a player by ID
app.post('/api/team/duplicate/:id', async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) {
      return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${dbRes.error}`, error: dbRes.error });
    }
    const db = dbRes.data;
    const { id } = req.params;
    db.team = db.team || [];
    const orig = db.team.find(p => String(p.id) === String(id));
    if (!orig) {
      return res.status(404).json({ success: false, message: 'Original player not found' });
    }
    const copy = Object.assign({}, orig, { id: generateId(), n: orig.n + ' (Copy)' });
    const idx = db.team.findIndex(p => String(p.id) === String(id));
    db.team.splice(idx + 1, 0, copy);
    
    const result = await saveDB(db);
    if (!result.success) {
      console.error(`[API Player Duplicate Failed] Could not persist duplication: ${result.error}`);
      return res.status(500).json({ success: false, message: `Failed to persist duplication: ${result.error}`, error: result.error });
    }
    
    console.log(`[API Player Duplicate Success] Player duplicated in MongoDB Atlas: ${copy.n} (${copy.id})`);
    res.json({ success: true, player: copy, team: db.team });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, error: err.message });
  }
});

// 8. Admin PIN endpoints & verification
app.get('/api/pin', async (req, res) => {
  const dbRes = await getDB();
  const db = dbRes.success ? dbRes.data : {};
  const pin = process.env.ADMIN_PIN || db.pin || '2026';
  res.json({ success: true, pin });
});

app.post('/api/verify-pin', async (req, res) => {
  const { pin } = req.body;
  const dbRes = await getDB();
  const db = dbRes.success ? dbRes.data : {};
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
  const dbRes = await getDB();
  if (!dbRes.success) {
    return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${dbRes.error}`, error: dbRes.error });
  }
  const db = dbRes.data;
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
    console.log(`MongoDB Status: ${process.env.MONGODB_URI ? 'Atlas URI Configured' : 'Local Fallback (Set MONGODB_URI)'}`);
    console.log(`Access website: http://localhost:${PORT}/`);
    console.log(`====================================================`);
  });
}

module.exports = app;
