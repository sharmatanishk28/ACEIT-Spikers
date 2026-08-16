require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'spikers_jwt_secret_key_2026_super_secure';

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

// In-memory fallback stores for standalone/offline dev mode without MONGODB_URI
let localClubs = [
  { _id: 'c1', name: 'ACEIT Spikers', sport: 'Volleyball', slug: 'aceit-spikers', logo: '', description: 'ACEIT Official Volleyball Club', active: true, createdAt: new Date() }
];

let localUsers = [
  {
    _id: 'owner_local',
    name: 'Founder / Owner',
    username: (process.env.OWNER_USERNAME || 'founder').toLowerCase().trim(),
    passwordHash: bcrypt.hashSync(process.env.OWNER_PASSWORD || 'OwnerSecret123!', 10),
    role: 'OWNER',
    clubId: 'ALL',
    permissions: ['*'],
    active: true,
    createdAt: new Date()
  }
];

app.use(cors());
app.use(cookieParser());
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
          try { decodedUser = decodeURIComponent(rawUser); } catch (e) { }
          const safeUser = encodeURIComponent(decodedUser);

          let decodedPass = rawPass;
          try { decodedPass = decodeURIComponent(rawPass); } catch (e) { }
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

// Dynamic Multi-Club Model
const clubItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sport: { type: String, required: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  logo: { type: String, default: '' },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const Club = mongoose.models.Club || mongoose.model('Club', clubItemSchema);

// Scalable Multi-User & Granular Permission Model
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['OWNER', 'ADMIN', 'CUSTOM'], default: 'ADMIN' },
  clubId: { type: String, default: 'ALL' },
  permissions: { type: [String], default: [] },
  active: { type: Boolean, default: true },
  lastLoginAt: { type: Date }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

// Initial Seeding Helper: Auto-seeds initial Club & OWNER account if database is fresh
async function seedInitialAuthAndClubs() {
  const dbConn = await connectToDatabase();
  if (!dbConn) return;

  try {
    const clubCount = await Club.countDocuments();
    if (clubCount === 0) {
      await Club.create({
        name: 'ACEIT Spikers',
        sport: 'Volleyball',
        slug: 'aceit-spikers',
        logo: '',
        description: 'ACEIT Official Volleyball Club',
        active: true
      });
      console.log('[MongoDB Atlas] Auto-seeded default club: ACEIT Spikers (Volleyball)');
    }

    const ownerCount = await User.countDocuments({ role: 'OWNER' });
    if (ownerCount === 0) {
      const ownerUsername = (process.env.OWNER_USERNAME || 'founder').toLowerCase().trim();
      const ownerPass = process.env.OWNER_PASSWORD || 'OwnerSecret123!';
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(ownerPass, salt);

      await User.create({
        name: 'Founder / Owner',
        username: ownerUsername,
        passwordHash: hash,
        role: 'OWNER',
        clubId: 'ALL',
        permissions: ['*'],
        active: true
      });
      console.log(`[MongoDB Atlas] Auto-seeded initial OWNER account: "${ownerUsername}"`);
    } else {
      const ownerUsername = (process.env.OWNER_USERNAME || 'founder').toLowerCase().trim();
      let ownerUser = await User.findOne({ username: ownerUsername }) || await User.findOne({ role: 'OWNER' });
      if (ownerUser) {
        let changed = false;
        if (ownerUser.clubId !== 'ALL') { ownerUser.clubId = 'ALL'; changed = true; }
        if (!ownerUser.permissions || !ownerUser.permissions.includes('*')) { ownerUser.permissions = ['*']; changed = true; }
        if (!ownerUser.active) { ownerUser.active = true; changed = true; }
        if (changed) await ownerUser.save();
      }
    }
  } catch (err) {
    console.error('[MongoDB Atlas Seeding Error]', err.message);
  }
}

// Authentication & Authorization Middleware
async function authenticateUser(req, res, next) {
  req.user = null;
  let token = null;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token && req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded) return next();

    const dbConn = await connectToDatabase();
    if (dbConn) {
      let user = null;
      if (mongoose.Types.ObjectId.isValid(decoded.id)) {
        user = await User.findById(decoded.id).select('-passwordHash');
      }
      if (!user && decoded.username) {
        user = await User.findOne({ username: String(decoded.username).toLowerCase().trim() }).select('-passwordHash');
      }
      if (user) {
        if (user.active) {
          req.user = user.toObject ? user.toObject() : user;
        }
      }
    } else {
      let user = localUsers.find(u => String(u._id) === String(decoded.id) || u.username === String(decoded.username).toLowerCase().trim());
      if (user) {
        if (user.active) {
          req.user = Object.assign({}, user);
          delete req.user.passwordHash;
        }
      }
    }

    if (req.user && req.user.role === 'OWNER') {
      req.user.clubId = 'ALL';
      req.user.permissions = ['*'];
    }
  } catch (err) { }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }
  next();
}

function requirePermission(perm) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
    }
    if (!req.user.active) {
      return res.status(403).json({ success: false, message: 'Account is disabled. Please contact the Owner.' });
    }
    if (req.user.role === 'OWNER') {
      return next();
    }
    const perms = Array.isArray(req.user.permissions) ? req.user.permissions : [];
    if (perms.includes('*') || perms.includes(perm)) {
      return next();
    }
    if (perm && perm.includes('.')) {
      const moduleName = perm.split('.')[0];
      if (perms.includes(moduleName + '.*')) {
        return next();
      }
    }
    return res.status(403).json({ success: false, message: `Access forbidden: Missing permission '${perm}'` });
  };
}

function hasClubAccess(user, clubId) {
  if (!user) return false;
  if (user.role === 'OWNER' || user.clubId === 'ALL') return true;
  return String(user.clubId) === String(clubId);
}

function requireClubAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  if (req.user.role === 'OWNER' || req.user.clubId === 'ALL') {
    return next();
  }
  const reqClub = req.query.clubId || req.body.clubId || req.params.clubId || req.params.id;
  if (!reqClub || hasClubAccess(req.user, reqClub)) {
    return next();
  }
  return res.status(403).json({ success: false, message: `Access forbidden: No access to club '${reqClub}'` });
}

// Helper: Read default data.json fallback (used ONLY for initial empty collection seeding or local standalone dev)
function readLocalFileDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) { }
  return { team: [], matches: [], news: [], sponsors: [], testimonials: [], stats: [], gallery: [] };
}

function writeLocalFileDB(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) { }
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
app.post('/api/save-all', authenticateUser, requireAuth, requirePermission('settings.*'), async (req, res) => {
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
app.post('/api/team', authenticateUser, requireAuth, requirePermission('players.*'), async (req, res) => {
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
app.put('/api/team/:id', authenticateUser, requireAuth, requirePermission('players.*'), async (req, res) => {
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
app.delete('/api/team/:id', authenticateUser, requireAuth, requirePermission('players.*'), async (req, res) => {
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
app.post('/api/team/duplicate/:id', authenticateUser, requireAuth, requirePermission('players.*'), async (req, res) => {
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

app.post('/api/pin', authenticateUser, requireAuth, requirePermission('settings.*'), async (req, res) => {
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

// ==========================================
// PHASE 1: AUTHENTICATION & MULTI-CLUB ROUTES
// ==========================================

// 1. Auth: Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const cleanUsername = String(username).toLowerCase().trim();
    const dbConn = await connectToDatabase();

    let user = null;
    if (dbConn) {
      user = await User.findOne({ username: cleanUsername });
      if (!user) {
        await seedInitialAuthAndClubs();
        user = await User.findOne({ username: cleanUsername });
      }
    } else {
      user = localUsers.find(u => u.username === cleanUsername);
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    if (!user.active) {
      return res.status(403).json({ success: false, message: 'Account is disabled. Please contact the Owner.' });
    }

    const match = bcrypt.compareSync(String(password), user.passwordHash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    const userId = user._id || user.id || 'owner_local';
    if (user.save) {
      user.lastLoginAt = new Date();
      await user.save();
    }

    const token = jwt.sign(
      { id: String(userId), username: user.username, role: user.role, clubId: user.clubId, permissions: user.permissions },
      JWT_SECRET,
      { expiresIn: '1d' }
    );
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 86400000 });

    res.json({
      success: true,
      token: token,
      user: {
        id: String(userId),
        name: user.name,
        username: user.username,
        role: user.role,
        clubId: user.role === 'OWNER' ? 'ALL' : (user.clubId || 'ALL'),
        permissions: user.role === 'OWNER' ? ['*'] : (user.permissions || [])
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Auth: Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out' });
});

// 3. Auth: Current User Info
app.get('/api/auth/me', authenticateUser, async (req, res) => {
  if (!req.user) {
    return res.json({ success: true, authenticated: false });
  }

  let clubs = [];
  const dbConn = await connectToDatabase();
  if (dbConn) {
    await seedInitialAuthAndClubs();
    clubs = await Club.find({ active: true }).sort({ name: 1 });
  } else {
    clubs = localClubs.filter(c => c.active !== false);
  }

  res.json({
    success: true,
    authenticated: true,
    user: {
      id: String(req.user._id || req.user.id),
      name: req.user.name,
      username: req.user.username,
      role: req.user.role,
      clubId: req.user.role === 'OWNER' ? 'ALL' : (req.user.clubId || 'ALL'),
      permissions: req.user.role === 'OWNER' ? ['*'] : (req.user.permissions || [])
    },
    clubs
  });
});

// 4. Clubs: GET List
app.get('/api/clubs', authenticateUser, requireAuth, async (req, res) => {
  try {
    const dbConn = await connectToDatabase();
    if (!dbConn) {
      let clubs = localClubs;
      if (req.user && req.user.role !== 'OWNER' && req.user.clubId !== 'ALL') {
        clubs = localClubs.filter(c => String(c._id) === String(req.user.clubId));
      }
      return res.json({ success: true, clubs });
    }
    await seedInitialAuthAndClubs();
    let clubs = await Club.find({}).sort({ createdAt: -1 });
    if (req.user && req.user.role !== 'OWNER' && req.user.clubId !== 'ALL') {
      clubs = clubs.filter(c => String(c._id) === String(req.user.clubId));
    }
    res.json({ success: true, clubs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Clubs: POST Create
app.post('/api/clubs', authenticateUser, requireAuth, requirePermission('clubs.create'), async (req, res) => {
  try {
    const { name, sport, slug, logo, description, active } = req.body;
    if (!name || !sport) {
      return res.status(400).json({ success: false, message: 'Club Name and Sport are required' });
    }
    const cleanSlug = (slug || (name + '-' + sport)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ('club-' + Date.now());
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const existingLocal = localClubs.find(c => c.slug === cleanSlug);
      if (existingLocal) {
        return res.status(400).json({ success: false, message: `A club with slug '${cleanSlug}' already exists.` });
      }
      const newClub = {
        _id: 'c_' + Date.now(),
        name,
        sport,
        slug: cleanSlug,
        logo: logo || '',
        description: description || '',
        active: active !== undefined ? active : true,
        createdAt: new Date()
      };
      localClubs.unshift(newClub);
      return res.json({ success: true, club: newClub, message: 'Club created successfully' });
    }

    const existing = await Club.findOne({ slug: cleanSlug });
    if (existing) {
      return res.status(400).json({ success: false, message: `A club with slug '${cleanSlug}' already exists.` });
    }

    const club = await Club.create({
      name,
      sport,
      slug: cleanSlug,
      logo: logo || '',
      description: description || '',
      active: active !== undefined ? active : true
    });

    res.json({ success: true, club, message: 'Club created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Clubs: PUT Update
app.put('/api/clubs/:id', authenticateUser, requireAuth, requirePermission('clubs.edit'), requireClubAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sport, slug, logo, description, active } = req.body;
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const club = localClubs.find(c => String(c._id) === String(id));
      if (!club) return res.status(404).json({ success: false, message: 'Club not found' });
      if (name) club.name = name;
      if (sport) club.sport = sport;
      if (slug) club.slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (logo !== undefined) club.logo = logo;
      if (description !== undefined) club.description = description;
      if (active !== undefined) club.active = active;
      return res.json({ success: true, club, message: 'Club updated successfully' });
    }

    let club = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      club = await Club.findById(id);
    }
    if (!club) {
      club = await Club.findOne({ slug: id }) || await Club.findOne({ _id: id });
    }
    if (!club) return res.status(404).json({ success: false, message: 'Club not found' });

    if (slug) {
      const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const duplicate = await Club.findOne({ slug: cleanSlug, _id: { $ne: club._id } });
      if (duplicate) {
        return res.status(400).json({ success: false, message: `Slug '${cleanSlug}' is already in use by another club.` });
      }
      club.slug = cleanSlug;
    }

    if (name) club.name = name;
    if (sport) club.sport = sport;
    if (logo !== undefined) club.logo = logo;
    if (description !== undefined) club.description = description;
    if (active !== undefined) club.active = active;

    await club.save();
    res.json({ success: true, club, message: 'Club updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Clubs: DELETE Delete
app.delete('/api/clubs/:id', authenticateUser, requireAuth, requirePermission('clubs.delete'), requireClubAccess, async (req, res) => {
  try {
    const { id } = req.params;
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      localClubs = localClubs.filter(c => String(c._id) !== String(id));
      return res.json({ success: true, message: 'Club deleted successfully' });
    }

    let club = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      club = await Club.findById(id);
    }
    if (!club) {
      club = await Club.findOne({ slug: id }) || await Club.findOne({ _id: id });
    }
    if (!club) return res.status(404).json({ success: false, message: 'Club not found' });

    if (club.slug === 'aceit-spikers') {
      const total = await Club.countDocuments();
      if (total <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot delete primary club when it is the only club.' });
      }
    }

    await Club.findByIdAndDelete(club._id);
    res.json({ success: true, message: 'Club deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Users: GET List
app.get('/api/users', authenticateUser, requireAuth, requirePermission('users.view'), async (req, res) => {
  try {
    const dbConn = await connectToDatabase();
    if (!dbConn) {
      let safeUsers = localUsers.map(u => {
        const copy = Object.assign({}, u);
        delete copy.passwordHash;
        return copy;
      });
      if (req.user && req.user.role !== 'OWNER' && req.user.clubId !== 'ALL') {
        safeUsers = safeUsers.filter(function (u) {
          return String(u.clubId) === String(req.user.clubId);
        });
      }
      return res.json({ success: true, users: safeUsers });
    }
    await seedInitialAuthAndClubs();
    let users = await User.find({}).select('-passwordHash').sort({ createdAt: -1 });
    if (req.user && req.user.role !== 'OWNER' && req.user.clubId !== 'ALL') {
      users = users.filter(function (u) {
        return String(u.clubId) === String(req.user.clubId);
      });
    }
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 9. Users: POST Create
app.post('/api/users', authenticateUser, requireAuth, requirePermission('users.create'), async (req, res) => {
  try {
    const { name, username, password, role, clubId, permissions, active } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ success: false, message: 'Name, username, and password are required' });
    }

    const cleanUsername = String(username).toLowerCase().trim();
    const dbConn = await connectToDatabase();
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(String(password), salt);

    const isOwnerRole = role === 'OWNER';
    const userClubId = isOwnerRole ? 'ALL' : (clubId || 'ALL');
    const userPerms = isOwnerRole ? ['*'] : (Array.isArray(permissions) ? permissions : []);

    if (req.user && req.user.role !== 'OWNER') {
      if (isOwnerRole) {
        return res.status(403).json({ success: false, message: 'Only the OWNER can create another OWNER account.' });
      }
      if (req.user.clubId !== 'ALL' && String(userClubId) !== String(req.user.clubId)) {
        return res.status(403).json({ success: false, message: 'Cannot assign a user to a club outside your access scope.' });
      }
    }

    if (!dbConn) {
      const existingLocal = localUsers.find(u => u.username === cleanUsername);
      if (existingLocal) {
        return res.status(400).json({ success: false, message: `Username '${cleanUsername}' is already taken.` });
      }
      const newUser = {
        _id: 'u_' + Date.now(),
        name,
        username: cleanUsername,
        passwordHash: hash,
        role: role || 'ADMIN',
        clubId: userClubId,
        permissions: userPerms,
        active: active !== undefined ? active : true,
        createdAt: new Date()
      };
      localUsers.unshift(newUser);
      const userObj = Object.assign({}, newUser);
      delete userObj.passwordHash;
      return res.json({ success: true, user: userObj, message: 'User created successfully' });
    }

    const existing = await User.findOne({ username: cleanUsername });
    if (existing) {
      return res.status(400).json({ success: false, message: `Username '${cleanUsername}' is already taken.` });
    }

    const newUser = await User.create({
      name,
      username: cleanUsername,
      passwordHash: hash,
      role: role || 'ADMIN',
      clubId: userClubId,
      permissions: userPerms,
      active: active !== undefined ? active : true
    });

    const userObj = newUser.toObject();
    delete userObj.passwordHash;

    res.json({ success: true, user: userObj, message: 'User created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 10. Users: PUT Update
app.put('/api/users/:id', authenticateUser, requireAuth, requirePermission('users.edit'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, username, password, role, clubId, permissions, active } = req.body;
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const targetUser = localUsers.find(u => String(u._id) === String(id));
      if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

      if (targetUser.role === 'OWNER' && req.user.role !== 'OWNER') {
        return res.status(403).json({ success: false, message: 'Only the OWNER can modify the OWNER account.' });
      }
      if (req.user.role !== 'OWNER' && req.user.clubId !== 'ALL' && String(targetUser.clubId) !== String(req.user.clubId) && String(targetUser._id) !== String(req.user._id)) {
        return res.status(403).json({ success: false, message: 'Cannot modify a user outside your assigned club.' });
      }
      if (role && req.user.role !== 'OWNER' && role === 'OWNER') {
        return res.status(403).json({ success: false, message: 'Only the OWNER can assign OWNER role.' });
      }
      if (clubId && req.user.role !== 'OWNER' && req.user.clubId !== 'ALL' && String(clubId) !== String(req.user.clubId)) {
        return res.status(403).json({ success: false, message: 'Cannot assign a user to a club outside your access scope.' });
      }

      if (name) targetUser.name = name;
      if (username) targetUser.username = String(username).toLowerCase().trim();
      if (role && req.user.role === 'OWNER') {
        targetUser.role = role;
        if (role === 'OWNER') {
          targetUser.clubId = 'ALL';
          targetUser.permissions = ['*'];
        }
      }
      if (clubId && targetUser.role !== 'OWNER') targetUser.clubId = clubId;
      if (Array.isArray(permissions) && targetUser.role !== 'OWNER') targetUser.permissions = permissions;
      if (active !== undefined) {
        if (targetUser.role === 'OWNER' && !active) {
          return res.status(400).json({ success: false, message: 'Cannot disable the OWNER account.' });
        }
        targetUser.active = active;
      }
      if (password && String(password).trim().length > 0) {
        const salt = bcrypt.genSaltSync(10);
        targetUser.passwordHash = bcrypt.hashSync(String(password), salt);
      }

      const userObj = Object.assign({}, targetUser);
      delete userObj.passwordHash;
      return res.json({ success: true, user: userObj, message: 'User updated successfully' });
    }

    let targetUser = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      targetUser = await User.findById(id);
    }
    if (!targetUser) {
      targetUser = await User.findOne({ username: id.toLowerCase() }) || await User.findOne({ _id: id });
    }
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    if (targetUser.role === 'OWNER' && req.user.role !== 'OWNER') {
      return res.status(403).json({ success: false, message: 'Only the OWNER can modify the OWNER account.' });
    }
    if (req.user.role !== 'OWNER' && req.user.clubId !== 'ALL' && String(targetUser.clubId) !== String(req.user.clubId) && String(targetUser._id) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Cannot modify a user outside your assigned club.' });
    }
    if (role && req.user.role !== 'OWNER' && role === 'OWNER') {
      return res.status(403).json({ success: false, message: 'Only the OWNER can assign OWNER role.' });
    }
    if (clubId && req.user.role !== 'OWNER' && req.user.clubId !== 'ALL' && String(clubId) !== String(req.user.clubId)) {
      return res.status(403).json({ success: false, message: 'Cannot assign a user to a club outside your access scope.' });
    }

    if (name) targetUser.name = name;
    if (username) {
      const cleanUsername = String(username).toLowerCase().trim();
      const existing = await User.findOne({ username: cleanUsername, _id: { $ne: targetUser._id } });
      if (existing) {
        return res.status(400).json({ success: false, message: `Username '${cleanUsername}' is already taken.` });
      }
      targetUser.username = cleanUsername;
    }
    if (role && req.user.role === 'OWNER') {
      targetUser.role = role;
      if (role === 'OWNER') {
        targetUser.clubId = 'ALL';
        targetUser.permissions = ['*'];
      }
    }
    if (clubId && targetUser.role !== 'OWNER') targetUser.clubId = clubId;
    if (Array.isArray(permissions) && targetUser.role !== 'OWNER') targetUser.permissions = permissions;
    if (active !== undefined) {
      if (targetUser.role === 'OWNER' && !active) {
        return res.status(400).json({ success: false, message: 'Cannot disable the OWNER account.' });
      }
      targetUser.active = active;
    }
    if (password && String(password).trim().length > 0) {
      const salt = bcrypt.genSaltSync(10);
      targetUser.passwordHash = bcrypt.hashSync(String(password), salt);
    }

    await targetUser.save();
    const userObj = targetUser.toObject();
    delete userObj.passwordHash;

    res.json({ success: true, user: userObj, message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 11. Users: DELETE Delete
app.delete('/api/users/:id', authenticateUser, requireAuth, requirePermission('users.delete'), async (req, res) => {
  try {
    const { id } = req.params;
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const targetUser = localUsers.find(u => String(u._id) === String(id));
      if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });
      if (targetUser.role === 'OWNER') {
        return res.status(400).json({ success: false, message: 'Cannot delete the OWNER account.' });
      }
      if (req.user.role !== 'OWNER' && req.user.clubId !== 'ALL' && String(targetUser.clubId) !== String(req.user.clubId)) {
        return res.status(403).json({ success: false, message: 'Cannot delete a user outside your assigned club.' });
      }
      localUsers = localUsers.filter(u => String(u._id) !== String(id));
      return res.json({ success: true, message: 'User deleted successfully' });
    }

    let targetUser = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      targetUser = await User.findById(id);
    }
    if (!targetUser) {
      targetUser = await User.findOne({ username: id.toLowerCase() }) || await User.findOne({ _id: id });
    }
    if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });

    if (targetUser.role === 'OWNER') {
      return res.status(403).json({ success: false, message: 'The OWNER account cannot be deleted.' });
    }

    await User.findByIdAndDelete(targetUser._id);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
