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
  {
    _id: 'c_spikers',
    clubId: 'spikers',
    name: 'ACEIT Spikers',
    sport: 'Volleyball',
    slug: 'spikers',
    logo: '',
    coverImage: '',
    description: 'ACEIT Official Volleyball Club',
    active: true,
    status: 'active',
    createdAt: new Date()
  }
];

let localRoles = [
  { _id: 'r_owner', name: 'OWNER', title: 'Club Owner / Founder', badgeBg: '#F39C12', badgeText: '#FFFFFF', badgeGlow: 'rgba(243, 156, 18, 0.85)', permissions: ['*'], isSystem: true, description: 'Super-admin with unrestricted permissions' },
  { _id: 'r_admin', name: 'ADMIN', title: 'Administrator', badgeBg: '#2980B9', badgeText: '#FFFFFF', badgeGlow: 'rgba(41, 128, 185, 0.85)', permissions: ['*'], isSystem: true, description: 'System administrator with full club management' },
  { _id: 'r_coord', name: 'COORDINATOR', title: 'Sports Coordinator', badgeBg: '#8E44AD', badgeText: '#FFFFFF', badgeGlow: 'rgba(142, 68, 173, 0.85)', permissions: ['players.*', 'matches.*', 'events.*', 'news.*', 'gallery.*', 'training.*', 'testimonials.*', 'sponsors.*', 'stats.*', 'about.*', 'contact.*', 'applications.*'], isSystem: false, description: 'Club coordinator managing matches, events, news and tryouts' },
  { _id: 'r_capt', name: 'CAPTAIN', title: 'Team Captain', badgeBg: '#E67E22', badgeText: '#FFFFFF', badgeGlow: 'rgba(230, 126, 34, 0.85)', permissions: ['matches.*', 'players.view', 'training.*'], isSystem: false, description: 'Team leader with squad and match management' },
  { _id: 'r_student', name: 'STUDENT', title: 'Student Athlete', badgeBg: '#27AE60', badgeText: '#FFFFFF', badgeGlow: 'rgba(39, 174, 96, 0.65)', permissions: ['profile.view', 'profile.edit', 'clubs.join', 'applications.submit'], isSystem: true, description: 'Registered student athlete' }
];

let localUsers = [
  {
    _id: 'owner_local',
    name: 'Founder / Owner',
    username: (process.env.OWNER_USERNAME || 'founder').toLowerCase().trim(),
    passwordHash: bcrypt.hashSync(process.env.OWNER_PASSWORD || 'OwnerSecret123!', 10),
    role: 'OWNER',
    clubId: 'ALL',
    clubs: ['aceit-spikers'],
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
  events: { type: Array, default: [] },
  training: { type: Array, default: [] },
  about: { type: Object, default: {} },
  contact: { type: Object, default: {} },
  pin: { type: String, default: '2026' }
}, { timestamps: true, strict: false });

const ClubDoc = mongoose.models.ClubDoc || mongoose.model('ClubDoc', clubSchema);

// Dynamic Multi-Club Model
const clubItemSchema = new mongoose.Schema({
  clubId: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  sport: { type: String, required: true, trim: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  logo: { type: String, default: '' },
  coverImage: { type: String, default: '' },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
  status: { type: String, default: 'active' }
}, { timestamps: true });

const Club = mongoose.models.Club || mongoose.model('Club', clubItemSchema);

// Dynamic Role & Permissions Model with Custom Glow & Badge Styling
const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, uppercase: true, trim: true },
  title: { type: String, required: true, trim: true },
  badgeBg: { type: String, default: '#8E44AD' },
  badgeText: { type: String, default: '#FFFFFF' },
  badgeGlow: { type: String, default: 'rgba(142, 68, 173, 0.85)' },
  permissions: { type: [String], default: [] },
  isSystem: { type: Boolean, default: false },
  description: { type: String, default: '' }
}, { timestamps: true });

const Role = mongoose.models.Role || mongoose.model('Role', roleSchema);

// Scalable Multi-User & Granular Permission Model (Students + Admins + Custom Roles + Owner)
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  rtuRollNo: { type: String, trim: true, default: '' },
  email: { type: String, default: '', lowercase: true, trim: true },
  mobile: { type: String, default: '', trim: true },
  photo: { type: String, default: '' },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'STUDENT', uppercase: true, trim: true },
  clubId: { type: String, default: 'ALL' },
  clubs: { type: [String], default: ['aceit-spikers'] },
  bio: { type: String, default: '' },
  sport: { type: String, default: '' },
  branch: { type: String, default: 'Computer Science & Engineering', trim: true },
  year: { type: String, default: '3rd Year', trim: true },
  position: { type: String, default: 'Outside Hitter', trim: true },
  jerseyNo: { type: String, default: '', trim: true },
  height: { type: String, default: '', trim: true },
  achievements: { type: Array, default: [] },
  stats: {
    matchesPlayed: { type: Number, default: 0 },
    points: { type: Number, default: 0 },
    spikes: { type: Number, default: 0 },
    blocks: { type: Number, default: 0 },
    aces: { type: Number, default: 0 },
    mvpAwards: { type: Number, default: 0 },
    mvpPoints: { type: Number, default: 0 }
  },
  badges: { type: Array, default: [] },
  permissions: { type: [String], default: [] },
  active: { type: Boolean, default: true },
  lastLoginAt: { type: Date }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

// Join Club Application Model for Tally Webhook & Student Dashboard
const applicationSchema = new mongoose.Schema({
  userId: { type: String, default: null },
  username: { type: String, default: null },
  clubSlug: { type: String, default: 'aceit-spikers' },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, default: '' },
  position: { type: String, default: '' },
  experience: { type: String, default: '' },
  message: { type: String, default: '' },
  status: { type: String, default: 'Pending' }, // 'Pending', 'Reviewed', 'Accepted', 'Rejected'
  source: { type: String, default: 'Website Form' },
  adminFeedback: { type: String, default: '' },
  tallyEventId: { type: String, default: null },
  tallyResponseId: { type: String, default: null }
}, { timestamps: true });

const ApplicationDoc = mongoose.models.ApplicationDoc || mongoose.model('ApplicationDoc', applicationSchema);

// Event RSVP & Tournament Registration Model
const eventRsvpSchema = new mongoose.Schema({
  eventId: { type: String, required: true },
  eventTitle: { type: String, default: '' },
  userId: { type: String, default: null },
  username: { type: String, default: null },
  name: { type: String, required: true },
  email: { type: String, default: '' },
  rollNo: { type: String, default: '' },
  teamName: { type: String, default: '' },
  status: { type: String, default: 'Registered' } // 'Registered', 'Attending', 'Cancelled'
}, { timestamps: true });

const EventRsvp = mongoose.models.EventRsvp || mongoose.model('EventRsvp', eventRsvpSchema);

// Match Squad Lineup & Player Availability Model
const matchAvailabilitySchema = new mongoose.Schema({
  matchId: { type: String, required: true },
  userId: { type: String, default: null },
  username: { type: String, default: null },
  name: { type: String, required: true },
  availability: { type: String, default: 'Available' }, // 'Available', 'Tentative', 'Unavailable'
  note: { type: String, default: '' },
  isStartingLineup: { type: Boolean, default: false },
  position: { type: String, default: '' }
}, { timestamps: true });

const MatchAvailability = mongoose.models.MatchAvailability || mongoose.model('MatchAvailability', matchAvailabilitySchema);

// Phase 4: In-App Notifications Model
const notificationSchema = new mongoose.Schema({
  recipientUsername: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: 'broadcast' }, // 'selection', 'badge', 'application', 'match', 'broadcast'
  linkUrl: { type: String, default: '' },
  read: { type: Boolean, default: false }
}, { timestamps: true });

const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

// Phase 4: Club Announcements & Notice Board Model
const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  clubId: { type: String, default: 'all' }, // 'all' or specific club slug
  category: { type: String, default: 'General' }, // 'Urgent', 'Selection', 'Practice', 'Tournament', 'General'
  isPinned: { type: Boolean, default: false },
  authorName: { type: String, default: 'Club Coordinator' },
  authorRole: { type: String, default: 'COORDINATOR' },
  authorUsername: { type: String, default: 'admin' }
}, { timestamps: true });

const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

// Fallback Stores for Phase 3 & Phase 4
let localEventRsvps = [];
let localMatchAvailability = [];
let localNotifications = [];
let localAnnouncements = [
  {
    _id: 'ann_1',
    title: 'Inter-College State Championship Trials Announced',
    content: 'Selection trials for the Men\'s & Women\'s volleyball first-team roster will take place this Saturday at the ACEIT Indoor Sports Complex. All registered students are welcome to attend with valid college ID.',
    clubId: 'all',
    category: 'Selection',
    isPinned: true,
    authorName: 'Shubham Patidar',
    authorRole: 'CAPTAIN',
    authorUsername: 'shubham_cap',
    createdAt: new Date(Date.now() - 3600000 * 24)
  },
  {
    _id: 'ann_2',
    title: 'Evening Strength & Conditioning Schedule Update',
    content: 'Starting next Monday, tactical practice and jump training will run from 5:30 PM to 7:30 PM under head coach supervision. Check the training tab for detailed drill breakdowns.',
    clubId: 'aceit-spikers',
    category: 'Practice',
    isPinned: false,
    authorName: 'Sports Coordinator',
    authorRole: 'COORDINATOR',
    authorUsername: 'coordinator',
    createdAt: new Date(Date.now() - 3600000 * 48)
  }
];
let localLiveMatches = {}; // matchId -> { isLive, currentSet, team1SetsWon, team2SetsWon, liveScore: { team1, team2 }, setScores: [], liveServingTeam, playByPlay: [] }

// Phase 4 Notification Helper
async function createNotification(recipientUsername, title, message, type = 'broadcast', linkUrl = '') {
  try {
    const uname = String(recipientUsername || '').toLowerCase().trim();
    if (!uname) return null;
    const dbConn = await connectToDatabase();
    if (dbConn) {
      return await Notification.create({
        recipientUsername: uname,
        title,
        message,
        type,
        linkUrl,
        read: false
      });
    }
    const notif = {
      _id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      recipientUsername: uname,
      title,
      message,
      type,
      linkUrl,
      read: false,
      createdAt: new Date()
    };
    localNotifications.unshift(notif);
    return notif;
  } catch (e) {
    console.error('Error creating notification:', e.message);
    return null;
  }
}

const DEFAULT_PERF_BADGES = [
  { badgeKey: 'MVP_GOLD', title: 'MVP of the Match', icon: '🏆', glow: 'rgba(241, 196, 15, 0.95)', bg: '#F1C40F', text: '#000000', description: 'Awarded MVP in collegiate matches' },
  { badgeKey: 'TOP_SPIKER', title: 'Top Spiker', icon: '⚡', glow: 'rgba(230, 126, 34, 0.9)', bg: '#E67E22', text: '#FFFFFF', description: '10+ winning spikes and attack points' },
  { badgeKey: 'WALL_OF_ACE', title: 'Wall of ACEIT (Best Blocker)', icon: '🛡️', glow: 'rgba(52, 152, 219, 0.9)', bg: '#2980B9', text: '#FFFFFF', description: 'Defensive wall and block leader' },
  { badgeKey: 'ACE_SERVER', title: 'Ace Server', icon: '🎯', glow: 'rgba(155, 89, 182, 0.9)', bg: '#8E44AD', text: '#FFFFFF', description: 'Service ace specialist' },
  { badgeKey: 'IRON_DEFENDER', title: 'Iron Defender (Best Libero)', icon: '🧤', glow: 'rgba(46, 204, 113, 0.9)', bg: '#27AE60', text: '#FFFFFF', description: 'Spectacular digs & reception' }
];

// Helper: Get Role Styling Metadata (Colors, Glow, Title)
async function getRoleMetadata(roleName) {
  const normName = String(roleName || 'STUDENT').toUpperCase().trim();
  const dbConn = await connectToDatabase();
  if (dbConn) {
    const r = await Role.findOne({ name: normName });
    if (r) {
      return {
        role: r.name,
        roleTitle: r.title,
        badgeBg: r.badgeBg,
        badgeText: r.badgeText,
        badgeGlow: r.badgeGlow,
        permissions: r.permissions
      };
    }
  }
  const fallback = localRoles.find(r => r.name === normName) || localRoles.find(r => r.name === 'STUDENT');
  return {
    role: fallback ? fallback.name : normName,
    roleTitle: fallback ? fallback.title : normName,
    badgeBg: fallback ? fallback.badgeBg : '#27AE60',
    badgeText: fallback ? fallback.badgeText : '#FFFFFF',
    badgeGlow: fallback ? fallback.badgeGlow : 'rgba(39, 174, 96, 0.65)',
    permissions: fallback ? fallback.permissions : []
  };
}

// Initial Seeding Helper: Auto-seeds initial Club, Roles & OWNER account if database is fresh
async function seedInitialAuthAndClubs() {
  const dbConn = await connectToDatabase();
  if (!dbConn) return;

  try {
    const spikersClub = await Club.findOne({ $or: [{ clubId: 'spikers' }, { slug: 'spikers' }, { slug: 'aceit-spikers' }] });
    if (!spikersClub) {
      await Club.create({
        clubId: 'spikers',
        name: 'ACEIT Spikers',
        sport: 'Volleyball',
        slug: 'spikers',
        logo: '',
        coverImage: '',
        description: 'ACEIT Official Volleyball Club',
        active: true,
        status: 'active'
      });
      console.log('[MongoDB Atlas] Auto-seeded default club: ACEIT Spikers (Volleyball) with clubId: spikers');
    } else {
      let updated = false;
      if (!spikersClub.clubId) { spikersClub.clubId = 'spikers'; updated = true; }
      if (!spikersClub.status) { spikersClub.status = spikersClub.active ? 'active' : 'inactive'; updated = true; }
      if (spikersClub.coverImage === undefined) { spikersClub.coverImage = ''; updated = true; }
      if (updated) await spikersClub.save();
    }

    const roleCount = await Role.countDocuments();
    if (roleCount === 0) {
      for (const r of localRoles) {
        const { _id, ...rData } = r;
        await Role.create(rData);
      }
      console.log('[MongoDB Atlas] Auto-seeded default system and custom roles');
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
  if (!token && req.cookies) {
    token = req.cookies.token || req.cookies.auth_token;
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

// Multi-Club Data Normalization & Filtering Helpers
function normalizeItemClubId(item, defaultClubId = 'spikers') {
  if (!item || typeof item !== 'object') return item;
  if (!item.clubId) {
    item.clubId = defaultClubId;
  }
  return item;
}

function filterByClub(items, reqClubId = 'spikers') {
  if (!Array.isArray(items)) return [];
  if (reqClubId === 'all' || reqClubId === 'ALL') {
    return items;
  }
  const normReq = String(reqClubId || 'spikers').toLowerCase().trim();
  return items.filter(item => {
    const cId = String(item.clubId || item.clubSlug || 'spikers').toLowerCase().trim();
    if (normReq === 'spikers' || normReq === 'aceit-spikers') {
      return cId === 'spikers' || cId === 'aceit-spikers';
    }
    return cId === normReq;
  });
}

// Helper: Read default data.json fallback (used ONLY for initial empty collection seeding or local standalone dev)
function readLocalFileDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.team)) parsed.team.forEach(i => normalizeItemClubId(i, 'spikers'));
      if (Array.isArray(parsed.matches)) parsed.matches.forEach(i => normalizeItemClubId(i, 'spikers'));
      if (Array.isArray(parsed.events)) parsed.events.forEach(i => normalizeItemClubId(i, 'spikers'));
      if (Array.isArray(parsed.training)) parsed.training.forEach(i => normalizeItemClubId(i, 'spikers'));
      if (Array.isArray(parsed.news)) parsed.news.forEach(i => normalizeItemClubId(i, 'spikers'));
      if (Array.isArray(parsed.gallery)) parsed.gallery.forEach(i => normalizeItemClubId(i, 'spikers'));
      if (Array.isArray(parsed.sponsors)) parsed.sponsors.forEach(i => normalizeItemClubId(i, 'spikers'));
      if (Array.isArray(parsed.testimonials)) parsed.testimonials.forEach(i => normalizeItemClubId(i, 'spikers'));
      return parsed;
    }
  } catch (err) { }
  return {
    team: [], matches: [], news: [], sponsors: [], testimonials: [], stats: [], gallery: [], events: [], training: [], slideshow: [],
    about: {
      eyebrow: 'Who we are',
      title: 'Built on the court,\ndefined by character.',
      sub: 'ACEIT Spikers brings together players who train hard, compete fair, and show up for one another — on and off the court.',
      mission: 'To build a competitive volleyball program that develops skilled, disciplined athletes while creating a home for anyone who wants to play, grow, and belong.',
      vision: 'To be recognised as the standard-bearer for collegiate volleyball at ACEIT — a club that wins with class and trains the next generation of captains.'
    },
    contact: {
      address: 'Arya College of Engineering & IT, Jaipur, Rajasthan',
      email: 'spikers@aceit.edu.in',
      phone: '+91 98765 43210',
      hours: 'Mon–Sat, 6:00 AM – 8:00 PM',
      insta: '#',
      fb: '#',
      yt: '#',
      wa: '#'
    }
  };
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
      if (doc) {
        const docObj = doc.toObject();
        if (Array.isArray(docObj.team)) docObj.team.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(docObj.matches)) docObj.matches.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(docObj.events)) docObj.events.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(docObj.training)) docObj.training.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(docObj.news)) docObj.news.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(docObj.gallery)) docObj.gallery.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(docObj.sponsors)) docObj.sponsors.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(docObj.testimonials)) docObj.testimonials.forEach(i => normalizeItemClubId(i, 'spikers'));
        return { success: true, data: docObj };
      }
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
        gallery: data.gallery || [],
        events: data.events || [],
        training: data.training || [],
        slideshow: data.slideshow || [],
        about: data.about || {},
        contact: data.contact || {},
        deletedCategories: data.deletedCategories || {},
        categories: data.categories || {},
        customCategories: data.customCategories || {}
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

// 1. Get full database (supports ?clubId=)
app.get('/api/db', async (req, res) => {
  const result = await getDB();
  if (!result.success) {
    return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${result.error}`, error: result.error });
  }
  let data = result.data;
  const reqClubId = req.query.clubId || 'spikers';
  if (reqClubId !== 'all' && reqClubId !== 'ALL') {
    data = {
      ...data,
      team: filterByClub(data.team, reqClubId),
      matches: filterByClub(data.matches, reqClubId),
      events: filterByClub(data.events, reqClubId),
      training: filterByClub(data.training, reqClubId),
      news: filterByClub(data.news, reqClubId),
      gallery: filterByClub(data.gallery, reqClubId),
      sponsors: filterByClub(data.sponsors, reqClubId),
      testimonials: filterByClub(data.testimonials, reqClubId),
      stats: filterByClub(data.stats, reqClubId),
      slideshow: filterByClub(data.slideshow, reqClubId)
    };
  }
  res.json({ success: true, data });
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

// 3. Get players team array (supports ?clubId=)
app.get('/api/team', async (req, res) => {
  const result = await getDB();
  if (!result.success) {
    return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${result.error}`, error: result.error });
  }
  let team = filterByClub(result.data.team || [], req.query.clubId || 'spikers');
  res.json({ success: true, team });
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
    player.clubId = player.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    db.team = db.team || [];
    db.team.push(player);

    const result = await saveDB(db);
    if (!result.success) {
      console.error(`[API Player Add Failed] Could not persist player in MongoDB Atlas: ${player.n} Error: ${result.error}`);
      return res.status(500).json({ success: false, message: `Failed to persist player addition: ${result.error}`, error: result.error });
    }

    console.log(`[API Player Add Success] Player added to MongoDB Atlas: ${player.n} (#${player.num}) ID: ${player.id} (Club: ${player.clubId})`);
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
    if (!updatedPlayer.clubId) {
      updatedPlayer.clubId = db.team[idx].clubId || 'spikers';
    }
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

// ==========================================
// MATCHES API ENDPOINTS (MongoDB Persistence)
// ==========================================

// GET /api/matches (supports ?clubId=)
app.get('/api/matches', async (req, res) => {
  const result = await getDB();
  if (!result.success) {
    return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${result.error}`, error: result.error });
  }
  let matches = filterByClub(result.data.matches || [], req.query.clubId || 'spikers');
  res.json({ success: true, matches });
});

// POST /api/matches (Add Match)
app.post('/api/matches', authenticateUser, requireAuth, async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) {
      return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${dbRes.error}`, error: dbRes.error });
    }
    const db = dbRes.data;
    const match = req.body || {};
    match.id = match.id || generateId();
    match.clubId = match.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    if (!match.team1) match.team1 = match.clubId === 'spikers' ? 'ACEIT Spikers' : 'Home Team';
    if (!match.opp && match.team2) match.opp = match.team2;
    if (!match.team2 && match.opp) match.team2 = match.opp;
    if (!match.winner) match.winner = 'none';

    db.matches = db.matches || [];
    db.matches.push(match);

    const result = await saveDB(db);
    if (!result.success) {
      console.error(`[API Match Add Failed] Could not persist match: ${match.id} Error: ${result.error}`);
      return res.status(500).json({ success: false, message: `Failed to persist match addition: ${result.error}`, error: result.error });
    }

    console.log(`[API Match Add Success] Match added to MongoDB Atlas: ID ${match.id} (Club: ${match.clubId})`);
    res.json({ success: true, match, matches: db.matches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, error: err.message });
  }
});

// PUT /api/matches/:id (Update Match)
app.put('/api/matches/:id', authenticateUser, requireAuth, async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) {
      return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${dbRes.error}`, error: dbRes.error });
    }
    const db = dbRes.data;
    const { id } = req.params;
    const updatedMatch = req.body || {};
    db.matches = db.matches || [];
    const idx = db.matches.findIndex(m => String(m.id) === String(id));
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }
    updatedMatch.id = id;
    if (!updatedMatch.clubId) {
      updatedMatch.clubId = db.matches[idx].clubId || 'spikers';
    }
    if (!updatedMatch.team1) updatedMatch.team1 = updatedMatch.clubId === 'spikers' ? 'ACEIT Spikers' : 'Home Team';
    if (!updatedMatch.opp && updatedMatch.team2) updatedMatch.opp = updatedMatch.team2;
    if (!updatedMatch.team2 && updatedMatch.opp) updatedMatch.team2 = updatedMatch.opp;
    if (!updatedMatch.winner) updatedMatch.winner = 'none';

    db.matches[idx] = updatedMatch;

    const result = await saveDB(db);
    if (!result.success) {
      console.error(`[API Match Update Failed] Could not persist update: ${result.error}`);
      return res.status(500).json({ success: false, message: `Failed to persist match update: ${result.error}`, error: result.error });
    }

    console.log(`[API Match Update Success] Match updated in MongoDB Atlas: ID ${id}`);
    res.json({ success: true, match: updatedMatch, matches: db.matches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, error: err.message });
  }
});

// DELETE /api/matches/:id (Delete Match)
app.delete('/api/matches/:id', authenticateUser, requireAuth, async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) {
      return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${dbRes.error}`, error: dbRes.error });
    }
    const db = dbRes.data;
    const { id } = req.params;
    db.matches = db.matches || [];
    const initialLen = db.matches.length;
    db.matches = db.matches.filter(m => String(m.id) !== String(id));
    if (db.matches.length === initialLen) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const result = await saveDB(db);
    if (!result.success) {
      console.error(`[API Match Delete Failed] Could not persist deletion: ${result.error}`);
      return res.status(500).json({ success: false, message: `Failed to persist match deletion: ${result.error}`, error: result.error });
    }

    console.log(`[API Match Delete Success] Match deleted from MongoDB Atlas: ID ${id}`);
    res.json({ success: true, message: 'Match deleted', matches: db.matches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, error: err.message });
  }
});

// POST /api/matches/duplicate/:id (Duplicate Match)
app.post('/api/matches/duplicate/:id', authenticateUser, requireAuth, async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) {
      return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${dbRes.error}`, error: dbRes.error });
    }
    const db = dbRes.data;
    const { id } = req.params;
    db.matches = db.matches || [];
    const orig = db.matches.find(m => String(m.id) === String(id));
    if (!orig) {
      return res.status(404).json({ success: false, message: 'Original match not found' });
    }
    const copy = Object.assign({}, orig, { id: generateId() });
    const idx = db.matches.findIndex(m => String(m.id) === String(id));
    db.matches.splice(idx + 1, 0, copy);

    const result = await saveDB(db);
    if (!result.success) {
      console.error(`[API Match Duplicate Failed] Could not persist duplication: ${result.error}`);
      return res.status(500).json({ success: false, message: `Failed to persist duplication: ${result.error}`, error: result.error });
    }

    console.log(`[API Match Duplicate Success] Match duplicated in MongoDB Atlas: ID ${copy.id}`);
    res.json({ success: true, match: copy, matches: db.matches });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message, error: err.message });
  }
});

// ==========================================
// CONTENT API ENDPOINTS (News, Gallery, Sponsors, Achievements, About, Contact)
// ==========================================

// GET /api/news (supports ?clubId=)
app.get('/api/news', async (req, res) => {
  const result = await getDB();
  if (!result.success) return res.status(500).json({ success: false, message: result.error });
  let news = filterByClub(result.data.news || [], req.query.clubId || 'spikers');
  res.json({ success: true, news });
});

// POST /api/news
app.post('/api/news', authenticateUser, requireAuth, requirePermission('news.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const item = req.body || {};
    item.id = item.id || generateId();
    item.clubId = item.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    db.news = db.news || [];
    db.news.unshift(item);
    await saveDB(db);
    res.json({ success: true, item, news: db.news });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/gallery (supports ?clubId=)
app.get('/api/gallery', async (req, res) => {
  const result = await getDB();
  if (!result.success) return res.status(500).json({ success: false, message: result.error });
  let gallery = filterByClub(result.data.gallery || [], req.query.clubId || 'spikers');
  res.json({ success: true, gallery });
});

// POST /api/gallery
app.post('/api/gallery', authenticateUser, requireAuth, requirePermission('gallery.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const item = req.body || {};
    item.id = item.id || generateId();
    item.clubId = item.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    db.gallery = db.gallery || [];
    db.gallery.unshift(item);
    await saveDB(db);
    res.json({ success: true, item, gallery: db.gallery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/sponsors (supports ?clubId=)
app.get('/api/sponsors', async (req, res) => {
  const result = await getDB();
  if (!result.success) return res.status(500).json({ success: false, message: result.error });
  let sponsors = filterByClub(result.data.sponsors || [], req.query.clubId || 'spikers');
  res.json({ success: true, sponsors });
});

// GET /api/achievements (supports ?clubId=)
app.get('/api/achievements', async (req, res) => {
  const result = await getDB();
  if (!result.success) return res.status(500).json({ success: false, message: result.error });
  let achievements = filterByClub(result.data.testimonials || result.data.achievements || [], req.query.clubId || 'spikers');
  res.json({ success: true, achievements });
});

// GET /api/about (supports ?clubId=)
app.get('/api/about', async (req, res) => {
  const result = await getDB();
  if (!result.success) return res.status(500).json({ success: false, message: result.error });
  let about = result.data.about || {};
  res.json({ success: true, about });
});

// GET /api/contact (supports ?clubId=)
app.get('/api/contact', async (req, res) => {
  const result = await getDB();
  if (!result.success) return res.status(500).json({ success: false, message: result.error });
  let contact = result.data.contact || {};
  res.json({ success: true, contact });
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
// STUDENT SIGNUP, AUTHENTICATION & PROFILE ROUTES
// ==========================================

// 1. Auth: Student Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, username, rtuRollNo, email, mobile, password, photo, branch, year, position, jerseyNo, height, sport } = req.body;
    if (!name || !username || !rtuRollNo || !email || !password) {
      return res.status(400).json({ success: false, message: 'Full Name, Username, RTU Roll No., Email, and Password are required.' });
    }

    const cleanName = String(name).trim();
    const cleanUsername = String(username).toLowerCase().trim();
    const cleanEmail = String(email).toLowerCase().trim();
    const cleanRollNo = String(rtuRollNo).trim();
    const cleanMobile = mobile ? String(mobile).trim() : '';
    const cleanBranch = branch ? String(branch).trim() : 'Computer Science & Engineering';
    const cleanYear = year ? String(year).trim() : '3rd Year';
    const cleanPosition = position ? String(position).trim() : 'Outside Hitter';
    const cleanJersey = jerseyNo ? String(jerseyNo).trim() : '';
    const cleanHeight = height ? String(height).trim() : '';
    const cleanSport = sport ? String(sport).trim() : 'Volleyball';

    if (cleanUsername.length < 3) {
      return res.status(400).json({ success: false, message: 'Username must be at least 3 characters long.' });
    }
    if (!/^[a-z0-9_.-]+$/.test(cleanUsername)) {
      return res.status(400).json({ success: false, message: 'Username can only contain letters, numbers, dots, dashes, and underscores.' });
    }
    if (cleanEmail.indexOf('@') === -1 || cleanEmail.indexOf('.') === -1) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const dbConn = await connectToDatabase();
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(String(password), salt);

    if (!dbConn) {
      const existingUser = localUsers.find(u => u.username === cleanUsername || (u.email && u.email.toLowerCase() === cleanEmail));
      if (existingUser) {
        if (existingUser.username === cleanUsername) {
          return res.status(400).json({ success: false, message: 'Username is already taken. Please pick another.' });
        }
        return res.status(400).json({ success: false, message: 'Email is already registered. Please sign in.' });
      }
      const newUser = {
        _id: 'u_' + Date.now(),
        name: cleanName,
        username: cleanUsername,
        rtuRollNo: cleanRollNo,
        email: cleanEmail,
        mobile: cleanMobile,
        photo: photo || '',
        passwordHash: hash,
        role: 'STUDENT',
        clubId: 'aceit-spikers',
        clubs: ['aceit-spikers'],
        bio: '',
        sport: cleanSport,
        branch: cleanBranch,
        year: cleanYear,
        position: cleanPosition,
        jerseyNo: cleanJersey,
        height: cleanHeight,
        achievements: [],
        permissions: ['profile.view', 'profile.edit', 'clubs.join'],
        active: true,
        createdAt: new Date(),
        lastLoginAt: new Date()
      };
      localUsers.unshift(newUser);

      const token = jwt.sign(
        { id: String(newUser._id), username: newUser.username, role: newUser.role, clubId: newUser.clubId, permissions: newUser.permissions },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400000 });
      res.cookie('auth_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400000 });

      const safeUser = Object.assign({}, newUser);
      delete safeUser.passwordHash;
      return res.json({ success: true, token, user: safeUser, message: 'Student account registered successfully!' });
    }

    const existing = await User.findOne({
      $or: [{ username: cleanUsername }, { email: cleanEmail }]
    });
    if (existing) {
      if (existing.username === cleanUsername) {
        return res.status(400).json({ success: false, message: 'Username is already taken. Please pick another.' });
      }
      return res.status(400).json({ success: false, message: 'Email is already registered. Please sign in.' });
    }

    const newUser = await User.create({
      name: cleanName,
      username: cleanUsername,
      rtuRollNo: cleanRollNo,
      email: cleanEmail,
      mobile: cleanMobile,
      photo: photo || '',
      passwordHash: hash,
      role: 'STUDENT',
      clubId: 'aceit-spikers',
      clubs: ['aceit-spikers'],
      bio: '',
      sport: cleanSport,
      branch: cleanBranch,
      year: cleanYear,
      position: cleanPosition,
      jerseyNo: cleanJersey,
      height: cleanHeight,
      achievements: [],
      permissions: ['profile.view', 'profile.edit', 'clubs.join'],
      active: true,
      lastLoginAt: new Date()
    });

    const token = jwt.sign(
      { id: String(newUser._id), username: newUser.username, role: newUser.role, clubId: newUser.clubId, permissions: newUser.permissions },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400000 });
    res.cookie('auth_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400000 });

    const safeUser = newUser.toObject();
    delete safeUser.passwordHash;

    res.json({ success: true, token, user: safeUser, message: 'Student account registered successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Auth: Login (supports Username or Email)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username/Email and Password are required' });
    }

    const cleanInput = String(username).toLowerCase().trim();
    const dbConn = await connectToDatabase();

    let user = null;
    if (dbConn) {
      user = await User.findOne({
        $or: [{ username: cleanInput }, { email: cleanInput }]
      });
      if (!user) {
        await seedInitialAuthAndClubs();
        user = await User.findOne({
          $or: [{ username: cleanInput }, { email: cleanInput }]
        });
      }
    } else {
      user = localUsers.find(u => u.username === cleanInput || (u.email && u.email.toLowerCase() === cleanInput));
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password' });
    }

    if (!user.active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Please contact administrator/owner.' });
    }

    const match = bcrypt.compareSync(String(password), user.passwordHash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password' });
    }

    const userId = user._id || user.id || 'owner_local';
    if (user.save) {
      user.lastLoginAt = new Date();
      await user.save();
    }

    const token = jwt.sign(
      { id: String(userId), username: user.username, role: user.role, clubId: user.clubId, permissions: user.permissions },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400000 });
    res.cookie('auth_token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 86400000 });

    const safeUser = user.toObject ? user.toObject() : Object.assign({}, user);
    delete safeUser.passwordHash;

    res.json({
      success: true,
      token: token,
      user: safeUser
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Auth: Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.clearCookie('auth_token');
  res.json({ success: true, message: 'Logged out' });
});

// 4. Auth: Current User Info
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

  const safeUser = req.user.toObject ? req.user.toObject() : Object.assign({}, req.user);
  delete safeUser.passwordHash;

  res.json({
    success: true,
    authenticated: true,
    user: safeUser,
    clubs
  });
});

// 5. Profile: GET Logged-in User Profile (Full Details)
app.get('/api/profile/me', authenticateUser, requireAuth, async (req, res) => {
  try {
    const dbConn = await connectToDatabase();
    let user = null;
    if (dbConn) {
      user = await User.findById(req.user._id || req.user.id).select('-passwordHash');
    } else {
      const u = localUsers.find(u => String(u._id) === String(req.user._id || req.user.id));
      if (u) {
        user = Object.assign({}, u);
        delete user.passwordHash;
      }
    }
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, profile: user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Profile: PUT Update Logged-in User Profile
app.put('/api/profile/me', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { name, mobile, photo, bio, sport, branch, year, position, jerseyNo, height, achievements } = req.body;
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const u = localUsers.find(u => String(u._id) === String(req.user._id || req.user.id));
      if (!u) return res.status(404).json({ success: false, message: 'User not found' });
      if (name) u.name = String(name).trim();
      if (mobile !== undefined) u.mobile = String(mobile).trim();
      if (photo !== undefined) u.photo = photo;
      if (bio !== undefined) u.bio = String(bio).trim();
      if (sport !== undefined) u.sport = String(sport).trim();
      if (branch !== undefined) u.branch = String(branch).trim();
      if (year !== undefined) u.year = String(year).trim();
      if (position !== undefined) u.position = String(position).trim();
      if (jerseyNo !== undefined) u.jerseyNo = String(jerseyNo).trim();
      if (height !== undefined) u.height = String(height).trim();
      if (Array.isArray(achievements)) u.achievements = achievements;

      const safe = Object.assign({}, u);
      delete safe.passwordHash;
      return res.json({ success: true, profile: safe, message: 'Profile updated successfully!' });
    }

    const u = await User.findById(req.user._id || req.user.id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    if (name) u.name = String(name).trim();
    if (mobile !== undefined) u.mobile = String(mobile).trim();
    if (photo !== undefined) u.photo = photo;
    if (bio !== undefined) u.bio = String(bio).trim();
    if (sport !== undefined) u.sport = String(sport).trim();
    if (branch !== undefined) u.branch = String(branch).trim();
    if (year !== undefined) u.year = String(year).trim();
    if (position !== undefined) u.position = String(position).trim();
    if (jerseyNo !== undefined) u.jerseyNo = String(jerseyNo).trim();
    if (height !== undefined) u.height = String(height).trim();
    if (Array.isArray(achievements)) u.achievements = achievements;

    await u.save();
    const safe = u.toObject();
    delete safe.passwordHash;
    res.json({ success: true, profile: safe, message: 'Profile updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Profile: POST Follow/Join Club
app.post('/api/profile/clubs/join', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { clubSlug } = req.body;
    if (!clubSlug) return res.status(400).json({ success: false, message: 'Club identifier required' });
    const slug = String(clubSlug).toLowerCase().trim();
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const u = localUsers.find(u => String(u._id) === String(req.user._id || req.user.id));
      if (!u) return res.status(404).json({ success: false, message: 'User not found' });
      u.clubs = u.clubs || [];
      if (u.clubs.indexOf(slug) === -1) u.clubs.push(slug);
      return res.json({ success: true, clubs: u.clubs, message: 'Joined club successfully!' });
    }

    const u = await User.findById(req.user._id || req.user.id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    u.clubs = u.clubs || [];
    if (u.clubs.indexOf(slug) === -1) {
      u.clubs.push(slug);
      await u.save();
    }
    res.json({ success: true, clubs: u.clubs, message: 'Joined club successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Profile: POST Leave Club
app.post('/api/profile/clubs/leave', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { clubSlug } = req.body;
    if (!clubSlug) return res.status(400).json({ success: false, message: 'Club identifier required' });
    const slug = String(clubSlug).toLowerCase().trim();
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const u = localUsers.find(u => String(u._id) === String(req.user._id || req.user.id));
      if (!u) return res.status(404).json({ success: false, message: 'User not found' });
      u.clubs = (u.clubs || []).filter(c => c !== slug);
      return res.json({ success: true, clubs: u.clubs, message: 'Left club' });
    }

    const u = await User.findById(req.user._id || req.user.id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    u.clubs = (u.clubs || []).filter(c => c !== slug);
    await u.save();
    res.json({ success: true, clubs: u.clubs, message: 'Left club' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 9. Public Profile: GET Public Profile by Username (Stripped of RTU Roll No, Mobile, Email, Passwords)
app.get('/api/users/profile/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const cleanUsername = String(username).toLowerCase().trim();
    const dbConn = await connectToDatabase();

    let user = null;
    if (dbConn) {
      user = await User.findOne({ username: cleanUsername });
    } else {
      user = localUsers.find(u => u.username === cleanUsername);
    }

    if (!user || !user.active) {
      return res.status(404).json({ success: false, message: 'Public profile not found or inactive.' });
    }

    const roleMeta = await getRoleMetadata(user.role);

    // Public fields ONLY: No roll number, email, mobile, password, permissions
    const publicProfile = {
      name: user.name,
      username: user.username,
      photo: user.photo || '',
      role: roleMeta.role,
      roleTitle: roleMeta.roleTitle,
      badgeBg: roleMeta.badgeBg,
      badgeText: roleMeta.badgeText,
      badgeGlow: roleMeta.badgeGlow,
      branch: user.branch || 'Computer Science & Engineering',
      year: user.year || '3rd Year',
      position: user.position || (user.sport ? `${user.sport} Player` : 'Athlete'),
      jerseyNo: user.jerseyNo || '',
      height: user.height || '',
      clubs: user.clubs || (user.clubId && user.clubId !== 'ALL' ? [user.clubId] : ['aceit-spikers']),
      bio: user.bio || '',
      sport: user.sport || 'Volleyball',
      achievements: user.achievements || [],
      stats: user.stats || { matchesPlayed: 0, points: 0, spikes: 0, blocks: 0, aces: 0, mvpAwards: 0, mvpPoints: 0 },
      badges: user.badges || [],
      memberSince: user.createdAt
    };

    res.json({ success: true, profile: publicProfile });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// DYNAMIC ROLES & GLOWING PERMISSIONS ROUTES
// ==========================================

// 10. Roles: GET List (Public/Authenticated)
app.get('/api/roles', async (req, res) => {
  try {
    const dbConn = await connectToDatabase();
    if (dbConn) {
      await seedInitialAuthAndClubs();
      const roles = await Role.find({}).sort({ createdAt: 1 });
      return res.json({ success: true, roles });
    }
    res.json({ success: true, roles: localRoles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 11. Roles: POST Create Custom Role
app.post('/api/roles', authenticateUser, requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN' && (!req.user.permissions || (!req.user.permissions.includes('roles.*') && !req.user.permissions.includes('*')))) {
      return res.status(403).json({ success: false, message: 'Forbidden: You do not have permission to create roles' });
    }
    const { name, title, badgeBg, badgeText, badgeGlow, permissions, description } = req.body;
    if (!name || !title) {
      return res.status(400).json({ success: false, message: 'Role Identifier and Title are required' });
    }
    const cleanName = String(name).toUpperCase().trim().replace(/[^A-Z0-9_]/g, '_');
    const cleanTitle = String(title).trim();
    const bg = badgeBg || '#8E44AD';
    const text = badgeText || '#FFFFFF';
    const glow = badgeGlow || 'rgba(142, 68, 173, 0.85)';
    const perms = Array.isArray(permissions) ? permissions : [];

    const dbConn = await connectToDatabase();
    if (!dbConn) {
      const existing = localRoles.find(r => r.name === cleanName);
      if (existing) return res.status(400).json({ success: false, message: 'A role with this name already exists' });
      const newRole = {
        _id: 'r_' + Date.now(),
        name: cleanName,
        title: cleanTitle,
        badgeBg: bg,
        badgeText: text,
        badgeGlow: glow,
        permissions: perms,
        isSystem: false,
        description: description || ''
      };
      localRoles.push(newRole);
      return res.json({ success: true, role: newRole, message: 'Custom role created successfully!' });
    }

    const existing = await Role.findOne({ name: cleanName });
    if (existing) return res.status(400).json({ success: false, message: 'A role with this name already exists' });

    const newRole = await Role.create({
      name: cleanName,
      title: cleanTitle,
      badgeBg: bg,
      badgeText: text,
      badgeGlow: glow,
      permissions: perms,
      isSystem: false,
      description: description || ''
    });

    res.json({ success: true, role: newRole, message: 'Custom role created successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 12. Roles: PUT Update Role
app.put('/api/roles/:id', authenticateUser, requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN' && (!req.user.permissions || (!req.user.permissions.includes('roles.*') && !req.user.permissions.includes('*')))) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions' });
    }
    const { id } = req.params;
    const { title, badgeBg, badgeText, badgeGlow, permissions, description } = req.body;
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const r = localRoles.find(r => String(r._id) === String(id) || r.name === String(id).toUpperCase());
      if (!r) return res.status(404).json({ success: false, message: 'Role not found' });
      if (title) r.title = String(title).trim();
      if (badgeBg) r.badgeBg = badgeBg;
      if (badgeText) r.badgeText = badgeText;
      if (badgeGlow) r.badgeGlow = badgeGlow;
      if (Array.isArray(permissions)) r.permissions = permissions;
      if (description !== undefined) r.description = description;
      return res.json({ success: true, role: r, message: 'Role updated successfully!' });
    }

    let r = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      r = await Role.findById(id);
    }
    if (!r) {
      r = await Role.findOne({ name: String(id).toUpperCase() });
    }
    if (!r) return res.status(404).json({ success: false, message: 'Role not found' });

    if (title) r.title = String(title).trim();
    if (badgeBg) r.badgeBg = badgeBg;
    if (badgeText) r.badgeText = badgeText;
    if (badgeGlow) r.badgeGlow = badgeGlow;
    if (Array.isArray(permissions)) r.permissions = permissions;
    if (description !== undefined) r.description = description;

    await r.save();
    res.json({ success: true, role: r, message: 'Role updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 13. Roles: DELETE Custom Role
app.delete('/api/roles/:id', authenticateUser, requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'OWNER' && req.user.role !== 'ADMIN' && (!req.user.permissions || (!req.user.permissions.includes('roles.*') && !req.user.permissions.includes('*')))) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions' });
    }
    const { id } = req.params;
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const idx = localRoles.findIndex(r => String(r._id) === String(id) || r.name === String(id).toUpperCase());
      if (idx === -1) return res.status(404).json({ success: false, message: 'Role not found' });
      if (localRoles[idx].isSystem) {
        return res.status(400).json({ success: false, message: 'Cannot delete core system role' });
      }
      localRoles.splice(idx, 1);
      return res.json({ success: true, message: 'Custom role deleted' });
    }

    let r = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      r = await Role.findById(id);
    }
    if (!r) {
      r = await Role.findOne({ name: String(id).toUpperCase() });
    }
    if (!r) return res.status(404).json({ success: false, message: 'Role not found' });
    if (r.isSystem) {
      return res.status(400).json({ success: false, message: 'Cannot delete core system role' });
    }

    await r.deleteOne();
    res.json({ success: true, message: 'Custom role deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Clubs: GET List
app.get('/api/clubs', authenticateUser, async (req, res) => {
  try {
    const dbConn = await connectToDatabase();
    if (!dbConn) {
      let clubs = localClubs;
      if (req.user && req.user.role !== 'OWNER' && req.user.clubId && req.user.clubId !== 'ALL') {
        clubs = localClubs.filter(c => String(c._id) === String(req.user.clubId) || c.clubId === req.user.clubId || c.slug === req.user.clubId);
      }
      return res.json({ success: true, clubs });
    }
    await seedInitialAuthAndClubs();
    let clubs = await Club.find({}).sort({ createdAt: -1 });
    if (req.user && req.user.role !== 'OWNER' && req.user.clubId && req.user.clubId !== 'ALL') {
      clubs = clubs.filter(c => String(c._id) === String(req.user.clubId) || c.clubId === req.user.clubId || c.slug === req.user.clubId);
    }
    res.json({ success: true, clubs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4b. Clubs: GET Single Club by ID, clubId, or slug
app.get('/api/clubs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id).toLowerCase().trim();
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const club = localClubs.find(c => String(c._id) === id || (c.clubId && c.clubId.toLowerCase() === cleanId) || (c.slug && c.slug.toLowerCase() === cleanId));
      if (!club) return res.status(404).json({ success: false, message: 'Club not found' });
      return res.json({ success: true, club });
    }

    let club = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      club = await Club.findById(id);
    }
    if (!club) {
      club = await Club.findOne({ $or: [{ clubId: cleanId }, { slug: cleanId }, { _id: id }] });
    }
    if (!club) return res.status(404).json({ success: false, message: 'Club not found' });
    res.json({ success: true, club });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Clubs: POST Create
app.post('/api/clubs', authenticateUser, requireAuth, requirePermission('clubs.create'), async (req, res) => {
  try {
    const { clubId, name, sport, slug, logo, coverImage, description, active, status } = req.body;
    if (!name || !sport) {
      return res.status(400).json({ success: false, message: 'Club Name and Sport are required' });
    }
    const cleanSlug = (slug || clubId || (name + '-' + sport)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || ('club-' + Date.now());
    const cleanClubId = (clubId || cleanSlug).toLowerCase().trim();
    const isActive = active !== undefined ? !!active : (status ? status === 'active' : true);
    const clubStatus = status || (isActive ? 'active' : 'inactive');

    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const existingLocal = localClubs.find(c => c.clubId === cleanClubId || c.slug === cleanSlug);
      if (existingLocal) {
        return res.status(400).json({ success: false, message: `A club with identifier '${cleanClubId}' or slug '${cleanSlug}' already exists.` });
      }
      const newClub = {
        _id: 'c_' + Date.now(),
        clubId: cleanClubId,
        name: String(name).trim(),
        sport: String(sport).trim(),
        slug: cleanSlug,
        logo: logo || '',
        coverImage: coverImage || '',
        description: description || '',
        active: isActive,
        status: clubStatus,
        createdAt: new Date()
      };
      localClubs.unshift(newClub);
      return res.json({ success: true, club: newClub, message: 'Club created successfully' });
    }

    const existing = await Club.findOne({ $or: [{ clubId: cleanClubId }, { slug: cleanSlug }] });
    if (existing) {
      return res.status(400).json({ success: false, message: `A club with identifier '${cleanClubId}' or slug '${cleanSlug}' already exists.` });
    }

    const club = await Club.create({
      clubId: cleanClubId,
      name: String(name).trim(),
      sport: String(sport).trim(),
      slug: cleanSlug,
      logo: logo || '',
      coverImage: coverImage || '',
      description: description || '',
      active: isActive,
      status: clubStatus
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
    const { clubId, name, sport, slug, logo, coverImage, description, active, status } = req.body;
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const club = localClubs.find(c => String(c._id) === String(id) || c.clubId === id || c.slug === id);
      if (!club) return res.status(404).json({ success: false, message: 'Club not found' });
      if (name) club.name = String(name).trim();
      if (sport) club.sport = String(sport).trim();
      if (clubId) club.clubId = String(clubId).toLowerCase().trim();
      if (slug) club.slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (logo !== undefined) club.logo = logo;
      if (coverImage !== undefined) club.coverImage = coverImage;
      if (description !== undefined) club.description = description;
      if (active !== undefined) club.active = !!active;
      if (status !== undefined) club.status = status;
      return res.json({ success: true, club, message: 'Club updated successfully' });
    }

    let club = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      club = await Club.findById(id);
    }
    if (!club) {
      club = await Club.findOne({ $or: [{ clubId: id }, { slug: id }, { _id: id }] });
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
    if (clubId) {
      const cleanClubId = String(clubId).toLowerCase().trim();
      const duplicate = await Club.findOne({ clubId: cleanClubId, _id: { $ne: club._id } });
      if (duplicate) {
        return res.status(400).json({ success: false, message: `ClubId '${cleanClubId}' is already in use by another club.` });
      }
      club.clubId = cleanClubId;
    }

    if (name) club.name = String(name).trim();
    if (sport) club.sport = String(sport).trim();
    if (logo !== undefined) club.logo = logo;
    if (coverImage !== undefined) club.coverImage = coverImage;
    if (description !== undefined) club.description = description;
    if (active !== undefined) club.active = !!active;
    if (status !== undefined) club.status = status;

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
    const cleanId = String(id).toLowerCase().trim();
    if (cleanId === 'spikers' || cleanId === 'aceit-spikers' || cleanId === 'c_spikers') {
      return res.status(400).json({ success: false, message: 'Cannot delete primary club ACEIT Spikers.' });
    }
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      localClubs = localClubs.filter(c => String(c._id) !== String(id) && c.clubId !== cleanId && c.slug !== cleanId);
      return res.json({ success: true, message: 'Club deleted successfully' });
    }

    let club = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      club = await Club.findById(id);
    }
    if (!club) {
      club = await Club.findOne({ $or: [{ clubId: cleanId }, { slug: cleanId }, { _id: id }] });
    }
    if (!club) return res.status(404).json({ success: false, message: 'Club not found' });

    if (club.clubId === 'spikers' || club.slug === 'aceit-spikers' || club.slug === 'spikers') {
      return res.status(400).json({ success: false, message: 'Cannot delete primary club ACEIT Spikers.' });
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
    const { name, username, rtuRollNo, email, mobile, password, role, clubId, clubs, permissions, active, photo, bio, sport, branch, year, position, jerseyNo, height, achievements } = req.body;
    if (!name || !username || !password) {
      return res.status(400).json({ success: false, message: 'Name, Username, and Password are required.' });
    }

    const cleanUsername = String(username).toLowerCase().trim();
    const cleanEmail = email ? String(email).toLowerCase().trim() : '';
    const cleanRollNo = rtuRollNo ? String(rtuRollNo).trim() : '';
    const cleanMobile = mobile ? String(mobile).trim() : '';
    const cleanBranch = branch ? String(branch).trim() : 'Computer Science & Engineering';
    const cleanYear = year ? String(year).trim() : '3rd Year';
    const cleanPosition = position ? String(position).trim() : 'Outside Hitter';
    const cleanJersey = jerseyNo ? String(jerseyNo).trim() : '';
    const cleanHeight = height ? String(height).trim() : '';

    const dbConn = await connectToDatabase();
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(String(password), salt);

    const isOwnerRole = role === 'OWNER';
    const userClubId = isOwnerRole ? 'ALL' : (clubId || 'ALL');
    const userPerms = isOwnerRole ? ['*'] : (Array.isArray(permissions) ? permissions : (role === 'STUDENT' ? ['profile.view', 'profile.edit', 'clubs.join'] : []));

    if (req.user && req.user.role !== 'OWNER') {
      if (isOwnerRole) {
        return res.status(403).json({ success: false, message: 'Only the OWNER can create another OWNER account.' });
      }
      if (req.user.clubId !== 'ALL' && String(userClubId) !== String(req.user.clubId)) {
        return res.status(403).json({ success: false, message: 'Cannot assign a user to a club outside your access scope.' });
      }
    }

    if (!dbConn) {
      const existingLocal = localUsers.find(u => u.username === cleanUsername || (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail));
      if (existingLocal) {
        return res.status(400).json({ success: false, message: `Username or Email is already taken.` });
      }
      const newUser = {
        _id: 'u_' + Date.now(),
        name,
        username: cleanUsername,
        rtuRollNo: cleanRollNo,
        email: cleanEmail,
        mobile: cleanMobile,
        photo: photo || '',
        passwordHash: hash,
        role: role || 'STUDENT',
        clubId: userClubId,
        clubs: Array.isArray(clubs) ? clubs : (userClubId && userClubId !== 'ALL' ? [userClubId] : ['aceit-spikers']),
        bio: bio || '',
        sport: sport || 'Volleyball',
        branch: cleanBranch,
        year: cleanYear,
        position: cleanPosition,
        jerseyNo: cleanJersey,
        height: cleanHeight,
        achievements: Array.isArray(achievements) ? achievements : [],
        permissions: userPerms,
        active: active !== undefined ? active : true,
        createdAt: new Date(),
        lastLoginAt: null
      };
      localUsers.unshift(newUser);
      const userObj = Object.assign({}, newUser);
      delete userObj.passwordHash;
      return res.json({ success: true, user: userObj, message: 'User created successfully' });
    }

    const existing = await User.findOne({
      $or: [
        { username: cleanUsername },
        ...(cleanEmail ? [{ email: cleanEmail }] : [])
      ]
    });
    if (existing) {
      return res.status(400).json({ success: false, message: `Username or Email is already taken.` });
    }

    const newUser = await User.create({
      name,
      username: cleanUsername,
      rtuRollNo: cleanRollNo,
      email: cleanEmail,
      mobile: cleanMobile,
      photo: photo || '',
      passwordHash: hash,
      role: role || 'STUDENT',
      clubId: userClubId,
      clubs: Array.isArray(clubs) ? clubs : (userClubId && userClubId !== 'ALL' ? [userClubId] : ['aceit-spikers']),
      bio: bio || '',
      sport: sport || 'Volleyball',
      branch: cleanBranch,
      year: cleanYear,
      position: cleanPosition,
      jerseyNo: cleanJersey,
      height: cleanHeight,
      achievements: Array.isArray(achievements) ? achievements : [],
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
    const { name, username, rtuRollNo, email, mobile, password, role, clubId, clubs, permissions, active, photo, bio, sport, branch, year, position, jerseyNo, height, achievements } = req.body;
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
      if (rtuRollNo !== undefined) targetUser.rtuRollNo = String(rtuRollNo).trim();
      if (email !== undefined) targetUser.email = String(email).toLowerCase().trim();
      if (mobile !== undefined) targetUser.mobile = String(mobile).trim();
      if (photo !== undefined) targetUser.photo = photo;
      if (bio !== undefined) targetUser.bio = String(bio).trim();
      if (sport !== undefined) targetUser.sport = String(sport).trim();
      if (branch !== undefined) targetUser.branch = String(branch).trim();
      if (year !== undefined) targetUser.year = String(year).trim();
      if (position !== undefined) targetUser.position = String(position).trim();
      if (jerseyNo !== undefined) targetUser.jerseyNo = String(jerseyNo).trim();
      if (height !== undefined) targetUser.height = String(height).trim();
      if (Array.isArray(achievements)) targetUser.achievements = achievements;
      if (Array.isArray(clubs)) targetUser.clubs = clubs;

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
    if (email) {
      const cleanEmail = String(email).toLowerCase().trim();
      const existing = await User.findOne({ email: cleanEmail, _id: { $ne: targetUser._id } });
      if (existing) {
        return res.status(400).json({ success: false, message: `Email '${cleanEmail}' is already in use.` });
      }
      targetUser.email = cleanEmail;
    }
    if (rtuRollNo !== undefined) targetUser.rtuRollNo = String(rtuRollNo).trim();
    if (mobile !== undefined) targetUser.mobile = String(mobile).trim();
    if (photo !== undefined) targetUser.photo = photo;
    if (bio !== undefined) targetUser.bio = String(bio).trim();
    if (sport !== undefined) targetUser.sport = String(sport).trim();
    if (branch !== undefined) targetUser.branch = String(branch).trim();
    if (year !== undefined) targetUser.year = String(year).trim();
    if (position !== undefined) targetUser.position = String(position).trim();
    if (jerseyNo !== undefined) targetUser.jerseyNo = String(jerseyNo).trim();
    if (height !== undefined) targetUser.height = String(height).trim();
    if (Array.isArray(achievements)) targetUser.achievements = achievements;
    if (Array.isArray(clubs)) targetUser.clubs = clubs;

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

/* ============================================================
   TALLY WEBHOOK & JOIN CLUB APPLICATIONS MANAGEMENT
   ============================================================ */

function parseTallyPayload(body) {
  let name = '', email = '', phone = '', position = '', experience = '', message = '';
  let eventId = body?.eventId || body?.eventId || null;
  let responseId = body?.data?.responseId || null;

  const fields = body?.data?.fields || body?.fields || [];
  if (Array.isArray(fields)) {
    fields.forEach(f => {
      const label = String(f.label || f.key || f.type || '').toLowerCase();
      let val = f.value;
      if (Array.isArray(val)) val = val.join(', ');
      else if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
      else val = String(val || '');

      if (!val) return;

      if (label.includes('name')) name = name || val;
      else if (label.includes('email')) email = email || val;
      else if (label.includes('phone') || label.includes('mobile') || label.includes('contact')) phone = phone || val;
      else if (label.includes('position') || label.includes('role')) position = position || val;
      else if (label.includes('experience') || label.includes('exp')) experience = experience || val;
      else if (label.includes('message') || label.includes('know') || label.includes('note')) message = message || val;
    });
  }

  // Fallback to direct body properties or Tally field GUIDs
  name = name || body?.name || body?.data?.name || body?.['3b554c5c-578e-4045-ba2c-73c3ffe892d2'] || '';
  email = email || body?.email || body?.data?.email || body?.['b8a3a47f-71de-4c17-9905-e9fd4b4174a0'] || '';
  phone = phone || body?.phone || body?.data?.phone || body?.['4c092297-7954-4940-8965-9e85c84d5cdd'] || '';
  position = position || body?.position || body?.data?.position || body?.['cc5dd8f8-5bdd-4e42-bfe3-8b71f2b5caa0'] || '';
  experience = experience || body?.experience || body?.data?.experience || body?.['547086c9-1007-46fa-a1eb-2aad1c897cc3'] || '';
  message = message || body?.message || body?.data?.message || body?.['ecf78403-245e-4832-b8b9-7231b7561d94'] || '';

  return { name, email, phone, position, experience, message, eventId, responseId };
}

async function createApplication(appData) {
  const dbConn = await connectToDatabase();
  const newApp = {
    name: appData.name || 'Anonymous Applicant',
    email: appData.email || 'No email provided',
    phone: appData.phone || '',
    position: appData.position || '',
    experience: appData.experience || '',
    message: appData.message || '',
    status: appData.status || 'Pending',
    source: appData.source || 'Tally Webhook',
    tallyEventId: appData.eventId || null,
    tallyResponseId: appData.responseId || null
  };

  if (dbConn) {
    if (appData.eventId) {
      const existing = await ApplicationDoc.findOne({ tallyEventId: appData.eventId });
      if (existing) return existing;
    }
    const doc = await ApplicationDoc.create(newApp);

    // Sync to ClubDoc database applications list for backup
    const dbRes = await getDB();
    if (dbRes.success) {
      const dbData = dbRes.data;
      if (!Array.isArray(dbData.applications)) dbData.applications = [];
      dbData.applications.unshift({
        id: doc._id.toString(),
        name: doc.name,
        email: doc.email,
        phone: doc.phone,
        position: doc.position,
        experience: doc.experience,
        message: doc.message,
        status: doc.status,
        date: doc.createdAt.toISOString()
      });
      await saveDB(dbData);
    }
    return doc;
  } else {
    // Standalone dev mode fallback
    const dbRes = await getDB();
    const dbData = dbRes.data;
    if (!Array.isArray(dbData.applications)) dbData.applications = [];
    const localDoc = {
      _id: 'app_' + Date.now() + Math.random().toString(36).substring(2, 6),
      ...newApp,
      createdAt: new Date(),
      date: new Date().toISOString()
    };
    dbData.applications.unshift(localDoc);
    await saveDB(dbData);
    return localDoc;
  }
}

// Secure Tally Webhook receiver endpoints
const handleTallyWebhook = async (req, res) => {
  try {
    const parsed = parseTallyPayload(req.body);
    const doc = await createApplication({ ...parsed, source: 'Tally Webhook' });
    console.log('[Tally Webhook] Successfully processed submission from:', parsed.email || parsed.name);
    res.json({ success: true, message: 'Tally submission processed successfully', application: doc });
  } catch (err) {
    console.error('[Tally Webhook Error]:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

app.post('/api/webhooks/tally', handleTallyWebhook);
app.post('/api/tally-webhook', handleTallyWebhook);

// Applications: Submit Endpoint (Website Form)
app.post('/api/applications', async (req, res) => {
  try {
    const { name, email, phone, position, experience, message } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required.' });
    }
    const doc = await createApplication({
      name, email, phone, position, experience, message,
      source: 'Website Form'
    });
    res.json({ success: true, application: doc, message: 'Application submitted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Applications: GET Student's own applications
app.get('/api/profile/applications', authenticateUser, requireAuth, async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    const username = req.user.username;
    const email = req.user.email ? req.user.email.toLowerCase() : '';
    const dbConn = await connectToDatabase();

    if (dbConn) {
      const orConditions = [{ userId: userId }];
      if (username) orConditions.push({ username: username });
      if (email) orConditions.push({ email: email });

      const apps = await ApplicationDoc.find({ $or: orConditions }).sort({ createdAt: -1 });
      return res.json({ success: true, applications: apps });
    }

    const dbRes = await getDB();
    const allApps = (dbRes && dbRes.data && Array.isArray(dbRes.data.applications)) ? dbRes.data.applications : [];
    const apps = allApps.filter(a =>
      String(a.userId) === userId ||
      (a.username && a.username === username) ||
      (a.email && email && a.email.toLowerCase() === email)
    );
    res.json({ success: true, applications: apps });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Applications: POST Submit Club Application (Authenticated Student)
app.post('/api/profile/applications', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { clubSlug, position, experience, message } = req.body;
    const cleanClubSlug = String(clubSlug || 'aceit-spikers').toLowerCase().trim();
    const userId = String(req.user._id || req.user.id);
    const username = req.user.username;
    const name = req.user.name || username;
    const email = req.user.email || '';
    const phone = req.user.mobile || '';

    const doc = await createApplication({
      userId,
      username,
      clubSlug: cleanClubSlug,
      name,
      email,
      phone,
      position: position || 'Player',
      experience: experience || 'Beginner',
      message: message || '',
      status: 'Pending',
      source: 'Student Portal'
    });

    res.json({ success: true, application: doc, message: 'Application submitted successfully! Your club coordinator will review it shortly.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Applications: GET List (OWNER / ADMIN / COORDINATOR)
app.get('/api/applications', authenticateUser, requireAuth, async (req, res) => {
  try {
    const dbConn = await connectToDatabase();
    if (dbConn) {
      const apps = await ApplicationDoc.find({}).sort({ createdAt: -1 });
      res.json({ success: true, applications: apps });
    } else {
      const dbRes = await getDB();
      const apps = dbRes.data.applications || [];
      res.json({ success: true, applications: apps });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Applications: PUT Update Status & Auto-Membership on Acceptance
app.put('/api/applications/:id/status', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminFeedback } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'Status is required' });

    const dbConn = await connectToDatabase();
    if (dbConn) {
      let doc = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        doc = await ApplicationDoc.findByIdAndUpdate(id, { status, adminFeedback: adminFeedback || '' }, { new: true });
      }
      if (!doc) {
        doc = await ApplicationDoc.findOneAndUpdate({ _id: id }, { status, adminFeedback: adminFeedback || '' }, { new: true });
      }

      // Also update ClubDoc fallback applications array if present
      const dbRes = await getDB();
      if (dbRes.success && Array.isArray(dbRes.data.applications)) {
        const item = dbRes.data.applications.find(a => String(a.id || a._id) === String(id));
        if (item) {
          item.status = status;
          if (adminFeedback !== undefined) item.adminFeedback = adminFeedback;
          await saveDB(dbRes.data);
        }
      }

      // If status is Accepted, auto-add the club to applicant's clubs list!
      if (status === 'Accepted' && doc && doc.clubSlug) {
        let applicantUser = null;
        if (doc.userId && mongoose.Types.ObjectId.isValid(doc.userId)) {
          applicantUser = await User.findById(doc.userId);
        }
        if (!applicantUser && doc.username) {
          applicantUser = await User.findOne({ username: doc.username.toLowerCase() });
        }
        if (!applicantUser && doc.email) {
          applicantUser = await User.findOne({ email: doc.email.toLowerCase() });
        }
        if (applicantUser) {
          applicantUser.clubs = applicantUser.clubs || [];
          if (!applicantUser.clubs.includes(doc.clubSlug)) {
            applicantUser.clubs.push(doc.clubSlug);
            await applicantUser.save();
          }
        }
      }

      // Trigger automatic in-app notification to applicant
      const recipientName = doc.username || (applicantUser ? applicantUser.username : null);
      if (recipientName) {
        const notifTitle = status === 'Accepted' ? '🎉 Tryout Application Accepted!' : `Application Update: ${status}`;
        const notifMsg = `Your application for ${doc.clubSlug || 'ACEIT Sports'} has been marked as ${status}.${adminFeedback ? ' Note: ' + adminFeedback : ''}`;
        await createNotification(recipientName, notifTitle, notifMsg, 'application');
      }

      return res.json({ success: true, application: doc, message: 'Status updated successfully' });
    } else {
      const dbRes = await getDB();
      const dbData = dbRes.data;
      if (!Array.isArray(dbData.applications)) dbData.applications = [];
      const item = dbData.applications.find(a => String(a.id || a._id) === String(id));
      if (!item) return res.status(404).json({ success: false, message: 'Application not found' });
      item.status = status;
      if (adminFeedback !== undefined) item.adminFeedback = adminFeedback;
      await saveDB(dbData);

      const u = localUsers.find(user =>
        (item.userId && String(user._id) === String(item.userId)) ||
        (item.username && user.username === item.username) ||
        (item.email && user.email && user.email.toLowerCase() === item.email.toLowerCase())
      );

      if (status === 'Accepted' && item.clubSlug && u) {
        u.clubs = u.clubs || [];
        if (!u.clubs.includes(item.clubSlug)) u.clubs.push(item.clubSlug);
      }

      // Trigger automatic in-app notification to applicant
      const recipientName = item.username || (u ? u.username : null);
      if (recipientName) {
        const notifTitle = status === 'Accepted' ? '🎉 Tryout Application Accepted!' : `Application Update: ${status}`;
        const notifMsg = `Your application for ${item.clubSlug || 'ACEIT Sports'} has been marked as ${status}.${adminFeedback ? ' Note: ' + adminFeedback : ''}`;
        await createNotification(recipientName, notifTitle, notifMsg, 'application');
      }

      return res.json({ success: true, application: item, message: 'Status updated successfully' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Applications: DELETE
app.delete('/api/applications/:id', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const dbConn = await connectToDatabase();

    if (dbConn) {
      if (mongoose.Types.ObjectId.isValid(id)) {
        await ApplicationDoc.findByIdAndDelete(id);
      } else {
        await ApplicationDoc.deleteOne({ _id: id });
      }

      const dbRes = await getDB();
      if (dbRes.success && Array.isArray(dbRes.data.applications)) {
        dbRes.data.applications = dbRes.data.applications.filter(a => String(a.id || a._id) !== String(id));
        await saveDB(dbRes.data);
      }
      return res.json({ success: true, message: 'Application deleted successfully' });
    } else {
      const dbRes = await getDB();
      const dbData = dbRes.data;
      if (Array.isArray(dbData.applications)) {
        dbData.applications = dbData.applications.filter(a => String(a.id || a._id) !== String(id));
        await saveDB(dbData);
      }
      return res.json({ success: true, message: 'Application deleted successfully' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// EVENTS API ENDPOINTS
// ==========================================

// GET /api/events (supports ?clubId=)
app.get('/api/events', async (req, res) => {
  const result = await getDB();
  if (!result.success) {
    return res.status(500).json({ success: false, message: `MongoDB Error: ${result.error}` });
  }
  let events = result.data.events || [];
  if (req.query.clubId) {
    events = filterByClub(events, req.query.clubId);
  }
  res.json({ success: true, events });
});

// POST /api/events (Create event)
app.post('/api/events', authenticateUser, requireAuth, async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const events = dbData.events || [];

    const newEvt = {
      id: req.body.id || generateId(),
      clubId: req.body.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers'),
      title: req.body.title || 'Untitled Event',
      description: req.body.description || '',
      date: req.body.date || '',
      time: req.body.time || '',
      venue: req.body.venue || '',
      poster: req.body.poster || '',
      regBtnText: req.body.regBtnText || 'Register Now',
      regUrl: req.body.regUrl || '',
      regEnabled: req.body.regEnabled !== false,
      createdAt: new Date().toISOString()
    };

    events.unshift(newEvt);
    dbData.events = events;
    await saveDB(dbData);
    res.json({ success: true, event: newEvt, message: 'Event created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/events/:id (Update event)
app.put('/api/events/:id', authenticateUser, requireAuth, async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const events = dbData.events || [];
    const idx = events.findIndex(e => String(e.id || e._id) === String(req.params.id));
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    events[idx] = {
      ...events[idx],
      ...req.body,
      id: events[idx].id || req.params.id,
      clubId: req.body.clubId || events[idx].clubId || 'spikers',
      updatedAt: new Date().toISOString()
    };
    dbData.events = events;
    await saveDB(dbData);
    res.json({ success: true, event: events[idx], message: 'Event updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/events/:id (Delete event)
app.delete('/api/events/:id', authenticateUser, requireAuth, async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const events = dbData.events || [];
    const filtered = events.filter(e => String(e.id || e._id) !== String(req.params.id));
    if (filtered.length === events.length) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    dbData.events = filtered;
    await saveDB(dbData);
    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/training (supports ?clubId=)
app.get('/api/training', async (req, res) => {
  const result = await getDB();
  if (!result.success) {
    return res.status(500).json({ success: false, message: `MongoDB Error: ${result.error}` });
  }
  let training = result.data.training || [];
  if (req.query.clubId) {
    training = filterByClub(training, req.query.clubId);
  }
  res.json({ success: true, training });
});

// POST /api/training (Create training session)
app.post('/api/training', authenticateUser, requireAuth, requirePermission('training.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const training = dbData.training || [];

    const newTr = {
      id: req.body.id || generateId(),
      clubId: req.body.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers'),
      icon: req.body.icon || '🏐',
      title: req.body.title || 'Training Session',
      time: req.body.time || '',
      desc: req.body.desc || '',
      createdAt: new Date().toISOString()
    };

    training.push(newTr);
    dbData.training = training;
    await saveDB(dbData);
    res.json({ success: true, training: newTr, message: 'Training session created successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/training/:id (Update training session)
app.put('/api/training/:id', authenticateUser, requireAuth, requirePermission('training.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const training = dbData.training || [];
    const idx = training.findIndex(t => String(t.id || t._id) === String(req.params.id));
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Training session not found' });
    }

    training[idx] = {
      ...training[idx],
      ...req.body,
      id: training[idx].id || req.params.id,
      clubId: req.body.clubId || training[idx].clubId || 'spikers',
      updatedAt: new Date().toISOString()
    };
    dbData.training = training;
    await saveDB(dbData);
    res.json({ success: true, training: training[idx], message: 'Training session updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/training/:id (Delete training session)
app.delete('/api/training/:id', authenticateUser, requireAuth, requirePermission('training.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const training = dbData.training || [];
    const filtered = training.filter(t => String(t.id || t._id) !== String(req.params.id));
    if (filtered.length === training.length) {
      return res.status(404).json({ success: false, message: 'Training session not found' });
    }
    dbData.training = filtered;
    await saveDB(dbData);
    res.json({ success: true, message: 'Training session deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// PHASE 3: EVENT RSVPs & REGISTRATIONS
// ==========================================

// GET /api/events/rsvp-counts: Map of eventId -> attendee count
app.get('/api/events/rsvp-counts', async (req, res) => {
  try {
    const dbConn = await connectToDatabase();
    if (dbConn) {
      const rsvps = await EventRsvp.find({ status: { $ne: 'Cancelled' } });
      const counts = {};
      rsvps.forEach(r => {
        counts[r.eventId] = (counts[r.eventId] || 0) + 1;
      });
      return res.json({ success: true, counts });
    }
    const counts = {};
    localEventRsvps.filter(r => r.status !== 'Cancelled').forEach(r => {
      counts[r.eventId] = (counts[r.eventId] || 0) + 1;
    });
    res.json({ success: true, counts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/events/:eventId/rsvp: Authenticated student RSVPs to an event
app.post('/api/events/:eventId/rsvp', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { eventTitle, teamName } = req.body;
    const userId = String(req.user._id || req.user.id);
    const username = req.user.username;
    const name = req.user.name || username;
    const email = req.user.email || '';
    const rollNo = req.user.rtuRollNo || '';

    const dbConn = await connectToDatabase();
    if (dbConn) {
      let rsvp = await EventRsvp.findOne({ eventId, $or: [{ userId }, { username }] });
      if (rsvp) {
        rsvp.status = 'Registered';
        if (eventTitle) rsvp.eventTitle = eventTitle;
        if (teamName) rsvp.teamName = teamName;
        await rsvp.save();
      } else {
        rsvp = await EventRsvp.create({
          eventId,
          eventTitle: eventTitle || '',
          userId,
          username,
          name,
          email,
          rollNo,
          teamName: teamName || '',
          status: 'Registered'
        });
      }
      return res.json({ success: true, rsvp, message: 'Successfully registered for this event!' });
    }

    let rsvp = localEventRsvps.find(r => r.eventId === eventId && (r.userId === userId || r.username === username));
    if (rsvp) {
      rsvp.status = 'Registered';
      if (eventTitle) rsvp.eventTitle = eventTitle;
      if (teamName) rsvp.teamName = teamName;
    } else {
      rsvp = {
        _id: 'rsvp_' + Date.now(),
        eventId,
        eventTitle: eventTitle || '',
        userId,
        username,
        name,
        email,
        rollNo,
        teamName: teamName || '',
        status: 'Registered',
        createdAt: new Date()
      };
      localEventRsvps.push(rsvp);
    }
    res.json({ success: true, rsvp, message: 'Successfully registered for this event!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/events/:eventId/rsvp: Cancel RSVP
app.delete('/api/events/:eventId/rsvp', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const userId = String(req.user._id || req.user.id);
    const username = req.user.username;

    const dbConn = await connectToDatabase();
    if (dbConn) {
      await EventRsvp.findOneAndUpdate(
        { eventId, $or: [{ userId }, { username }] },
        { status: 'Cancelled' }
      );
      return res.json({ success: true, message: 'Registration cancelled.' });
    }

    const item = localEventRsvps.find(r => r.eventId === eventId && (r.userId === userId || r.username === username));
    if (item) item.status = 'Cancelled';
    res.json({ success: true, message: 'Registration cancelled.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/profile/rsvps: Authenticated student views all their event RSVPs
app.get('/api/profile/rsvps', authenticateUser, requireAuth, async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    const username = req.user.username;

    const dbConn = await connectToDatabase();
    if (dbConn) {
      const rsvps = await EventRsvp.find({
        $or: [{ userId }, { username }],
        status: { $ne: 'Cancelled' }
      }).sort({ createdAt: -1 });
      return res.json({ success: true, rsvps });
    }

    const rsvps = localEventRsvps.filter(r => (r.userId === userId || r.username === username) && r.status !== 'Cancelled');
    res.json({ success: true, rsvps });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/events/:eventId/attendees: Admin / Coordinator views attendees
app.get('/api/events/:eventId/attendees', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { eventId } = req.params;
    const dbConn = await connectToDatabase();
    if (dbConn) {
      const attendees = await EventRsvp.find({ eventId, status: { $ne: 'Cancelled' } }).sort({ createdAt: 1 });
      return res.json({ success: true, attendees });
    }
    const attendees = localEventRsvps.filter(r => r.eventId === eventId && r.status !== 'Cancelled');
    res.json({ success: true, attendees });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// PHASE 3: MATCH SQUAD LINEUP & AVAILABILITY TRACKER
// ==========================================

// POST /api/matches/:matchId/availability: Student marks match availability
app.post('/api/matches/:matchId/availability', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { matchId } = req.params;
    const { availability, note } = req.body;
    const cleanAvail = ['Available', 'Tentative', 'Unavailable'].includes(availability) ? availability : 'Available';
    const userId = String(req.user._id || req.user.id);
    const username = req.user.username;
    const name = req.user.name || username;

    const dbConn = await connectToDatabase();
    if (dbConn) {
      let rec = await MatchAvailability.findOne({ matchId, $or: [{ userId }, { username }] });
      if (rec) {
        rec.availability = cleanAvail;
        rec.note = note || '';
        await rec.save();
      } else {
        rec = await MatchAvailability.create({
          matchId,
          userId,
          username,
          name,
          availability: cleanAvail,
          note: note || '',
          isStartingLineup: false
        });
      }
      return res.json({ success: true, availability: rec, message: 'Match availability updated!' });
    }

    let rec = localMatchAvailability.find(m => m.matchId === matchId && (m.userId === userId || m.username === username));
    if (rec) {
      rec.availability = cleanAvail;
      rec.note = note || '';
    } else {
      rec = {
        _id: 'ma_' + Date.now(),
        matchId,
        userId,
        username,
        name,
        availability: cleanAvail,
        note: note || '',
        isStartingLineup: false,
        createdAt: new Date()
      };
      localMatchAvailability.push(rec);
    }
    res.json({ success: true, availability: rec, message: 'Match availability updated!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/profile/match-availability: Student gets their match availability records
app.get('/api/profile/match-availability', authenticateUser, requireAuth, async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    const username = req.user.username;

    const dbConn = await connectToDatabase();
    if (dbConn) {
      const records = await MatchAvailability.find({ $or: [{ userId }, { username }] });
      return res.json({ success: true, records });
    }
    const records = localMatchAvailability.filter(m => m.userId === userId || m.username === username);
    res.json({ success: true, records });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/matches/:matchId/lineup: View lineup & player availability for a match
app.get('/api/matches/:matchId/lineup', async (req, res) => {
  try {
    const { matchId } = req.params;
    const dbConn = await connectToDatabase();
    if (dbConn) {
      const responses = await MatchAvailability.find({ matchId });
      const starters = responses.filter(r => r.isStartingLineup);
      const available = responses.filter(r => r.availability === 'Available');
      return res.json({ success: true, responses, starters, available });
    }
    const responses = localMatchAvailability.filter(m => m.matchId === matchId);
    const starters = responses.filter(r => r.isStartingLineup);
    const available = responses.filter(r => r.availability === 'Available');
    res.json({ success: true, responses, starters, available });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/matches/:matchId/lineup: Captain / Coordinator / Admin sets Starting 6
app.put('/api/matches/:matchId/lineup', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { matchId } = req.params;
    const { starters } = req.body; // Array of { userId, username, name, position }
    if (!Array.isArray(starters)) {
      return res.status(400).json({ success: false, message: 'Starters array is required' });
    }

    const dbConn = await connectToDatabase();
    if (dbConn) {
      // Reset all starters for this match
      await MatchAvailability.updateMany({ matchId }, { isStartingLineup: false, position: '' });

      for (const st of starters) {
        const query = { matchId };
        if (st.userId) query.userId = st.userId;
        else if (st.username) query.username = st.username.toLowerCase();

        await MatchAvailability.findOneAndUpdate(
          query,
          { isStartingLineup: true, position: st.position || 'Starter', name: st.name },
          { upsert: true, new: true }
        );

        if (st.username) {
          await createNotification(
            st.username,
            '⭐ Selected in Starting 6 Lineup!',
            `You have been named in the Starting 6 lineup as ${st.position || 'Starter'} for upcoming Match #${matchId}!`,
            'selection'
          );
        }
      }
      return res.json({ success: true, message: 'Starting lineup updated successfully!' });
    }

    localMatchAvailability.forEach(m => {
      if (m.matchId === matchId) {
        m.isStartingLineup = false;
        m.position = '';
      }
    });

    for (const st of starters) {
      let item = localMatchAvailability.find(m => m.matchId === matchId && (m.userId === st.userId || m.username === st.username));
      if (item) {
        item.isStartingLineup = true;
        item.position = st.position || 'Starter';
      } else {
        localMatchAvailability.push({
          _id: 'ma_' + Date.now() + Math.random().toString(36).slice(2, 5),
          matchId,
          userId: st.userId || null,
          username: st.username || null,
          name: st.name || 'Player',
          availability: 'Available',
          note: '',
          isStartingLineup: true,
          position: st.position || 'Starter'
        });
      }

      if (st.username) {
        await createNotification(
          st.username,
          '⭐ Selected in Starting 6 Lineup!',
          `You have been named in the Starting 6 lineup as ${st.position || 'Starter'} for upcoming Match #${matchId}!`,
          'selection'
        );
      }
    }

    res.json({ success: true, message: 'Starting lineup updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// PHASE 3: PLAYER STATS, MVP LEADERBOARDS & PERFORMANCE BADGES
// ==========================================

// Helper: Calculate MVP Points
function calculateMvpPoints(stats) {
  const s = stats || {};
  const mvp = Number(s.mvpAwards || 0);
  const pts = Number(s.points || 0);
  const spk = Number(s.spikes || 0);
  const blk = Number(s.blocks || 0);
  const ace = Number(s.aces || 0);
  return (mvp * 15) + (pts * 1) + (spk * 2) + (blk * 3) + (ace * 2);
}

// GET /api/leaderboard: Public College Athlete Leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const dbConn = await connectToDatabase();
    let athletes = [];

    if (dbConn) {
      athletes = await User.find({ active: true })
        .select('name username photo sport clubs stats badges role')
        .lean();
    } else {
      athletes = localUsers.filter(u => u.active !== false).map(u => ({
        name: u.name,
        username: u.username,
        photo: u.photo || '',
        sport: u.sport || 'Athlete',
        clubs: u.clubs || ['aceit-spikers'],
        stats: u.stats || { matchesPlayed: 0, points: 0, spikes: 0, blocks: 0, aces: 0, mvpAwards: 0, mvpPoints: 0 },
        badges: u.badges || [],
        role: u.role
      }));
    }

    // Enrich with dynamic role styling and computed MVP points
    const enriched = await Promise.all(athletes.map(async (a) => {
      const rMeta = await getRoleMetadata(a.role);
      const st = a.stats || { matchesPlayed: 0, points: 0, spikes: 0, blocks: 0, aces: 0, mvpAwards: 0 };
      st.mvpPoints = calculateMvpPoints(st);
      return {
        name: a.name,
        username: a.username,
        photo: a.photo || '',
        sport: a.sport || 'Athlete',
        clubs: a.clubs || ['aceit-spikers'],
        stats: st,
        badges: a.badges || [],
        role: a.role,
        roleTitle: rMeta.roleTitle,
        badgeBg: rMeta.badgeBg,
        badgeText: rMeta.badgeText,
        badgeGlow: rMeta.badgeGlow
      };
    }));

    // Sort by MVP Points descending
    enriched.sort((a, b) => (b.stats.mvpPoints || 0) - (a.stats.mvpPoints || 0));

    res.json({
      success: true,
      leaderboard: enriched,
      badgeDefs: DEFAULT_PERF_BADGES
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/users/:username/stats: Public player stats & badges
app.get('/api/users/:username/stats', async (req, res) => {
  try {
    const uname = String(req.params.username || '').toLowerCase().trim();
    const dbConn = await connectToDatabase();
    let user = null;

    if (dbConn) {
      user = await User.findOne({ username: uname });
    } else {
      user = localUsers.find(u => u.username === uname);
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'Athlete not found' });
    }

    const st = user.stats || { matchesPlayed: 0, points: 0, spikes: 0, blocks: 0, aces: 0, mvpAwards: 0 };
    st.mvpPoints = calculateMvpPoints(st);

    res.json({
      success: true,
      username: user.username,
      name: user.name,
      sport: user.sport,
      stats: st,
      badges: user.badges || [],
      badgeDefs: DEFAULT_PERF_BADGES
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/users/:username/stats: Admin/Coordinator/Captain updates player stats & awards performance badges
app.put('/api/users/:username/stats', authenticateUser, requireAuth, async (req, res) => {
  try {
    const uname = String(req.params.username || '').toLowerCase().trim();
    const { stats, badges, badgeToAdd, badgeToRemove } = req.body;

    const dbConn = await connectToDatabase();
    let user = null;

    if (dbConn) {
      user = await User.findOne({ username: uname });
      if (!user) return res.status(404).json({ success: false, message: 'Athlete not found' });

      if (stats) {
        user.stats = {
          matchesPlayed: Number(stats.matchesPlayed !== undefined ? stats.matchesPlayed : (user.stats?.matchesPlayed || 0)),
          points: Number(stats.points !== undefined ? stats.points : (user.stats?.points || 0)),
          spikes: Number(stats.spikes !== undefined ? stats.spikes : (user.stats?.spikes || 0)),
          blocks: Number(stats.blocks !== undefined ? stats.blocks : (user.stats?.blocks || 0)),
          aces: Number(stats.aces !== undefined ? stats.aces : (user.stats?.aces || 0)),
          mvpAwards: Number(stats.mvpAwards !== undefined ? stats.mvpAwards : (user.stats?.mvpAwards || 0))
        };
        user.stats.mvpPoints = calculateMvpPoints(user.stats);
      }

      if (Array.isArray(badges)) {
        user.badges = badges;
      } else {
        user.badges = user.badges || [];
        if (badgeToAdd) {
          const bDef = DEFAULT_PERF_BADGES.find(b => b.badgeKey === badgeToAdd) || {
            badgeKey: badgeToAdd,
            title: badgeToAdd,
            icon: '⭐',
            glow: 'rgba(241, 196, 15, 0.85)',
            bg: '#F1C40F',
            text: '#000000',
            description: 'Special achievement badge'
          };
          if (!user.badges.some(b => b.badgeKey === badgeToAdd)) {
            user.badges.push({ ...bDef, awardedAt: new Date() });
            await createNotification(
              uname,
              '🎖️ Performance Badge Awarded!',
              `Congratulations! You have been awarded the "${bDef.title}" performance badge (${bDef.icon}) for outstanding collegiate play!`,
              'badge'
            );
          }
        }

        if (badgeToRemove) {
          user.badges = user.badges.filter(b => b.badgeKey !== badgeToRemove);
        }
      }

      await user.save();
      return res.json({ success: true, stats: user.stats, badges: user.badges, message: 'Player stats and badges updated successfully!' });
    }

    user = localUsers.find(u => u.username === uname);
    if (!user) return res.status(404).json({ success: false, message: 'Athlete not found' });

    if (stats) {
      user.stats = {
        matchesPlayed: Number(stats.matchesPlayed !== undefined ? stats.matchesPlayed : (user.stats?.matchesPlayed || 0)),
        points: Number(stats.points !== undefined ? stats.points : (user.stats?.points || 0)),
        spikes: Number(stats.spikes !== undefined ? stats.spikes : (user.stats?.spikes || 0)),
        blocks: Number(stats.blocks !== undefined ? stats.blocks : (user.stats?.blocks || 0)),
        aces: Number(stats.aces !== undefined ? stats.aces : (user.stats?.aces || 0)),
        mvpAwards: Number(stats.mvpAwards !== undefined ? stats.mvpAwards : (user.stats?.mvpAwards || 0))
      };
      user.stats.mvpPoints = calculateMvpPoints(user.stats);
    }

    if (Array.isArray(badges)) {
      user.badges = badges;
    } else {
      user.badges = user.badges || [];
      if (badgeToAdd) {
        const bDef = DEFAULT_PERF_BADGES.find(b => b.badgeKey === badgeToAdd) || {
          badgeKey: badgeToAdd,
          title: badgeToAdd,
          icon: '⭐',
          glow: 'rgba(241, 196, 15, 0.85)',
          bg: '#F1C40F',
          text: '#000000',
          description: 'Special achievement badge'
        };
        if (!user.badges.some(b => b.badgeKey === badgeToAdd)) {
          user.badges.push({ ...bDef, awardedAt: new Date() });
          await createNotification(
            uname,
            '🎖️ Performance Badge Awarded!',
            `Congratulations! You have been awarded the "${bDef.title}" performance badge (${bDef.icon}) for outstanding collegiate play!`,
            'badge'
          );
        }
      }

      if (badgeToRemove) {
        user.badges = user.badges.filter(b => b.badgeKey !== badgeToRemove);
      }
    }

    res.json({ success: true, stats: user.stats, badges: user.badges, message: 'Player stats and badges updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/profile/stats: Authenticated student views their stats
app.get('/api/profile/stats', authenticateUser, requireAuth, async (req, res) => {
  try {
    const userId = String(req.user._id || req.user.id);
    const dbConn = await connectToDatabase();
    let user = null;

    if (dbConn) {
      user = await User.findById(userId);
    } else {
      user = localUsers.find(u => String(u._id) === userId);
    }

    const st = (user && user.stats) ? user.stats : { matchesPlayed: 0, points: 0, spikes: 0, blocks: 0, aces: 0, mvpAwards: 0 };
    st.mvpPoints = calculateMvpPoints(st);

    res.json({
      success: true,
      stats: st,
      badges: (user && user.badges) ? user.badges : [],
      badgeDefs: DEFAULT_PERF_BADGES
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// PHASE 4: NOTIFICATIONS & REAL-TIME ALERTS API
// ==========================================

// GET /api/notifications: Retrieve logged-in student's notifications
app.get('/api/notifications', authenticateUser, requireAuth, async (req, res) => {
  try {
    const uname = String(req.user.username || '').toLowerCase().trim();
    const dbConn = await connectToDatabase();
    let notifications = [];

    if (dbConn) {
      notifications = await Notification.find({ recipientUsername: uname }).sort({ createdAt: -1 }).limit(50);
    } else {
      notifications = localNotifications.filter(n => n.recipientUsername === uname).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
    }

    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/notifications/:id/read: Mark single notification as read
app.put('/api/notifications/:id/read', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const uname = String(req.user.username || '').toLowerCase().trim();
    const dbConn = await connectToDatabase();

    if (dbConn) {
      if (mongoose.Types.ObjectId.isValid(id)) {
        await Notification.findOneAndUpdate({ _id: id, recipientUsername: uname }, { read: true });
      }
    } else {
      const n = localNotifications.find(n => String(n._id) === String(id) && n.recipientUsername === uname);
      if (n) n.read = true;
    }

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/notifications/read-all: Mark all notifications as read for current user
app.put('/api/notifications/read-all', authenticateUser, requireAuth, async (req, res) => {
  try {
    const uname = String(req.user.username || '').toLowerCase().trim();
    const dbConn = await connectToDatabase();

    if (dbConn) {
      await Notification.updateMany({ recipientUsername: uname, read: false }, { read: true });
    } else {
      localNotifications.forEach(n => {
        if (n.recipientUsername === uname) n.read = true;
      });
    }

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/notifications/:id: Delete single notification
app.delete('/api/notifications/:id', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const uname = String(req.user.username || '').toLowerCase().trim();
    const dbConn = await connectToDatabase();

    if (dbConn) {
      if (mongoose.Types.ObjectId.isValid(id)) {
        await Notification.findOneAndDelete({ _id: id, recipientUsername: uname });
      }
    } else {
      localNotifications = localNotifications.filter(n => !(String(n._id) === String(id) && n.recipientUsername === uname));
    }

    res.json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/notifications/broadcast: Admin/Coordinator sends broadcast notification
app.post('/api/notifications/broadcast', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { title, message, clubSlug, type, linkUrl } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required' });
    }

    const dbConn = await connectToDatabase();
    let targetUsers = [];

    if (dbConn) {
      const query = { active: true };
      if (clubSlug && clubSlug !== 'all') {
        query.clubs = clubSlug;
      }
      targetUsers = await User.find(query).select('username');
    } else {
      targetUsers = localUsers.filter(u => u.active !== false && (!clubSlug || clubSlug === 'all' || (u.clubs && u.clubs.includes(clubSlug))));
    }

    const created = [];
    for (const u of targetUsers) {
      if (u.username) {
        const notif = await createNotification(u.username, title, message, type || 'broadcast', linkUrl || '');
        if (notif) created.push(notif);
      }
    }

    res.json({ success: true, count: created.length, message: `Broadcast sent to ${created.length} students` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// PHASE 4: CLUB ANNOUNCEMENTS & NOTICE BOARD API
// ==========================================

// GET /api/announcements: Public announcement list (sorted: pinned first, then newest)
app.get('/api/announcements', async (req, res) => {
  try {
    const { clubId, category } = req.query;
    const dbConn = await connectToDatabase();
    let announcements = [];

    if (dbConn) {
      const query = {};
      if (clubId && clubId !== 'all') {
        query.$or = [{ clubId: 'all' }, { clubId: clubId }];
      }
      if (category && category !== 'all') {
        query.category = category;
      }
      announcements = await Announcement.find(query).sort({ isPinned: -1, createdAt: -1 });
    } else {
      announcements = localAnnouncements.filter(a => {
        const matchClub = !clubId || clubId === 'all' || a.clubId === 'all' || a.clubId === clubId;
        const matchCat = !category || category === 'all' || a.category === category;
        return matchClub && matchCat;
      }).sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }

    res.json({ success: true, announcements });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/announcements: Create new club announcement
app.post('/api/announcements', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { title, content, clubId, category, isPinned, sendBroadcast } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }

    const authorName = req.user.name || req.user.username;
    const authorRole = req.user.role || 'COORDINATOR';
    const authorUsername = req.user.username;

    const dbConn = await connectToDatabase();
    let newAnn = null;

    if (dbConn) {
      newAnn = await Announcement.create({
        title,
        content,
        clubId: clubId || 'all',
        category: category || 'General',
        isPinned: Boolean(isPinned),
        authorName,
        authorRole,
        authorUsername
      });
    } else {
      newAnn = {
        _id: 'ann_' + Date.now(),
        title,
        content,
        clubId: clubId || 'all',
        category: category || 'General',
        isPinned: Boolean(isPinned),
        authorName,
        authorRole,
        authorUsername,
        createdAt: new Date()
      };
      localAnnouncements.unshift(newAnn);
    }

    // If requested, send automated in-app notification broadcast
    if (sendBroadcast) {
      const notifTitle = (isPinned ? '📌 ' : '📢 ') + title;
      const notifMsg = content.length > 120 ? content.substring(0, 117) + '...' : content;
      let targetUsers = [];
      if (dbConn) {
        targetUsers = await User.find({ active: true }).select('username');
      } else {
        targetUsers = localUsers.filter(u => u.active !== false);
      }
      for (const u of targetUsers) {
        if (u.username) {
          await createNotification(u.username, notifTitle, notifMsg, 'broadcast');
        }
      }
    }

    res.json({ success: true, announcement: newAnn, message: 'Announcement published successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/announcements/:id: Update an announcement
app.put('/api/announcements/:id', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, clubId, category, isPinned } = req.body;
    const dbConn = await connectToDatabase();

    if (dbConn) {
      const ann = await Announcement.findById(id);
      if (!ann) return res.status(404).json({ success: false, message: 'Announcement not found' });
      if (title !== undefined) ann.title = title;
      if (content !== undefined) ann.content = content;
      if (clubId !== undefined) ann.clubId = clubId;
      if (category !== undefined) ann.category = category;
      if (isPinned !== undefined) ann.isPinned = Boolean(isPinned);
      await ann.save();
      return res.json({ success: true, announcement: ann, message: 'Announcement updated successfully' });
    }

    const ann = localAnnouncements.find(a => String(a._id) === String(id));
    if (!ann) return res.status(404).json({ success: false, message: 'Announcement not found' });
    if (title !== undefined) ann.title = title;
    if (content !== undefined) ann.content = content;
    if (clubId !== undefined) ann.clubId = clubId;
    if (category !== undefined) ann.category = category;
    if (isPinned !== undefined) ann.isPinned = Boolean(isPinned);
    res.json({ success: true, announcement: ann, message: 'Announcement updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/announcements/:id: Delete an announcement
app.delete('/api/announcements/:id', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const dbConn = await connectToDatabase();

    if (dbConn) {
      await Announcement.findByIdAndDelete(id);
    } else {
      localAnnouncements = localAnnouncements.filter(a => String(a._id) !== String(id));
    }

    res.json({ success: true, message: 'Announcement deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==========================================
// PHASE 4: LIVE MATCH SCORING & PLAY-BY-PLAY API
// ==========================================

// GET /api/matches/live: Return active live match status & details
app.get('/api/matches/live', async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const matches = dbRes.data.matches || [];
    
    // Find active match marked isLive or status === 'live'
    const liveMatch = matches.find(m => m.isLive || m.status === 'live');
    if (!liveMatch) {
      return res.json({ success: true, isLive: false, liveMatch: null });
    }

    const mId = String(liveMatch.id || liveMatch._id);
    const liveState = localLiveMatches[mId] || {
      isLive: true,
      currentSet: 1,
      team1SetsWon: 0,
      team2SetsWon: 0,
      liveScore: { team1: 0, team2: 0 },
      setScores: [],
      liveServingTeam: 'team1',
      playByPlay: []
    };

    res.json({
      success: true,
      isLive: true,
      match: liveMatch,
      liveState
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/matches/:id/live: Get live state of a specific match
app.get('/api/matches/:id/live', async (req, res) => {
  try {
    const { id } = req.params;
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const matches = dbRes.data.matches || [];
    const match = matches.find(m => String(m.id || m._id) === String(id));
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

    const liveState = localLiveMatches[String(id)] || {
      isLive: match.isLive || match.status === 'live',
      currentSet: 1,
      team1SetsWon: 0,
      team2SetsWon: 0,
      liveScore: { team1: 0, team2: 0 },
      setScores: [],
      liveServingTeam: 'team1',
      playByPlay: []
    };

    res.json({ success: true, match, liveState });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/matches/:id/live-start: Captain/Admin starts live scoring mode
app.post('/api/matches/:id/live-start', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const matches = dbData.matches || [];
    const match = matches.find(m => String(m.id || m._id) === String(id));
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

    // Mark match as live
    match.status = 'live';
    match.isLive = true;
    await saveDB(dbData);

    // Initialize or reset live state
    localLiveMatches[String(id)] = {
      isLive: true,
      currentSet: 1,
      team1SetsWon: 0,
      team2SetsWon: 0,
      liveScore: { team1: 0, team2: 0 },
      setScores: [],
      liveServingTeam: 'team1',
      playByPlay: [
        {
          id: 'pbp_' + Date.now(),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: `Match started! Set 1 underway between ${match.team1 || 'ACEIT Spikers'} and ${match.opp || match.team2 || 'Opponent'}.`,
          type: 'start',
          score: '0 - 0'
        }
      ]
    };

    // Broadcast notification to all students
    const matchTitle = `${match.team1 || 'ACEIT Spikers'} vs ${match.opp || match.team2 || 'Opponent'}`;
    const notifMsg = `Live scoring is now ON for ${matchTitle} at ${match.venue || 'Sports Complex'}. Follow live points!`;
    const targetUsers = localUsers.filter(u => u.active !== false);
    for (const u of targetUsers) {
      if (u.username) {
        await createNotification(u.username, '🏐 Match is LIVE!', notifMsg, 'match');
      }
    }

    res.json({ success: true, message: 'Live match scoring started!', liveState: localLiveMatches[String(id)] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/matches/:id/live-score: Log point / spike / block / ace in real-time
app.post('/api/matches/:id/live-score', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { scoringTeam, pointType, playerUsername, comment } = req.body;
    // scoringTeam: 'team1' | 'team2'
    // pointType: 'spike' | 'block' | 'ace' | 'error' | 'point'

    let state = localLiveMatches[String(id)];
    if (!state) {
      state = localLiveMatches[String(id)] = {
        isLive: true,
        currentSet: 1,
        team1SetsWon: 0,
        team2SetsWon: 0,
        liveScore: { team1: 0, team2: 0 },
        setScores: [],
        liveServingTeam: 'team1',
        playByPlay: []
      };
    }

    const teamKey = scoringTeam === 'team2' ? 'team2' : 'team1';
    state.liveScore[teamKey] = (state.liveScore[teamKey] || 0) + 1;
    state.liveServingTeam = teamKey;

    let pbpText = '';
    if (comment) {
      pbpText = comment;
    } else if (pointType === 'spike') {
      pbpText = `💥 Spectacular Spike point by ${playerUsername || 'ACEIT'}!`;
    } else if (pointType === 'block') {
      pbpText = `🛡️ Monster Block by ${playerUsername || 'ACEIT'} at the net!`;
    } else if (pointType === 'ace') {
      pbpText = `🎯 Clean Service Ace scored by ${playerUsername || 'ACEIT'}!`;
    } else if (scoringTeam === 'team2') {
      pbpText = `Point scored by opponent.`;
    } else {
      pbpText = `Point for ACEIT Spikers.`;
    }

    const scoreStr = `${state.liveScore.team1} - ${state.liveScore.team2}`;
    state.playByPlay.unshift({
      id: 'pbp_' + Date.now(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      text: pbpText,
      type: pointType || 'point',
      scoringTeam: teamKey,
      playerUsername: playerUsername || '',
      score: scoreStr
    });

    // If playerUsername provided and scoringTeam is team1, dynamically update player stats
    if (playerUsername && teamKey === 'team1') {
      const uname = String(playerUsername).toLowerCase().trim();
      const u = localUsers.find(user => user.username === uname);
      if (u) {
        u.stats = u.stats || { matchesPlayed: 0, points: 0, spikes: 0, blocks: 0, aces: 0, mvpAwards: 0 };
        u.stats.points = (u.stats.points || 0) + 1;
        if (pointType === 'spike') u.stats.spikes = (u.stats.spikes || 0) + 1;
        if (pointType === 'block') u.stats.blocks = (u.stats.blocks || 0) + 1;
        if (pointType === 'ace') u.stats.aces = (u.stats.aces || 0) + 1;
        u.stats.mvpPoints = calculateMvpPoints(u.stats);
      }
    }

    res.json({ success: true, liveState: state });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/matches/:id/live-set-end: End current set, record score and advance set
app.post('/api/matches/:id/live-set-end', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    let state = localLiveMatches[String(id)];
    if (!state) return res.status(404).json({ success: false, message: 'Live match state not found' });

    const setNum = state.currentSet;
    const finalSetScore = {
      set: setNum,
      team1: state.liveScore.team1,
      team2: state.liveScore.team2
    };

    if (state.liveScore.team1 > state.liveScore.team2) {
      state.team1SetsWon = (state.team1SetsWon || 0) + 1;
    } else {
      state.team2SetsWon = (state.team2SetsWon || 0) + 1;
    }

    state.setScores.push(finalSetScore);
    state.currentSet += 1;
    state.liveScore = { team1: 0, team2: 0 };

    state.playByPlay.unshift({
      id: 'pbp_' + Date.now(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: `🔔 Set ${setNum} concluded: ${finalSetScore.team1} - ${finalSetScore.team2}. Overall sets: ${state.team1SetsWon} - ${state.team2SetsWon}.`,
      type: 'set_end',
      score: `${finalSetScore.team1} - ${finalSetScore.team2}`
    });

    res.json({ success: true, message: `Set ${setNum} recorded!`, liveState: state });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/matches/:id/live-finish: Finalize match, record winner and update player records
app.post('/api/matches/:id/live-finish', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { mvpUsername } = req.body;
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const matches = dbData.matches || [];
    const match = matches.find(m => String(m.id || m._id) === String(id));
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

    let state = localLiveMatches[String(id)] || {
      team1SetsWon: 3,
      team2SetsWon: 1,
      setScores: [{ set: 1, team1: 25, team2: 20 }, { set: 2, team1: 25, team2: 22 }, { set: 3, team1: 21, team2: 25 }, { set: 4, team1: 25, team2: 18 }]
    };

    match.status = 'completed';
    match.isLive = false;
    match.winner = state.team1SetsWon >= state.team2SetsWon ? 'team1' : 'team2';
    match.sets = `${state.team1SetsWon} - ${state.team2SetsWon}`;
    match.setScores = state.setScores;
    await saveDB(dbData);

    state.isLive = false;

    // If MVP is awarded, increment MVP awards and notify student
    if (mvpUsername) {
      const uname = String(mvpUsername).toLowerCase().trim();
      const mvpUser = localUsers.find(u => u.username === uname);
      if (mvpUser) {
        mvpUser.stats = mvpUser.stats || { matchesPlayed: 0, points: 0, spikes: 0, blocks: 0, aces: 0, mvpAwards: 0 };
        mvpUser.stats.mvpAwards = (mvpUser.stats.mvpAwards || 0) + 1;
        mvpUser.stats.mvpPoints = calculateMvpPoints(mvpUser.stats);
        
        // Award MVP Gold Badge
        mvpUser.badges = mvpUser.badges || [];
        if (!mvpUser.badges.some(b => b.badgeKey === 'MVP_GOLD')) {
          const bDef = DEFAULT_PERF_BADGES.find(b => b.badgeKey === 'MVP_GOLD');
          if (bDef) mvpUser.badges.push({ ...bDef, awardedAt: new Date() });
        }

        await createNotification(
          uname,
          '👑 MVP of the Match Awarded!',
          `Congratulations! You have been awarded the MVP of the Match for the victory against ${match.opp || match.team2 || 'Opponent'} (+15 MVP Pts)!`,
          'badge'
        );
      }
    }

    res.json({ success: true, message: 'Match finalized and archived successfully!', match });
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
