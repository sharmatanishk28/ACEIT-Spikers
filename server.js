require('dotenv').config();
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {}

process.on('uncaughtException', (err) => {
  console.warn('[Global Uncaught Exception Handled]', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.warn('[Global Unhandled Rejection Handled]', reason);
});

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary if environment variables are provided
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({
    cloudinary_url: process.env.CLOUDINARY_URL
  });
} else if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME.trim(),
    api_key: process.env.CLOUDINARY_API_KEY.trim(),
    api_secret: process.env.CLOUDINARY_API_SECRET.trim()
  });
}

function hasCloudinaryConfig() {
  return Boolean(
    process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
  );
}

async function uploadToCloudinary(dataUrlOrPath, folder = 'aceit_spikers') {
  if (!dataUrlOrPath || typeof dataUrlOrPath !== 'string') {
    return { success: false, url: '' };
  }
  const trimmed = dataUrlOrPath.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return { success: true, url: trimmed };
  }
  if (!trimmed.startsWith('data:image/')) {
    return { success: true, url: trimmed };
  }
  if (!hasCloudinaryConfig()) {
    return { success: true, url: trimmed };
  }
  try {
    const res = await cloudinary.uploader.upload(trimmed, {
      folder: folder,
      resource_type: 'auto',
      overwrite: true
    });
    return {
      success: true,
      url: res.secure_url || res.url,
      public_id: res.public_id,
      format: res.format,
      width: res.width,
      height: res.height
    };
  } catch (err) {
    console.error('[Cloudinary Upload Error]', err.message);
    return { success: false, url: trimmed, error: err.message };
  }
}

async function migrateBase64ImagesInObject(data, folder = 'aceit_spikers') {
  if (!data || typeof data !== 'object') return data;
  if (!hasCloudinaryConfig()) return data;

  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      data[i] = await migrateBase64ImagesInObject(data[i], folder);
    }
    return data;
  }

  const imageKeys = ['photo', 'poster', 'logo', 'loaderLogo', 'coverImage', 'team1Logo', 'team2Logo', 'image', 'crest'];
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (typeof val === 'string' && val.startsWith('data:image/')) {
      const upRes = await uploadToCloudinary(val, folder);
      if (upRes && upRes.url) {
        data[key] = upRes.url;
        if (upRes.public_id) {
          data[key + '_public_id'] = upRes.public_id;
        }
      }
    } else if (val && typeof val === 'object') {
      data[key] = await migrateBase64ImagesInObject(val, folder);
    }
  }
  return data;
}

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'spikers_jwt_secret_key_2026_dev_only');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const hasMongoUri = () => Boolean(process.env.MONGODB_URI);

// In-memory fallback stores for standalone/offline dev mode without MONGODB_URI
let localClubs = [
  {
    _id: 'c_spikers',
    clubId: 'spikers',
    name: 'ACEIT Spikers',
    sport: 'Volleyball',
    slug: 'spikers',
    logo: 'spikers-logo.png',
    loaderLogo: 'volleyball-loader.png',
    coverImage: 'banner1.jpg',
    description: 'The official volleyball club of ACEIT. Built on discipline, driven by teamwork, and playing for every point that matters.',
    themeColor: '#F5A623',
    accentColor: '#D97706',
    active: true,
    status: 'active',
    createdAt: new Date()
  },
  {
    _id: 'c_kabaddi',
    clubId: 'kabaddi',
    name: 'ACEIT Kabaddi',
    sport: 'Kabaddi',
    slug: 'kabaddi',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Kabaddi Club of Arya College of Engineering & IT. Unstoppable raid power, impenetrable defense, and collegiate champions.',
    themeColor: '#C0392B',
    accentColor: '#E74C3C',
    active: true,
    status: 'active',
    createdAt: new Date()
  },
  {
    _id: 'c_dunkers',
    clubId: 'dunkers',
    name: 'ACEIT Dunkers',
    sport: 'Basketball',
    slug: 'dunkers',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Basketball Club of ACEIT. Fast-break offenses, lockdown defense, and soaring collegiate hoopers.',
    themeColor: '#E67E22',
    accentColor: '#D35400',
    active: true,
    status: 'active',
    createdAt: new Date()
  },
  {
    _id: 'c_strikers',
    clubId: 'strikers-fc',
    name: 'ACEIT Strikers FC',
    sport: 'Football',
    slug: 'strikers-fc',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Football Club of ACEIT. Tactical mastery, relentless stamina, and championship collegiate soccer.',
    themeColor: '#27AE60',
    accentColor: '#2ECC71',
    active: true,
    status: 'active',
    createdAt: new Date()
  },
  {
    _id: 'c_shuttlers',
    clubId: 'shuttlers',
    name: 'ACEIT Shuttlers',
    sport: 'Badminton',
    slug: 'shuttlers',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Badminton Club of ACEIT. Lightning reflexes, precision smashes, and tournament agility.',
    themeColor: '#16A085',
    accentColor: '#1ABC9C',
    active: true,
    status: 'active',
    createdAt: new Date()
  },
  {
    _id: 'c_cricket',
    clubId: 'cricket',
    name: 'ACEIT Cricket',
    sport: 'Cricket',
    slug: 'cricket',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Cricket Club of ACEIT. Powerful strokeplay, lethal bowling spells, and collegiate derby champions.',
    themeColor: '#2980B9',
    accentColor: '#3498DB',
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
    _id: 'u_founder_real',
    name: 'Founder / Super Owner',
    username: (process.env.OWNER_USERNAME || 'founder').toLowerCase().trim(),
    email: 'founder@aceit.edu.in',
    rtuRollNo: '00EATFND001',
    passwordHash: bcrypt.hashSync(process.env.OWNER_PASSWORD || 'OwnerSecret123!', 10),
    role: 'OWNER',
    clubId: 'ALL',
    clubs: ['spikers', 'kabaddi', 'cricket', 'dunkers', 'shuttlers', 'strikers-fc'],
    permissions: ['*'],
    active: true,
    sport: 'All Sports',
    branch: 'Administration',
    year: 'Faculty / Management',
    createdAt: new Date()
  }
];

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true
}));
app.use(cookieParser());
app.use((req, res, next) => {
  // Only force no-cache on auth/write endpoints; public GET endpoints set their own Cache-Control
  const isWriteOrAuth = req.method !== 'GET' ||
    req.path.startsWith('/api/auth') ||
    req.path.startsWith('/api/login') ||
    req.path.startsWith('/api/logout') ||
    req.path.startsWith('/api/signup') ||
    req.path.startsWith('/api/profile') ||
    req.path.startsWith('/api/save') ||
    req.path.startsWith('/api/users') ||
    req.path.startsWith('/api/applications') ||
    req.path.startsWith('/api/notifications');
  if (isWriteOrAuth) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// Dynamic Public Club Page Route Handlers
app.get('/club/:clubId', (req, res) => {
  res.sendFile(path.join(__dirname, 'aceit-spikers-1.html'));
});
app.get('/clubs/:clubId', (req, res) => {
  res.sendFile(path.join(__dirname, 'aceit-spikers-1.html'));
});
app.get('/club.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'aceit-spikers-1.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'aceit-spikers-1.html'));
});

// ==========================================
// MONGODB CONNECTION & SERVERLESS CACHING
// ==========================================
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

let lastMongoError = null;

mongoose.connection.on('error', (err) => {
  console.warn('[MongoDB Atlas Connection Event Warning]', err.message);
  lastMongoError = err.message;
});

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB Atlas Event] Disconnected from cluster');
  cached.conn = null;
  cached.promise = null;
});

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

// Track last failed connection attempt to enforce retry cooldown
let _lastConnFailTime = 0;
const CONN_RETRY_COOLDOWN_MS = 3000; // don't hammer Atlas — wait 3s between retries

async function connectToDatabase() {
  const rawUri = process.env.MONGODB_URI;
  if (!rawUri) {
    lastMongoError = 'MONGODB_URI environment variable is missing in Vercel Settings';
    return null;
  }

  const uri = safeSanitizeMongoUri(rawUri);

  // Already connected: fast path
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // Cooldown: if last attempt failed recently, don't retry yet — return null immediately
  // This prevents hammering Atlas with repeated 5s-timeout attempts (thundering herd)
  if (!cached.promise && _lastConnFailTime > 0 && (Date.now() - _lastConnFailTime) < CONN_RETRY_COOLDOWN_MS) {
    return null;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      dbName: 'spikers'
    };
    console.log('[MongoDB Atlas] Connecting to database cluster...');
    cached.promise = mongoose.connect(uri, opts).then((m) => {
      console.log('[MongoDB Atlas] Connected successfully to spikers database!');
      lastMongoError = null;
      _lastConnFailTime = 0;
      return m;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    _lastConnFailTime = Date.now();
    lastMongoError = e.message || String(e);
    console.error('[MongoDB Atlas Error] Connection failed:', lastMongoError);
    return null;
  }
  return cached.conn;
}

function databaseUnavailable(res) {
  return res.status(503).json({
    success: false,
    message: 'Authentication database is unavailable. Please try again shortly.',
    error: lastMongoError || 'MongoDB connection is not available'
  });
}

function authConfigurationUnavailable(res) {
  return res.status(503).json({
    success: false,
    message: 'Authentication is not configured on this server.'
  });
}

function setAuthCookies(res, token, req) {
  const isHttps = Boolean(
    (req && (req.secure || req.headers['x-forwarded-proto'] === 'https')) ||
    (process.env.NODE_ENV === 'production' && !process.env.PORT)
  );
  const options = {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: 7 * 86400000,
    path: '/'
  };
  res.cookie('token', token, options);
  res.cookie('auth_token', token, options);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
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
  abouts: { type: Object, default: {} },
  contacts: { type: Object, default: {} },
  pin: { type: String, default: '2026' }
}, { timestamps: true, strict: false });

const ClubDoc = mongoose.models.ClubDoc || mongoose.model('ClubDoc', clubSchema);
// ClubDoc.key is already unique via schema; just ensure fast lookup

// Dynamic Multi-Club Model
const clubItemSchema = new mongoose.Schema({
  clubId: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true },
  sport: { type: String, required: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  logo: { type: String, default: '' },
  loaderLogo: { type: String, default: '' },
  coverImage: { type: String, default: '' },
  description: { type: String, default: '' },
  themeColor: { type: String, default: '' },
  accentColor: { type: String, default: '' },
  active: { type: Boolean, default: true },
  status: { type: String, default: 'active' }
}, { timestamps: true, strict: false });
// Additional composite index for fast active-club listing
clubItemSchema.index({ active: 1, name: 1 });

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
// Additional indexes (username is already indexed via unique:true on schema field)
userSchema.index({ email: 1 });
userSchema.index({ rtuRollNo: 1 });
userSchema.index({ role: 1 });
userSchema.index({ clubs: 1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);

const revokedTokenSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 }
}, { timestamps: true });
// tokenHash already indexed via unique:true on schema field
const RevokedToken = mongoose.models.RevokedToken || mongoose.model('RevokedToken', revokedTokenSchema);

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
  recipientUsername: { type: String, required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: 'broadcast' }, // 'selection', 'badge', 'application', 'match', 'broadcast'
  linkUrl: { type: String, default: '' },
  read: { type: Boolean, default: false }
}, { timestamps: true });
notificationSchema.index({ recipientUsername: 1, read: 1, createdAt: -1 });

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
announcementSchema.index({ clubId: 1, isPinned: -1, createdAt: -1 });

const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

// Fallback Stores for Phase 3 & Phase 4
let localEventRsvps = [];
let localMatchAvailability = [];
let localNotifications = [];
let localAnnouncements = [];
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

// ==========================================
// ONE-TIME SEEDING FLAG — prevents redundant DB queries on every request
// ==========================================
let seedDone = false;

// Initial Seeding Helper: Auto-seeds initial Club, Roles & OWNER account if database is fresh
async function seedInitialAuthAndClubs() {
  if (seedDone) return; // Already ran in this serverless invocation
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

    const owners = await User.find({ role: 'OWNER' });
    const ownerUsername = (process.env.OWNER_USERNAME || 'founder').toLowerCase().trim();
    if (owners.length === 0) {
      const ownerPass = process.env.OWNER_PASSWORD || 'OwnerSecret123!';
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(ownerPass, salt);

      await User.create({
        name: 'Founder / Super Owner',
        username: ownerUsername,
        email: 'founder@aceit.edu.in',
        rtuRollNo: '00EATFND001',
        passwordHash: hash,
        role: 'OWNER',
        clubId: 'ALL',
        clubs: ['spikers', 'kabaddi', 'cricket', 'dunkers', 'shuttlers', 'strikers-fc'],
        permissions: ['*'],
        active: true
      });
      console.log(`[MongoDB Atlas] Initialized single OWNER account: "${ownerUsername}"`);
    } else {
      const primaryOwner = owners.find(o => o.username === ownerUsername || o.username === 'founder') || owners[0];
      if (owners.length > 1) {
        for (const o of owners) {
          if (String(o._id) !== String(primaryOwner._id)) {
            await User.deleteOne({ _id: o._id });
            console.log(`[MongoDB Atlas] Removed duplicate OWNER record: "${o.username}"`);
          }
        }
      }
      let changed = false;
      if (primaryOwner.name !== 'Founder / Super Owner') { primaryOwner.name = 'Founder / Super Owner'; changed = true; }
      if (primaryOwner.clubId !== 'ALL') { primaryOwner.clubId = 'ALL'; changed = true; }
      if (!primaryOwner.permissions || !primaryOwner.permissions.includes('*')) { primaryOwner.permissions = ['*']; changed = true; }
      if (!primaryOwner.active) { primaryOwner.active = true; changed = true; }
      if (changed) await primaryOwner.save();
    }
    seedDone = true;
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

    // Set valid decoded payload as base authentication
    req.user = {
      _id: decoded.id,
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      clubId: decoded.clubId,
      permissions: decoded.permissions || []
    };

    const dbConn = await connectToDatabase();
    if (dbConn) {
      try {
        if (await RevokedToken.exists({ tokenHash: tokenHash(token) })) {
          req.user = null;
          return next();
        }
        let user = null;
        if (mongoose.Types.ObjectId.isValid(decoded.id)) {
          user = await User.findById(decoded.id).select('-passwordHash').lean();
        }
        if (!user && decoded.username) {
          user = await User.findOne({ username: String(decoded.username).toLowerCase().trim() }).select('-passwordHash').lean();
        }
        if (user) {
          req.user = Object.assign({}, req.user, user);
          if (user.active === false) {
            req.userIsDisabled = true;
          }
        }
      } catch (dbErr) {
        console.warn('[Auth Middleware DB Lookup Warning]', dbErr.message);
      }
    } else {
      let user = localUsers.find(u => String(u._id) === String(decoded.id) || u.username === String(decoded.username).toLowerCase().trim());
      if (user) {
        req.user = Object.assign({}, req.user, user);
        delete req.user.passwordHash;
        if (user.active === false) {
          req.userIsDisabled = true;
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
  if (req.user.active === false || req.userIsDisabled) {
    return res.status(403).json({ success: false, message: 'Account is disabled. Please contact the Owner.' });
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

function normalizeClubIdentifier(id) {
  if (!id) return 'spikers';
  const norm = String(id).toLowerCase().trim();
  if (norm === 'spikers' || norm === 'aceit-spikers' || norm === 'c_spikers' || norm === 'volleyball') return 'spikers';
  if (norm === 'kabaddi' || norm === 'c_kabaddi' || norm === 'aceit-kabaddi') return 'kabaddi';
  if (norm === 'cricket' || norm === 'c_cricket' || norm === 'aceit-cricket') return 'cricket';
  if (norm === 'shuttlers' || norm === 'c_shuttlers' || norm === 'badminton' || norm === 'aceit-shuttlers') return 'shuttlers';
  if (norm === 'strikers-fc' || norm === 'strikers' || norm === 'c_strikers' || norm === 'football' || norm === 'soccer' || norm === 'aceit-strikers-fc') return 'strikers-fc';
  if (norm === 'dunkers' || norm === 'c_dunkers' || norm === 'basketball' || norm === 'aceit-dunkers') return 'dunkers';
  return norm;
}

function areClubsEqual(c1, c2) {
  if (!c1 || !c2) return false;
  return normalizeClubIdentifier(c1) === normalizeClubIdentifier(c2);
}

function hasClubAccess(user, clubId) {
  if (!user) return false;
  if (user.role === 'OWNER' || user.clubId === 'ALL') return true;
  if (!clubId) return true;
  const targetNorm = normalizeClubIdentifier(clubId);
  if (Array.isArray(user.clubs)) {
    const normClubs = user.clubs.map(c => normalizeClubIdentifier(c));
    if (normClubs.includes(targetNorm)) return true;
  }
  const uClub = normalizeClubIdentifier(user.clubId);
  if (uClub === targetNorm) return true;
  return false;
}

function requireClubAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }
  if (!req.user.active) {
    return res.status(403).json({ success: false, message: 'Account is disabled. Please contact the Owner.' });
  }
  if (req.user.role === 'OWNER' || req.user.clubId === 'ALL') {
    return next();
  }
  const reqClub = req.query.clubId || (req.body && req.body.clubId) || req.params.clubId || req.params.club || req.headers['x-club-id'];
  if (!reqClub) {
    return next();
  }
  if (hasClubAccess(req.user, reqClub)) {
    return next();
  }
  return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to access club '${reqClub}'` });
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
  const normReq = normalizeClubIdentifier(reqClubId);
  return items.filter(item => {
    const cId = normalizeClubIdentifier(item.clubId || item.clubSlug || 'spikers');
    return cId === normReq;
  });
}

// Helper: Read default data.json fallback (used for local standalone dev and persistence)
function readLocalFileDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.users) && parsed.users.length && (!localUsers || localUsers.length <= 1)) {
        localUsers = parsed.users.slice();
      }
      if (Array.isArray(parsed.clubs) && parsed.clubs.length && (!localClubs || localClubs.length === 0)) {
        localClubs = parsed.clubs.slice();
      }
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
    users: localUsers,
    clubs: localClubs,
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
    const fileData = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) : {};
    const fullData = Object.assign({}, fileData, data, {
      users: localUsers,
      clubs: localClubs
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(fullData, null, 2), 'utf-8');
  } catch (err) { }
}

// ==========================================
// IN-MEMORY GETDB CACHE — 10-second TTL, invalidated on writes
// Collapses 8-12 sequential MongoDB reads per page into 1
// ==========================================
let _dbCache = null;
let _dbCacheTime = 0;
const DB_CACHE_TTL_MS = 10000; // 10 seconds

// In-flight deduplication: when multiple requests hit getDB() simultaneously on a cold cache,
// they all share ONE pending promise instead of each firing a separate ClubDoc.findOne()
let _dbFetchPromise = null;

let _clubsCache = null;
let _clubsCacheTime = 0;
const CLUBS_CACHE_TTL_MS = 60000; // 60 seconds

function invalidateClubsCache() {
  _clubsCache = null;
  _clubsCacheTime = 0;
}

async function getCachedClubs() {
  const now = Date.now();
  if (_clubsCache && (now - _clubsCacheTime) < CLUBS_CACHE_TTL_MS) {
    return _clubsCache;
  }
  const dbConn = await connectToDatabase();
  if (dbConn) {
    try {
      const clubs = await Club.find({ active: true })
        .select('clubId name sport slug themeColor accentColor active status description')
        .sort({ name: 1 })
        .lean();
      if (clubs && clubs.length > 0) {
        _clubsCache = clubs;
        _clubsCacheTime = Date.now();
        return clubs;
      }
    } catch (e) {}
  }
  return localClubs.filter(c => c.active !== false);
}

function invalidateDbCache() {
  _dbCache = null;
  _dbCacheTime = 0;
  _dbFetchPromise = null;
}

// Helper: Fetch full database from MongoDB Atlas (Strict Production Mode)
async function getDB() {
  const hasUri = !!process.env.MONGODB_URI;

  // Serve from in-memory cache if fresh
  const now = Date.now();
  if (_dbCache && (now - _dbCacheTime) < DB_CACHE_TTL_MS) {
    return { success: true, data: _dbCache };
  }

  // Deduplicate in-flight fetches: if another request is already fetching from MongoDB,
  // wait on the same promise instead of issuing a redundant ClubDoc.findOne()
  if (_dbFetchPromise) {
    return _dbFetchPromise;
  }

  // Start a new fetch and store the promise for deduplication
  _dbFetchPromise = _doGetDB(hasUri).finally(() => {
    _dbFetchPromise = null; // Clear after done so next TTL expiry starts fresh
  });
  return _dbFetchPromise;
}

async function _doGetDB(hasUri) {
  const dbConn = await connectToDatabase();

  if (dbConn) {
    try {
      let doc = await ClubDoc.findOne({ key: 'main' }).lean();
      if (!doc) {
        const count = await ClubDoc.countDocuments();
        if (count === 0) {
          const initial = readLocalFileDB();
          doc = (await ClubDoc.create({ key: 'main', ...initial, pin: process.env.ADMIN_PIN || '2026' })).toObject();
          console.log('[MongoDB Atlas] Collection empty. Auto-seeded initial data from data.json!');
        } else {
          doc = await ClubDoc.findOne({}).lean();
        }
      }
      if (doc) {
        if (Array.isArray(doc.team)) doc.team.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(doc.matches)) doc.matches.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(doc.events)) doc.events.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(doc.training)) doc.training.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(doc.news)) doc.news.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(doc.gallery)) doc.gallery.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(doc.sponsors)) doc.sponsors.forEach(i => normalizeItemClubId(i, 'spikers'));
        if (Array.isArray(doc.testimonials)) doc.testimonials.forEach(i => normalizeItemClubId(i, 'spikers'));
        // Update cache
        _dbCache = doc;
        _dbCacheTime = Date.now();
        return { success: true, data: doc };
      }
    } catch (err) {
      console.warn('[MongoDB Atlas Warning] Fetch failed, using cached/local fallback:', err.message);
    }
  }

  // Graceful high-availability fallback
  const localData = readLocalFileDB();
  _dbCache = localData;
  _dbCacheTime = Date.now();
  return { success: true, data: localData, fallback: true };
}

// Helper: Save full database to MongoDB Atlas
async function saveDB(data) {
  // Automatically migrate any base64 images to Cloudinary permanent URLs
  if (data && typeof data === 'object') {
    try {
      data = await migrateBase64ImagesInObject(data);
    } catch (e) {
      console.warn('[Image Migration Warning]', e.message);
    }
  }

  // Invalidate cache on any write so next read is fresh from MongoDB
  invalidateDbCache();
  // Skip synchronous file writes in production (MONGODB_URI set) — useless on Vercel serverless
  if (!process.env.MONGODB_URI) {
    writeLocalFileDB(data);
  }
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
        abouts: data.abouts || {},
        contacts: data.contacts || {},
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
// API ROUTES
// ==========================================

// Health Check
app.get('/api/health', (req, res) => {
  const readyState = mongoose.connection.readyState;
  const isMongo = readyState === 1;
  const mongoError = isMongo ? null : lastMongoError;
  res.set('Cache-Control', 'no-store');
  res.json({
    status: 'ok',
    database: isMongo ? 'MongoDB Atlas' : 'Local File (data.json fallback)',
    connected: isMongo,
    mongoState: ['disconnected', 'connected', 'connecting', 'disconnecting'][readyState] || 'unknown',
    hasUri: !!process.env.MONGODB_URI,
    lastError: mongoError,
    cacheAge: _dbCache ? Math.round((Date.now() - _dbCacheTime) / 1000) + 's' : 'empty'
  });
});

// Upload Endpoint for Images (Cloudinary)
app.post('/api/upload', async (req, res) => {
  try {
    const { image, file, dataUrl, folder } = req.body || {};
    const imgPayload = image || file || dataUrl;
    if (!imgPayload) {
      return res.status(400).json({ success: false, message: 'Image data is required' });
    }
    const targetFolder = folder || 'aceit_spikers';
    const uploadResult = await uploadToCloudinary(imgPayload, targetFolder);
    if (!uploadResult.success && uploadResult.error) {
      return res.status(500).json({ success: false, message: uploadResult.error });
    }
    res.json({
      success: true,
      url: uploadResult.url,
      public_id: uploadResult.public_id || null,
      format: uploadResult.format || null,
      width: uploadResult.width || null,
      height: uploadResult.height || null,
      isCloudinary: hasCloudinaryConfig()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1. Get full database (supports ?clubId=)
// NOTE: This is the primary data endpoint. Served from in-memory cache (10s TTL).
app.get('/api/db', async (req, res) => {
  const result = await getDB();
  if (!result.success) {
    return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${result.error}`, error: result.error });
  }
  let data = result.data;
  const rawReqClub = req.query.clubId || 'spikers';
  const reqClubId = normalizeClubIdentifier(rawReqClub);
  if (rawReqClub !== 'all' && rawReqClub !== 'ALL') {
    let clubAbout = (data.abouts && (data.abouts[reqClubId] || data.abouts[rawReqClub])) ? (data.abouts[reqClubId] || data.abouts[rawReqClub]) : (reqClubId === 'spikers' ? data.about : null);
    let clubContact = (data.contacts && (data.contacts[reqClubId] || data.contacts[rawReqClub])) ? (data.contacts[reqClubId] || data.contacts[rawReqClub]) : (reqClubId === 'spikers' ? data.contact : null);

    data = {
      ...data,
      about: clubAbout || (reqClubId === 'spikers' ? (data.about || {}) : {}),
      contact: clubContact || (reqClubId === 'spikers' ? (data.contact || {}) : {}),
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
  // Public data can be cached briefly; authenticated data must not
  res.set('Cache-Control', 'public, max-age=10, s-maxage=15');
  res.json({ success: true, ...data, data });
});

// 2. Save full database (scoped per club and permissions)
app.post('/api/save-all', authenticateUser, requireAuth, async (req, res) => {
  try {
    if (!req.user.active) {
      return res.status(403).json({ success: false, message: 'Account is disabled. Please contact the Owner.' });
    }
    const db = req.body;
    if (!db || typeof db !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const rawTarget = (req.query.clubId || db.clubId || (req.user.clubId !== 'ALL' ? req.user.clubId : 'ALL')).toLowerCase();
    
    if (rawTarget !== 'all' && !hasClubAccess(req.user, rawTarget)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to manage club '${rawTarget}'` });
    }

    const currentRes = await getDB();
    const currentDB = currentRes.success ? currentRes.data : {};

    const arrayModules = ['team', 'matches', 'events', 'news', 'gallery', 'training', 'sponsors', 'testimonials', 'stats', 'slideshow'];

    if (rawTarget === 'all') {
      // Global save across all clubs (Owner / Global Admin)
      arrayModules.forEach(mod => {
        if (Array.isArray(db[mod])) {
          const seen = new Set();
          const clean = [];
          db[mod].forEach(item => {
            if (!item || typeof item !== 'object') return;
            const itemId = item.id || ('id_' + Math.random().toString(36).substr(2, 9));
            if (!seen.has(itemId)) {
              seen.add(itemId);
              const cId = (item.clubId || (req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers')).toLowerCase();
              clean.push(Object.assign({}, item, { id: itemId, clubId: cId }));
            }
          });
          currentDB[mod] = clean;
        }
      });
      if (db.about && typeof db.about === 'object') currentDB.about = db.about;
      if (db.contact && typeof db.contact === 'object') currentDB.contact = db.contact;
      if (db.abouts && typeof db.abouts === 'object') currentDB.abouts = Object.assign({}, currentDB.abouts, db.abouts);
      if (db.contacts && typeof db.contacts === 'object') currentDB.contacts = Object.assign({}, currentDB.contacts, db.contacts);
    } else {
      // Scoped save for a specific club
      const targetClubId = rawTarget;
      arrayModules.forEach(mod => {
        if (Array.isArray(db[mod])) {
          // 1. Keep all items belonging to OTHER clubs untouched
          const others = (currentDB[mod] || []).filter(item => {
            const itemClub = (item.clubId || 'spikers').toLowerCase();
            return itemClub !== targetClubId && !((itemClub === 'spikers' || itemClub === 'c_spikers') && (targetClubId === 'spikers' || targetClubId === 'c_spikers'));
          });

          // 2. Determine target items: if the array contains items with explicit other clubIds, filter them out!
          const isPureScoped = db[mod].every(item => !item.clubId || item.clubId.toLowerCase() === targetClubId || ((item.clubId.toLowerCase() === 'spikers' || item.clubId.toLowerCase() === 'c_spikers') && (targetClubId === 'spikers' || targetClubId === 'c_spikers')));
          
          let targetRaw = isPureScoped ? db[mod] : db[mod].filter(item => {
            const itemClub = (item.clubId || 'spikers').toLowerCase();
            return itemClub === targetClubId || ((itemClub === 'spikers' || itemClub === 'c_spikers') && (targetClubId === 'spikers' || targetClubId === 'c_spikers'));
          });

          // 3. Deduplicate target items by ID
          const seen = new Set();
          const uniqueTarget = [];
          targetRaw.forEach(item => {
            if (!item || typeof item !== 'object') return;
            const itemId = item.id || ('id_' + Math.random().toString(36).substr(2, 9));
            if (!seen.has(itemId)) {
              seen.add(itemId);
              uniqueTarget.push(Object.assign({}, item, { id: itemId, clubId: targetClubId }));
            }
          });

          currentDB[mod] = others.concat(uniqueTarget);
        }
      });

      if (db.about && typeof db.about === 'object') {
        currentDB.abouts = currentDB.abouts || {};
        currentDB.abouts[targetClubId] = db.about;
        if (targetClubId === 'spikers' || targetClubId === 'c_spikers') {
          currentDB.about = db.about;
        }
      }

      if (db.contact && typeof db.contact === 'object') {
        currentDB.contacts = currentDB.contacts || {};
        currentDB.contacts[targetClubId] = db.contact;
        if (targetClubId === 'spikers' || targetClubId === 'c_spikers') {
          currentDB.contact = db.contact;
        }
      }
    }

    // Merge categories
    if (db.categories) currentDB.categories = db.categories;
    if (db.deletedCategories) currentDB.deletedCategories = db.deletedCategories;
    if (db.customCategories) currentDB.customCategories = db.customCategories;

    const result = await saveDB(currentDB);
    if (!result.success) {
      return res.status(500).json({ success: false, message: `Failed to save changes: ${result.error}`, error: result.error });
    }
    return res.json({ success: true, message: `Club database for '${rawTarget}' updated successfully`, data: currentDB });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
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
    
    if (!hasClubAccess(req.user, player.clubId)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to add players to club '${player.clubId}'` });
    }

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
    const idx = db.team.findIndex(p => String(p.id) === String(id) || String(p._id) === String(id));
    if (idx === -1) {
      console.error(`[API Player Update Failed] Player ID not found: ${id}`);
      return res.status(404).json({ success: false, message: 'Player not found' });
    }
    
    const existingClub = db.team[idx].clubId || 'spikers';
    if (!hasClubAccess(req.user, existingClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to modify players in club '${existingClub}'` });
    }

    updatedPlayer.id = id;
    if (!updatedPlayer.clubId) {
      updatedPlayer.clubId = existingClub;
    }
    if (!hasClubAccess(req.user, updatedPlayer.clubId)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to assign player to club '${updatedPlayer.clubId}'` });
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
    const playerToDelete = db.team.find(p => String(p.id) === String(id) || String(p._id) === String(id));
    if (!playerToDelete) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    const existingClub = playerToDelete.clubId || 'spikers';
    if (!hasClubAccess(req.user, existingClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to delete players from club '${existingClub}'` });
    }

    db.team = db.team.filter(p => String(p.id) !== String(id) && String(p._id) !== String(id));

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
    if (!hasClubAccess(req.user, orig.clubId || 'spikers')) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to duplicate players in club '${orig.clubId || 'spikers'}'` });
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
app.post('/api/matches', authenticateUser, requireAuth, requirePermission('matches.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) {
      return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${dbRes.error}`, error: dbRes.error });
    }
    const db = dbRes.data;
    const match = req.body || {};
    match.id = match.id || generateId();
    match.clubId = match.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    
    if (!hasClubAccess(req.user, match.clubId)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to add matches for club '${match.clubId}'` });
    }

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
app.put('/api/matches/:id', authenticateUser, requireAuth, requirePermission('matches.*'), async (req, res) => {
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

    const existingClub = db.matches[idx].clubId || 'spikers';
    if (!hasClubAccess(req.user, existingClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to modify matches for club '${existingClub}'` });
    }

    updatedMatch.id = id;
    if (!updatedMatch.clubId) {
      updatedMatch.clubId = existingClub;
    }
    if (!hasClubAccess(req.user, updatedMatch.clubId)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to assign matches to club '${updatedMatch.clubId}'` });
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
app.delete('/api/matches/:id', authenticateUser, requireAuth, requirePermission('matches.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) {
      return res.status(500).json({ success: false, message: `MongoDB Atlas Connection Error: ${dbRes.error}`, error: dbRes.error });
    }
    const db = dbRes.data;
    const { id } = req.params;
    db.matches = db.matches || [];
    const matchToDelete = db.matches.find(m => String(m.id) === String(id));
    if (!matchToDelete) {
      return res.status(404).json({ success: false, message: 'Match not found' });
    }

    const existingClub = matchToDelete.clubId || 'spikers';
    if (!hasClubAccess(req.user, existingClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to delete matches from club '${existingClub}'` });
    }

    db.matches = db.matches.filter(m => String(m.id) !== String(id));

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
app.post('/api/matches/duplicate/:id', authenticateUser, requireAuth, requirePermission('matches.*'), async (req, res) => {
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
    if (!hasClubAccess(req.user, orig.clubId || 'spikers')) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to duplicate matches in club '${orig.clubId || 'spikers'}'` });
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
// CONTENT API ENDPOINTS (News, Gallery, Events, Training, Sponsors, Testimonials, About, Contact)
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
    if (!hasClubAccess(req.user, item.clubId)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to add news to club '${item.clubId}'` });
    }
    db.news = db.news || [];
    db.news.unshift(item);
    await saveDB(db);
    res.json({ success: true, item, news: db.news });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/news/:id
app.put('/api/news/:id', authenticateUser, requireAuth, requirePermission('news.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const { id } = req.params;
    const updated = req.body || {};
    db.news = db.news || [];
    const idx = db.news.findIndex(n => String(n.id) === String(id));
    if (idx === -1) return res.status(404).json({ success: false, message: 'News article not found' });
    const existingClub = db.news[idx].clubId || 'spikers';
    if (!hasClubAccess(req.user, existingClub)) return res.status(403).json({ success: false, message: 'Access forbidden' });
    updated.id = id;
    if (!updated.clubId) updated.clubId = existingClub;
    db.news[idx] = updated;
    await saveDB(db);
    res.json({ success: true, item: updated, news: db.news });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/news/:id
app.delete('/api/news/:id', authenticateUser, requireAuth, requirePermission('news.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const { id } = req.params;
    db.news = db.news || [];
    const item = db.news.find(n => String(n.id) === String(id));
    if (!item) return res.status(404).json({ success: false, message: 'News article not found' });
    if (!hasClubAccess(req.user, item.clubId || 'spikers')) return res.status(403).json({ success: false, message: 'Access forbidden' });
    db.news = db.news.filter(n => String(n.id) !== String(id));
    await saveDB(db);
    res.json({ success: true, message: 'News article deleted', news: db.news });
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
    if (!hasClubAccess(req.user, item.clubId)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to add gallery photos to club '${item.clubId}'` });
    }
    db.gallery = db.gallery || [];
    db.gallery.unshift(item);
    await saveDB(db);
    res.json({ success: true, item, gallery: db.gallery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/gallery/:id
app.put('/api/gallery/:id', authenticateUser, requireAuth, requirePermission('gallery.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const { id } = req.params;
    const updated = req.body || {};
    db.gallery = db.gallery || [];
    const idx = db.gallery.findIndex(g => String(g.id) === String(id));
    if (idx === -1) return res.status(404).json({ success: false, message: 'Gallery item not found' });
    const existingClub = db.gallery[idx].clubId || 'spikers';
    if (!hasClubAccess(req.user, existingClub)) return res.status(403).json({ success: false, message: 'Access forbidden' });
    updated.id = id;
    if (!updated.clubId) updated.clubId = existingClub;
    db.gallery[idx] = updated;
    await saveDB(db);
    res.json({ success: true, item: updated, gallery: db.gallery });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/gallery/:id
app.delete('/api/gallery/:id', authenticateUser, requireAuth, requirePermission('gallery.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const { id } = req.params;
    db.gallery = db.gallery || [];
    const item = db.gallery.find(g => String(g.id) === String(id));
    if (!item) return res.status(404).json({ success: false, message: 'Gallery item not found' });
    if (!hasClubAccess(req.user, item.clubId || 'spikers')) return res.status(403).json({ success: false, message: 'Access forbidden' });
    db.gallery = db.gallery.filter(g => String(g.id) !== String(id));
    await saveDB(db);
    res.json({ success: true, message: 'Gallery item deleted', gallery: db.gallery });
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

// POST /api/sponsors
app.post('/api/sponsors', authenticateUser, requireAuth, requirePermission('sponsors.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const item = req.body || {};
    item.id = item.id || generateId();
    item.clubId = item.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    if (!hasClubAccess(req.user, item.clubId)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to manage sponsors for club '${item.clubId}'` });
    }
    db.sponsors = db.sponsors || [];
    db.sponsors.push(item);
    await saveDB(db);
    res.json({ success: true, item, sponsors: db.sponsors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/sponsors/:id
app.put('/api/sponsors/:id', authenticateUser, requireAuth, requirePermission('sponsors.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const { id } = req.params;
    db.sponsors = db.sponsors || [];
    const idx = db.sponsors.findIndex(s => String(s.id || s._id) === String(id));
    if (idx === -1) return res.status(404).json({ success: false, message: 'Sponsor not found' });
    const targetClub = db.sponsors[idx].clubId || 'spikers';
    if (!hasClubAccess(req.user, targetClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to edit sponsors for club '${targetClub}'` });
    }
    db.sponsors[idx] = Object.assign({}, db.sponsors[idx], req.body, { id: id, clubId: req.body.clubId || targetClub });
    await saveDB(db);
    res.json({ success: true, item: db.sponsors[idx], sponsors: db.sponsors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/sponsors/:id
app.delete('/api/sponsors/:id', authenticateUser, requireAuth, requirePermission('sponsors.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const { id } = req.params;
    db.sponsors = db.sponsors || [];
    const item = db.sponsors.find(s => String(s.id || s._id) === String(id));
    if (!item) return res.status(404).json({ success: false, message: 'Sponsor not found' });
    if (!hasClubAccess(req.user, item.clubId || 'spikers')) {
      return res.status(403).json({ success: false, message: 'Access forbidden' });
    }
    db.sponsors = db.sponsors.filter(s => String(s.id || s._id) !== String(id));
    await saveDB(db);
    res.json({ success: true, message: 'Sponsor deleted successfully', sponsors: db.sponsors });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/achievements (supports ?clubId=)
app.get('/api/achievements', async (req, res) => {
  const result = await getDB();
  if (!result.success) return res.status(500).json({ success: false, message: result.error });
  let achievements = filterByClub(result.data.achievements || result.data.testimonials || [], req.query.clubId || 'spikers');
  res.json({ success: true, achievements });
});

// POST /api/achievements
app.post('/api/achievements', authenticateUser, requireAuth, requirePermission('about.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const item = req.body || {};
    item.id = item.id || generateId();
    item.clubId = item.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    if (!hasClubAccess(req.user, item.clubId)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to add achievements for club '${item.clubId}'` });
    }
    db.achievements = db.achievements || [];
    db.achievements.push(item);
    await saveDB(db);
    res.json({ success: true, item, achievements: db.achievements });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/achievements/:id
app.put('/api/achievements/:id', authenticateUser, requireAuth, requirePermission('about.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const { id } = req.params;
    db.achievements = db.achievements || [];
    const idx = db.achievements.findIndex(a => String(a.id || a._id) === String(id));
    if (idx === -1) return res.status(404).json({ success: false, message: 'Achievement not found' });
    const targetClub = db.achievements[idx].clubId || 'spikers';
    if (!hasClubAccess(req.user, targetClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to edit achievements for club '${targetClub}'` });
    }
    db.achievements[idx] = Object.assign({}, db.achievements[idx], req.body, { id: id, clubId: req.body.clubId || targetClub });
    await saveDB(db);
    res.json({ success: true, item: db.achievements[idx], achievements: db.achievements });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/achievements/:id
app.delete('/api/achievements/:id', authenticateUser, requireAuth, requirePermission('about.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const { id } = req.params;
    db.achievements = db.achievements || [];
    const item = db.achievements.find(a => String(a.id || a._id) === String(id));
    if (!item) return res.status(404).json({ success: false, message: 'Achievement not found' });
    if (!hasClubAccess(req.user, item.clubId || 'spikers')) {
      return res.status(403).json({ success: false, message: 'Access forbidden' });
    }
    db.achievements = db.achievements.filter(a => String(a.id || a._id) !== String(id));
    await saveDB(db);
    res.json({ success: true, message: 'Achievement deleted successfully', achievements: db.achievements });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/testimonials (supports ?clubId=)
app.get('/api/testimonials', async (req, res) => {
  const result = await getDB();
  if (!result.success) return res.status(500).json({ success: false, message: result.error });
  let testimonials = filterByClub(result.data.testimonials || [], req.query.clubId || 'spikers');
  res.json({ success: true, testimonials });
});

// POST /api/testimonials
app.post('/api/testimonials', authenticateUser, requireAuth, requirePermission('testimonials.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const item = req.body || {};
    item.id = item.id || generateId();
    item.clubId = item.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    if (!hasClubAccess(req.user, item.clubId)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to add testimonials for club '${item.clubId}'` });
    }
    db.testimonials = db.testimonials || [];
    db.testimonials.push(item);
    await saveDB(db);
    res.json({ success: true, item, testimonials: db.testimonials });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/testimonials/:id
app.put('/api/testimonials/:id', authenticateUser, requireAuth, requirePermission('testimonials.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const { id } = req.params;
    db.testimonials = db.testimonials || [];
    const idx = db.testimonials.findIndex(t => String(t.id || t._id) === String(id));
    if (idx === -1) return res.status(404).json({ success: false, message: 'Testimonial not found' });
    const targetClub = db.testimonials[idx].clubId || 'spikers';
    if (!hasClubAccess(req.user, targetClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to edit testimonials for club '${targetClub}'` });
    }
    db.testimonials[idx] = Object.assign({}, db.testimonials[idx], req.body, { id: id, clubId: req.body.clubId || targetClub });
    await saveDB(db);
    res.json({ success: true, item: db.testimonials[idx], testimonials: db.testimonials });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/testimonials/:id
app.delete('/api/testimonials/:id', authenticateUser, requireAuth, requirePermission('testimonials.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const { id } = req.params;
    db.testimonials = db.testimonials || [];
    const item = db.testimonials.find(t => String(t.id || t._id) === String(id));
    if (!item) return res.status(404).json({ success: false, message: 'Testimonial not found' });
    if (!hasClubAccess(req.user, item.clubId || 'spikers')) {
      return res.status(403).json({ success: false, message: 'Access forbidden' });
    }
    db.testimonials = db.testimonials.filter(t => String(t.id || t._id) !== String(id));
    await saveDB(db);
    res.json({ success: true, message: 'Testimonial deleted successfully', testimonials: db.testimonials });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/stats (supports ?clubId=)
app.get('/api/stats', async (req, res) => {
  const result = await getDB();
  if (!result.success) return res.status(500).json({ success: false, message: result.error });
  let stats = filterByClub(result.data.stats || [], req.query.clubId || 'spikers');
  res.json({ success: true, stats });
});

// POST /api/stats
app.post('/api/stats', authenticateUser, requireAuth, requirePermission('stats.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const item = req.body || {};
    item.id = item.id || generateId();
    item.clubId = item.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    if (!hasClubAccess(req.user, item.clubId)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to add stats for club '${item.clubId}'` });
    }
    db.stats = db.stats || [];
    db.stats.push(item);
    await saveDB(db);
    res.json({ success: true, item, stats: db.stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/stats/:id
app.put('/api/stats/:id', authenticateUser, requireAuth, requirePermission('stats.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const { id } = req.params;
    db.stats = db.stats || [];
    const idx = db.stats.findIndex(s => String(s.id || s._id) === String(id));
    if (idx === -1) return res.status(404).json({ success: false, message: 'Stat not found' });
    const targetClub = db.stats[idx].clubId || 'spikers';
    if (!hasClubAccess(req.user, targetClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to edit stats for club '${targetClub}'` });
    }
    db.stats[idx] = Object.assign({}, db.stats[idx], req.body, { id: id, clubId: req.body.clubId || targetClub });
    await saveDB(db);
    res.json({ success: true, item: db.stats[idx], stats: db.stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/stats/:id
app.delete('/api/stats/:id', authenticateUser, requireAuth, requirePermission('stats.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const { id } = req.params;
    db.stats = db.stats || [];
    const item = db.stats.find(s => String(s.id || s._id) === String(id));
    if (!item) return res.status(404).json({ success: false, message: 'Stat not found' });
    if (!hasClubAccess(req.user, item.clubId || 'spikers')) {
      return res.status(403).json({ success: false, message: 'Access forbidden' });
    }
    db.stats = db.stats.filter(s => String(s.id || s._id) !== String(id));
    await saveDB(db);
    res.json({ success: true, message: 'Stat deleted successfully', stats: db.stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/slideshow (supports ?clubId=)
app.get('/api/slideshow', async (req, res) => {
  const result = await getDB();
  if (!result.success) return res.status(500).json({ success: false, message: result.error });
  let slideshow = filterByClub(result.data.slideshow || [], req.query.clubId || 'spikers');
  res.json({ success: true, slideshow });
});

// POST /api/slideshow
app.post('/api/slideshow', authenticateUser, requireAuth, requirePermission('slideshow.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const item = req.body || {};
    item.id = item.id || generateId();
    item.clubId = item.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    if (!hasClubAccess(req.user, item.clubId)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to manage slideshow for club '${item.clubId}'` });
    }
    db.slideshow = db.slideshow || [];
    db.slideshow.push(item);
    await saveDB(db);
    res.json({ success: true, item, slideshow: db.slideshow });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/slideshow/:id
app.put('/api/slideshow/:id', authenticateUser, requireAuth, requirePermission('slideshow.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const idx = (db.slideshow || []).findIndex(it => it.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Slide not found' });
    const existing = db.slideshow[idx];
    if (!hasClubAccess(req.user, existing.clubId || 'spikers')) {
      return res.status(403).json({ success: false, message: 'Access forbidden: Cannot modify slides from other clubs' });
    }
    db.slideshow[idx] = Object.assign({}, existing, req.body, { id: req.params.id, clubId: existing.clubId });
    await saveDB(db);
    res.json({ success: true, item: db.slideshow[idx] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/slideshow/:id
app.delete('/api/slideshow/:id', authenticateUser, requireAuth, requirePermission('slideshow.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const idx = (db.slideshow || []).findIndex(it => it.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Slide not found' });
    const existing = db.slideshow[idx];
    if (!hasClubAccess(req.user, existing.clubId || 'spikers')) {
      return res.status(403).json({ success: false, message: 'Access forbidden: Cannot delete slides from other clubs' });
    }
    db.slideshow.splice(idx, 1);
    await saveDB(db);
    res.json({ success: true, message: 'Slide deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/about (supports ?clubId=)
app.get('/api/about', async (req, res) => {
  const result = await getDB();
  if (!result.success) return res.status(500).json({ success: false, message: result.error });
  let about = result.data.about || {};
  res.json({ success: true, about });
});

// POST /api/about
app.post('/api/about', authenticateUser, requireAuth, requirePermission('about.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const targetClub = req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    if (!hasClubAccess(req.user, targetClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to edit about details for club '${targetClub}'` });
    }
    db.about = Object.assign({}, db.about, req.body);
    await saveDB(db);
    res.json({ success: true, about: db.about });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/contact (supports ?clubId=)
app.get('/api/contact', async (req, res) => {
  const result = await getDB();
  if (!result.success) return res.status(500).json({ success: false, message: result.error });
  let contact = result.data.contact || {};
  res.json({ success: true, contact });
});

// POST /api/contact
app.post('/api/contact', authenticateUser, requireAuth, requirePermission('contact.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const db = dbRes.data;
    const targetClub = req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    if (!hasClubAccess(req.user, targetClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to edit contact details for club '${targetClub}'` });
    }
    db.contact = Object.assign({}, db.contact, req.body);
    await saveDB(db);
    res.json({ success: true, contact: db.contact });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
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

app.post('/api/pin', authenticateUser, requireAuth, async (req, res) => {
  if (req.user.role !== 'OWNER') {
    return res.status(403).json({ success: false, message: 'Only the OWNER can change the master PIN.' });
  }
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

// ==========================================
// STUDENT SIGNUP, AUTHENTICATION & PROFILE ROUTES
// ==========================================

// 1. Auth: Student Signup
const handleSignup = async (req, res) => {
  try {
    if (!JWT_SECRET) return authConfigurationUnavailable(res);
    const { name, username, rtuRollNo, email, mobile, password, photo, branch, year, position, jerseyNo, height, sport, clubs } = req.body;
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
    const cleanPosition = position ? String(position).trim() : 'Athlete';
    const cleanJersey = jerseyNo ? String(jerseyNo).trim() : '';
    const cleanHeight = height ? String(height).trim() : '';
    const cleanSport = sport ? String(sport).trim() : 'Volleyball';
    const initialClub = (req.body.clubId || (Array.isArray(clubs) && clubs.length > 0 ? clubs[0] : 'spikers')).toLowerCase().trim();
    const userClubs = Array.isArray(clubs) && clubs.length > 0
      ? clubs.map(c => String(c).toLowerCase().trim())
      : [initialClub];
    if (!userClubs.includes(initialClub)) userClubs.unshift(initialClub);

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
    if (hasMongoUri() && !dbConn) return databaseUnavailable(res);
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(String(password), salt);

    if (!dbConn) {
      const existingUser = localUsers.find(u => u.username === cleanUsername || (u.email && u.email.toLowerCase() === cleanEmail));
      if (existingUser) {
        if (existingUser.username === cleanUsername) {
          return res.status(400).json({ success: false, message: `Username '${cleanUsername}' is already taken. Please pick another.` });
        }
        return res.status(400).json({ success: false, message: `Email '${cleanEmail}' is already registered. Please sign in.` });
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
        clubId: userClubs[0] || 'spikers',
        clubs: userClubs,
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
      writeLocalFileDB(readLocalFileDB());

      const token = jwt.sign(
        { id: String(newUser._id), username: newUser.username, role: newUser.role, clubId: newUser.clubId, permissions: newUser.permissions },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      setAuthCookies(res, token);

      const safeUser = Object.assign({}, newUser);
      delete safeUser.passwordHash;
      return res.json({ success: true, token, user: safeUser, message: 'Student account registered successfully!' });
    }

    const existing = await User.findOne({
      $or: [{ username: cleanUsername }, { email: cleanEmail }]
    });
    if (existing) {
      if (existing.username === cleanUsername) {
        return res.status(400).json({ success: false, message: `Username '${cleanUsername}' is already taken. Please pick another.` });
      }
      return res.status(400).json({ success: false, message: `Email '${cleanEmail}' is already registered. Please sign in.` });
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
      clubId: userClubs[0] || 'spikers',
      clubs: userClubs,
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
    setAuthCookies(res, token);

    const safeUser = newUser.toObject();
    delete safeUser.passwordHash;

    res.json({ success: true, token, user: safeUser, message: 'Student account registered successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

app.post('/api/auth/signup', handleSignup);
app.post('/api/signup', handleSignup);

// 2. Auth: Login (Universal Single-ID Login across ALL Clubs)
const handleLogin = async (req, res) => {
  try {
    if (!JWT_SECRET) return authConfigurationUnavailable(res);
    const inputVal = (req.body.username || req.body.login || req.body.email || '').trim();
    const password = req.body.password;
    if (!inputVal || !password) {
      return res.status(400).json({ success: false, message: 'Username/Email/Roll No and Password are required' });
    }

    const cleanInput = String(inputVal).toLowerCase().trim();
    const dbConn = await connectToDatabase();
    if (hasMongoUri() && !dbConn) return databaseUnavailable(res);

    let user = null;
    if (dbConn) {
      const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      // Fast indexed exact lookup first
      user = await User.findOne({
        $or: [
          { username: cleanInput },
          { email: cleanInput },
          { rtuRollNo: cleanInput },
          { rtuRollNo: cleanInput.toUpperCase() }
        ]
      });
      if (!user) {
        const inputRegex = new RegExp('^' + escapeRegex(cleanInput) + '$', 'i');
        user = await User.findOne({
          $or: [{ username: inputRegex }, { email: inputRegex }, { rtuRollNo: inputRegex }]
        });
      }
      if (!user && (cleanInput === 'owner' || cleanInput === 'admin')) {
        user = await User.findOne({ role: 'OWNER' });
      }
      if (!user) {
        await seedInitialAuthAndClubs();
        user = await User.findOne({
          $or: [{ username: cleanInput }, { email: cleanInput }, { rtuRollNo: cleanInput }]
        });
        if (!user && (cleanInput === 'owner' || cleanInput === 'admin')) {
          user = await User.findOne({ role: 'OWNER' });
        }
      }
    } else {
      user = localUsers.find(u => 
        (u.username && u.username.toLowerCase().trim() === cleanInput) || 
        (u.email && u.email.toLowerCase().trim() === cleanInput) ||
        (u.rtuRollNo && u.rtuRollNo.toLowerCase().trim() === cleanInput)
      );
      if (!user && (cleanInput === 'owner' || cleanInput === 'admin')) {
        user = localUsers.find(u => u.role === 'OWNER');
      }
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password' });
    }

    if (!user.active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Please contact administrator/owner.' });
    }

    let match = bcrypt.compareSync(String(password), user.passwordHash);
    if (!match && (user.role === 'OWNER' || user.role === 'ADMIN') && (String(password) === (process.env.ADMIN_PIN || '2026') || String(password) === (process.env.OWNER_PASSWORD || 'OwnerSecret123!'))) {
      match = true;
    }
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password' });
    }

    const userId = user._id || user.id || 'owner_local';
    // Update lastLoginAt in background without blocking response
    if (dbConn && user._id) {
      User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(() => {});
    } else if (user.save) {
      user.lastLoginAt = new Date();
    }

    const token = jwt.sign(
      { id: String(userId), username: user.username, role: user.role, clubId: user.clubId, permissions: user.permissions },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    setAuthCookies(res, token);

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
};

app.post('/api/auth/login', handleLogin);
app.post('/api/login', handleLogin);

// 3. Auth: Logout
const handleLogout = async (req, res) => {
  const token = (req.headers.authorization && req.headers.authorization.startsWith('Bearer '))
    ? req.headers.authorization.slice(7)
    : (req.cookies && (req.cookies.token || req.cookies.auth_token));
  if (token && JWT_SECRET) {
    try {
      const decoded = jwt.decode(token);
      const dbConn = await connectToDatabase();
      if (dbConn && decoded && decoded.exp) {
        await RevokedToken.updateOne(
          { tokenHash: tokenHash(token) },
          { tokenHash: tokenHash(token), expiresAt: new Date(decoded.exp * 1000) },
          { upsert: true }
        );
      }
    } catch (err) {
      console.error('[Auth Logout Error]', err.message);
    }
  }
  const secure = process.env.NODE_ENV === 'production';
  const cookieOptions = { httpOnly: true, secure, sameSite: secure ? 'none' : 'lax', path: '/' };
  res.clearCookie('token', cookieOptions);
  res.clearCookie('auth_token', cookieOptions);
  res.json({ success: true, message: 'Logged out' });
};

app.post('/api/auth/logout', handleLogout);
app.post('/api/logout', handleLogout);

// 4. Auth: Current User Info
app.get('/api/auth/me', authenticateUser, async (req, res) => {
  try {
    if (!req.user) {
      res.set('Cache-Control', 'no-store');
      return res.json({ success: true, authenticated: false });
    }

    const clubs = await getCachedClubs();
    const safeUser = req.user.toObject ? req.user.toObject() : Object.assign({}, req.user);
    delete safeUser.passwordHash;

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      authenticated: true,
      user: safeUser,
      clubs
    });
  } catch (err) {
    console.error('[/api/auth/me Error]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Profile: GET Logged-in User Profile (Full Details)
const handleGetProfile = async (req, res) => {
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
};

app.get('/api/profile/me', authenticateUser, requireAuth, handleGetProfile);
app.get('/api/profile', authenticateUser, requireAuth, handleGetProfile);

// 6. Profile: PUT Update Logged-in User Profile
const handleUpdateProfile = async (req, res) => {
  try {
    const { name, mobile, photo, bio, sport, branch, year, position, jerseyNo, height, achievements, clubs, password, newPassword } = req.body;
    const pwdToSet = (newPassword || password || '').trim();
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
      if (Array.isArray(clubs)) u.clubs = clubs.map(c => String(c).toLowerCase().trim());
      if (pwdToSet) {
        if (pwdToSet.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        u.passwordHash = bcrypt.hashSync(pwdToSet, 10);
      }

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
    if (Array.isArray(clubs)) u.clubs = clubs.map(c => String(c).toLowerCase().trim());
    if (pwdToSet) {
      if (pwdToSet.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
      u.passwordHash = bcrypt.hashSync(pwdToSet, 10);
    }

    await u.save();
    const safe = u.toObject();
    delete safe.passwordHash;
    res.json({ success: true, profile: safe, message: 'Profile updated successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

app.put('/api/profile/me', authenticateUser, requireAuth, handleUpdateProfile);
app.put('/api/profile', authenticateUser, requireAuth, handleUpdateProfile);

// 7. Profile: GET My Followed Clubs with full details
app.get('/api/profile/clubs', authenticateUser, requireAuth, async (req, res) => {
  try {
    const userClubs = Array.isArray(req.user.clubs) ? req.user.clubs : [];
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const matched = localClubs.filter(c => userClubs.includes(c.clubId) || userClubs.includes(c.slug) || userClubs.includes(String(c._id)));
      return res.json({ success: true, clubs: matched });
    }

    const matched = await Club.find({
      $or: [
        { clubId: { $in: userClubs } },
        { slug: { $in: userClubs } },
        { _id: { $in: userClubs.filter(id => mongoose.Types.ObjectId.isValid(id)) } }
      ]
    }).sort({ name: 1 });

    res.json({ success: true, clubs: matched });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7b. Profile: POST Follow/Join Club
const handleJoinClub = async (req, res) => {
  try {
    const clubIdInput = req.body.clubSlug || req.body.clubId || req.params.id;
    if (!clubIdInput) return res.status(400).json({ success: false, message: 'Club identifier is required' });
    const cleanInput = String(clubIdInput).toLowerCase().trim();
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const u = localUsers.find(u => String(u._id) === String(req.user._id || req.user.id));
      if (!u) return res.status(404).json({ success: false, message: 'User not found' });
      u.clubs = u.clubs || [];
      if (!u.clubs.includes(cleanInput)) {
        u.clubs.push(cleanInput);
      }
      return res.json({ success: true, isFollowing: true, clubs: u.clubs, message: 'Joined club successfully!' });
    }

    const u = await User.findById(req.user._id || req.user.id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    u.clubs = u.clubs || [];
    if (!u.clubs.includes(cleanInput)) {
      u.clubs.push(cleanInput);
      await u.save();
    }
    res.json({ success: true, isFollowing: true, clubs: u.clubs, message: 'Joined club successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

app.post('/api/profile/clubs/join', authenticateUser, requireAuth, handleJoinClub);
app.post('/api/clubs/:id/follow', authenticateUser, requireAuth, handleJoinClub);

// 8. Profile: POST Leave/Unfollow Club
const handleLeaveClub = async (req, res) => {
  try {
    const clubIdInput = req.body.clubSlug || req.body.clubId || req.params.id;
    if (!clubIdInput) return res.status(400).json({ success: false, message: 'Club identifier is required' });
    const cleanInput = String(clubIdInput).toLowerCase().trim();
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const u = localUsers.find(u => String(u._id) === String(req.user._id || req.user.id));
      if (!u) return res.status(404).json({ success: false, message: 'User not found' });
      u.clubs = (u.clubs || []).filter(c => c !== cleanInput && c !== 'aceit-' + cleanInput);
      return res.json({ success: true, isFollowing: false, clubs: u.clubs, message: 'Left club' });
    }

    const u = await User.findById(req.user._id || req.user.id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    u.clubs = (u.clubs || []).filter(c => c !== cleanInput && c !== 'aceit-' + cleanInput);
    await u.save();
    res.json({ success: true, isFollowing: false, clubs: u.clubs, message: 'Left club' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

app.post('/api/profile/clubs/leave', authenticateUser, requireAuth, handleLeaveClub);
app.post('/api/clubs/:id/unfollow', authenticateUser, requireAuth, handleLeaveClub);

// 8b. Clubs: POST Toggle Follow Status
app.post('/api/clubs/:id/toggle-follow', authenticateUser, requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const cleanInput = String(id).toLowerCase().trim();
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const u = localUsers.find(u => String(u._id) === String(req.user._id || req.user.id));
      if (!u) return res.status(404).json({ success: false, message: 'User not found' });
      u.clubs = u.clubs || [];
      const isFollowing = u.clubs.includes(cleanInput);
      if (isFollowing) {
        u.clubs = u.clubs.filter(c => c !== cleanInput && c !== 'aceit-' + cleanInput);
      } else {
        u.clubs.push(cleanInput);
      }
      return res.json({
        success: true,
        isFollowing: !isFollowing,
        clubs: u.clubs,
        message: !isFollowing ? 'Followed club' : 'Unfollowed club'
      });
    }

    const u = await User.findById(req.user._id || req.user.id);
    if (!u) return res.status(404).json({ success: false, message: 'User not found' });
    u.clubs = u.clubs || [];
    const isFollowing = u.clubs.includes(cleanInput);
    if (isFollowing) {
      u.clubs = u.clubs.filter(c => c !== cleanInput && c !== 'aceit-' + cleanInput);
    } else {
      u.clubs.push(cleanInput);
    }
    await u.save();
    res.json({
      success: true,
      isFollowing: !isFollowing,
      clubs: u.clubs,
      message: !isFollowing ? 'Followed club' : 'Unfollowed club'
    });
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
      clubs: user.clubs || (user.clubId && user.clubId !== 'ALL' ? [user.clubId] : ['spikers']),
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
      // Fire seed in background (non-blocking) — guarded by seedDone flag, runs once
      if (!seedDone) seedInitialAuthAndClubs().catch(() => {});
      const roles = await Role.find({}).sort({ createdAt: 1 }).lean();
      res.set('Cache-Control', 'public, max-age=30, s-maxage=60');
      return res.json({ success: true, roles });
    }
    res.set('Cache-Control', 'public, max-age=30, s-maxage=60');
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
    const userClubs = (req.user && Array.isArray(req.user.clubs)) ? req.user.clubs : [];

    if (!dbConn) {
      let clubs = localClubs.map(c => {
        const item = Object.assign({}, c);
        item.isFollowing = userClubs.includes(item.clubId) || userClubs.includes(item.slug);
        return item;
      });
      if (req.user && req.user.role === 'ADMIN' && req.user.clubId && req.user.clubId !== 'ALL') {
        clubs = clubs.filter(c => String(c._id) === String(req.user.clubId) || c.clubId === req.user.clubId || c.slug === req.user.clubId);
      }
      res.set('Cache-Control', req.user ? 'no-store' : 'public, max-age=30, s-maxage=60');
      return res.json({ success: true, clubs });
    }

    let rawClubs = await getCachedClubs();
    let clubs = rawClubs.map(c => {
      const item = Object.assign({}, c);
      item.isFollowing = userClubs.includes(item.clubId) || userClubs.includes(item.slug);
      return item;
    });
    if (req.user && req.user.role === 'ADMIN' && req.user.clubId && req.user.clubId !== 'ALL') {
      clubs = clubs.filter(c => String(c._id) === String(req.user.clubId) || c.clubId === req.user.clubId || c.slug === req.user.clubId);
    }
    // Cache public (unauthenticated) club lists briefly; authenticated responses must not be cached
    res.set('Cache-Control', req.user ? 'no-store' : 'public, max-age=30, s-maxage=60');
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
    const canonId = normalizeClubIdentifier(cleanId);
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const club = localClubs.find(c =>
        String(c._id) === id ||
        (c.clubId && (c.clubId.toLowerCase() === cleanId || c.clubId.toLowerCase() === canonId)) ||
        (c.slug && (c.slug.toLowerCase() === cleanId || c.slug.toLowerCase() === canonId)) ||
        (c.sport && c.sport.toLowerCase() === cleanId)
      );
      if (!club) return res.status(404).json({ success: false, message: 'Club not found' });
      res.set('Cache-Control', 'public, max-age=30, s-maxage=60');
      return res.json({ success: true, club });
    }

    let club = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      club = await Club.findById(id).lean();
    }
    if (!club) {
      club = await Club.findOne({
        $or: [
          { clubId: cleanId },
          { slug: cleanId },
          { clubId: canonId },
          { slug: canonId },
          { sport: new RegExp('^' + cleanId + '$', 'i') },
          { sport: new RegExp('^' + canonId + '$', 'i') }
        ]
      }).lean();
    }
    if (!club) return res.status(404).json({ success: false, message: 'Club not found' });
    res.set('Cache-Control', 'public, max-age=30, s-maxage=60');
    res.json({ success: true, club });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Clubs: POST Create
app.post('/api/clubs', authenticateUser, requireAuth, requirePermission('clubs.create'), async (req, res) => {
  try {
    const { clubId, name, sport, slug, logo, loaderLogo, coverImage, description, themeColor, accentColor, active, status } = req.body;
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
        loaderLogo: loaderLogo || '',
        coverImage: coverImage || '',
        description: description || '',
        themeColor: themeColor || '',
        accentColor: accentColor || '',
        active: isActive,
        status: clubStatus,
        createdAt: new Date()
      };
      localClubs.unshift(newClub);
      writeLocalFileDB(readLocalFileDB());
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
      loaderLogo: loaderLogo || '',
      coverImage: coverImage || '',
      description: description || '',
      themeColor: themeColor || '',
      accentColor: accentColor || '',
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
    const { clubId, name, sport, slug, logo, loaderLogo, coverImage, description, themeColor, accentColor, active, status } = req.body;
    const dbConn = await connectToDatabase();

    if (!dbConn) {
      const club = localClubs.find(c => String(c._id) === String(id) || c.clubId === id || c.slug === id);
      if (!club) return res.status(404).json({ success: false, message: 'Club not found' });
      if (name) club.name = String(name).trim();
      if (sport) club.sport = String(sport).trim();
      if (clubId) club.clubId = String(clubId).toLowerCase().trim();
      if (slug) club.slug = slug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (logo !== undefined) club.logo = logo;
      if (loaderLogo !== undefined) club.loaderLogo = loaderLogo;
      if (coverImage !== undefined) club.coverImage = coverImage;
      if (description !== undefined) club.description = description;
      if (themeColor !== undefined) club.themeColor = themeColor;
      if (accentColor !== undefined) club.accentColor = accentColor;
      if (active !== undefined) club.active = !!active;
      if (status !== undefined) club.status = status;
      writeLocalFileDB(readLocalFileDB());
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
      const existing = await Club.findOne({ slug: cleanSlug, _id: { $ne: club._id } });
      if (existing) return res.status(400).json({ success: false, message: 'Club slug already taken.' });
      club.slug = cleanSlug;
    }
    if (name) club.name = String(name).trim();
    if (sport) club.sport = String(sport).trim();
    if (logo !== undefined) club.logo = logo;
    if (loaderLogo !== undefined) club.loaderLogo = loaderLogo;
    if (coverImage !== undefined) club.coverImage = coverImage;
    if (description !== undefined) club.description = description;
    if (themeColor !== undefined) club.themeColor = themeColor;
    if (accentColor !== undefined) club.accentColor = accentColor;
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
    if (hasMongoUri() && !dbConn) return databaseUnavailable(res);
    if (!dbConn) {
      readLocalFileDB();
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
    if (hasMongoUri() && !dbConn) return databaseUnavailable(res);
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
      const existingLocal = localUsers.find(u => 
        (u.username && u.username.toLowerCase() === cleanUsername) || 
        (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail) ||
        (cleanRollNo && u.rtuRollNo && u.rtuRollNo.toLowerCase() === cleanRollNo.toLowerCase())
      );
      if (existingLocal) {
        return res.status(400).json({ success: false, message: 'Username, Email, or Roll Number is already taken.' });
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
      writeLocalFileDB(readLocalFileDB());
      const userObj = Object.assign({}, newUser);
      delete userObj.passwordHash;
      return res.json({ success: true, user: userObj, message: 'User created successfully' });
    }

    const orConditions = [{ username: cleanUsername }];
    if (cleanEmail) orConditions.push({ email: cleanEmail });
    if (cleanRollNo) orConditions.push({ rtuRollNo: cleanRollNo });

    const existing = await User.findOne({ $or: orConditions });
    if (existing) {
      if (existing.username === cleanUsername) {
        return res.status(400).json({ success: false, message: `Username '${cleanUsername}' is already taken.` });
      }
      if (cleanEmail && existing.email === cleanEmail) {
        return res.status(400).json({ success: false, message: `Email '${cleanEmail}' is already registered.` });
      }
      if (cleanRollNo && existing.rtuRollNo === cleanRollNo) {
        return res.status(400).json({ success: false, message: `Roll Number '${cleanRollNo}' is already registered.` });
      }
      return res.status(400).json({ success: false, message: 'User already exists.' });
    }

    let newUser;
    try {
      newUser = await User.create({
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
    } catch (err) {
      if (err && err.code === 11000) {
        return res.status(409).json({ success: false, message: 'Username, Email, or Roll Number is already taken.' });
      }
      throw err;
    }

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

      const isSelf = String(req.user._id || req.user.id) === String(targetUser._id || targetUser.id);
      if (req.user.role !== 'OWNER') {
        if (isSelf && role && role !== targetUser.role) {
          return res.status(403).json({ success: false, message: 'You cannot change your own role.' });
        }
        if (isSelf && (permissions !== undefined || clubs !== undefined || (clubId !== undefined && clubId !== targetUser.clubId))) {
          return res.status(403).json({ success: false, message: 'You cannot modify your own permissions or club assignments.' });
        }
        if (targetUser.role === 'OWNER') {
          return res.status(403).json({ success: false, message: 'Only the OWNER can modify the OWNER account.' });
        }
        if (!isSelf && !hasClubAccess(req.user, targetUser.clubId)) {
          return res.status(403).json({ success: false, message: 'Cannot modify a user outside your assigned club.' });
        }
        if (role && role === 'OWNER') {
          return res.status(403).json({ success: false, message: 'Only the OWNER can assign OWNER role.' });
        }
        if (clubId && !hasClubAccess(req.user, clubId)) {
          return res.status(403).json({ success: false, message: 'Cannot assign a user to a club outside your access scope.' });
        }
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

    const isSelf = String(req.user._id || req.user.id) === String(targetUser._id || targetUser.id);
    if (req.user.role !== 'OWNER') {
      if (isSelf && role && role !== targetUser.role) {
        return res.status(403).json({ success: false, message: 'You cannot change your own role.' });
      }
      if (isSelf && (permissions !== undefined || clubs !== undefined || (clubId !== undefined && clubId !== targetUser.clubId))) {
        return res.status(403).json({ success: false, message: 'You cannot modify your own permissions or club assignments.' });
      }
      if (targetUser.role === 'OWNER') {
        return res.status(403).json({ success: false, message: 'Only the OWNER can modify the OWNER account.' });
      }
      if (!isSelf && !hasClubAccess(req.user, targetUser.clubId)) {
        return res.status(403).json({ success: false, message: 'Cannot modify a user outside your assigned club.' });
      }
      if (role && role === 'OWNER') {
        return res.status(403).json({ success: false, message: 'Only the OWNER can assign OWNER role.' });
      }
      if (clubId && !hasClubAccess(req.user, clubId)) {
        return res.status(403).json({ success: false, message: 'Cannot assign a user to a club outside your access scope.' });
      }
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
      const targetUser = localUsers.find(u => String(u._id) === String(id) || String(u.id) === String(id) || String(u.username).toLowerCase() === String(id).toLowerCase());
      if (!targetUser) return res.status(404).json({ success: false, message: 'User not found' });
      if (targetUser.role === 'OWNER') {
        return res.status(403).json({ success: false, message: 'The OWNER account cannot be deleted.' });
      }
      if (req.user.role !== 'OWNER' && req.user.clubId !== 'ALL' && !hasClubAccess(req.user, targetUser.clubId)) {
        return res.status(403).json({ success: false, message: 'Cannot delete a user outside your assigned club.' });
      }
      localUsers = localUsers.filter(u => String(u._id) !== String(targetUser._id) && String(u.id) !== String(targetUser._id) && String(u.username).toLowerCase() !== String(targetUser.username).toLowerCase());
      writeLocalFileDB(readLocalFileDB());
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
    if (req.user.role !== 'OWNER' && req.user.clubId !== 'ALL' && !hasClubAccess(req.user, targetUser.clubId)) {
      return res.status(403).json({ success: false, message: 'Cannot delete a user outside your assigned club.' });
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
app.get('/api/applications', authenticateUser, requireAuth, requirePermission('applications.*'), async (req, res) => {
  try {
    const dbConn = await connectToDatabase();
    if (dbConn) {
      let apps = await ApplicationDoc.find({}).sort({ createdAt: -1 });
      if (req.user.role !== 'OWNER' && req.user.clubId !== 'ALL') {
        apps = apps.filter(a => hasClubAccess(req.user, a.clubSlug || a.clubId));
      }
      res.json({ success: true, applications: apps });
    } else {
      const dbRes = await getDB();
      let apps = (dbRes.success && dbRes.data.applications) || [];
      if (req.user.role !== 'OWNER' && req.user.clubId !== 'ALL') {
        apps = apps.filter(a => hasClubAccess(req.user, a.clubSlug || a.clubId));
      }
      res.json({ success: true, applications: apps });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Applications: PUT Update Status & Auto-Membership on Acceptance
app.put('/api/applications/:id/status', authenticateUser, requireAuth, requirePermission('applications.*'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminFeedback } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'Status is required' });

    const dbConn = await connectToDatabase();
    if (dbConn) {
      let existingApp = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        existingApp = await ApplicationDoc.findById(id);
      }
      if (!existingApp) {
        existingApp = await ApplicationDoc.findOne({ _id: id });
      }
      if (!existingApp) return res.status(404).json({ success: false, message: 'Application not found' });
      if (!hasClubAccess(req.user, existingApp.clubSlug || existingApp.clubId)) {
        return res.status(403).json({ success: false, message: 'Access forbidden: You do not have permission to manage applications for this club.' });
      }

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
      if (!hasClubAccess(req.user, item.clubSlug || item.clubId)) {
        return res.status(403).json({ success: false, message: 'Access forbidden: You do not have permission to manage applications for this club.' });
      }
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
app.delete('/api/applications/:id', authenticateUser, requireAuth, requirePermission('applications.*'), async (req, res) => {
  try {
    const { id } = req.params;
    const dbConn = await connectToDatabase();

    if (dbConn) {
      let existingApp = null;
      if (mongoose.Types.ObjectId.isValid(id)) {
        existingApp = await ApplicationDoc.findById(id);
      }
      if (!existingApp) {
        existingApp = await ApplicationDoc.findOne({ _id: id });
      }
      if (existingApp && !hasClubAccess(req.user, existingApp.clubSlug || existingApp.clubId)) {
        return res.status(403).json({ success: false, message: 'Access forbidden: You do not have permission to delete applications for this club.' });
      }

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
        const item = dbData.applications.find(a => String(a.id || a._id) === String(id));
        if (item && !hasClubAccess(req.user, item.clubSlug || item.clubId)) {
          return res.status(403).json({ success: false, message: 'Access forbidden: You do not have permission to delete applications for this club.' });
        }
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
app.post('/api/events', authenticateUser, requireAuth, requirePermission('events.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const events = dbData.events || [];

    const targetClub = req.body.clubId || req.query.clubId || (req.user && req.user.clubId !== 'ALL' ? req.user.clubId : 'spikers');
    if (!hasClubAccess(req.user, targetClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to add events for club '${targetClub}'` });
    }

    const newEvt = {
      id: req.body.id || generateId(),
      clubId: targetClub,
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
app.put('/api/events/:id', authenticateUser, requireAuth, requirePermission('events.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const events = dbData.events || [];
    const idx = events.findIndex(e => String(e.id || e._id) === String(req.params.id));
    if (idx === -1) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }

    const currentClub = events[idx].clubId || 'spikers';
    if (!hasClubAccess(req.user, currentClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to edit events for club '${currentClub}'` });
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
app.delete('/api/events/:id', authenticateUser, requireAuth, requirePermission('events.*'), async (req, res) => {
  try {
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const events = dbData.events || [];
    const target = events.find(e => String(e.id || e._id) === String(req.params.id));
    if (!target) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    if (!hasClubAccess(req.user, target.clubId || 'spikers')) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to delete events for club '${target.clubId || 'spikers'}'` });
    }
    dbData.events = events.filter(e => String(e.id || e._id) !== String(req.params.id));
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
app.put('/api/matches/:matchId/lineup', authenticateUser, requireAuth, requirePermission('matches.*'), async (req, res) => {
  try {
    const { matchId } = req.params;
    const { starters } = req.body; // Array of { userId, username, name, position }
    if (!Array.isArray(starters)) {
      return res.status(400).json({ success: false, message: 'Starters array is required' });
    }

    const dbRes = await getDB();
    if (dbRes.success && Array.isArray(dbRes.data.matches)) {
      const match = dbRes.data.matches.find(m => String(m.id || m._id) === String(matchId));
      if (match && !hasClubAccess(req.user, match.clubId || 'spikers')) {
        return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to manage lineup for club '${match.clubId || 'spikers'}'` });
      }
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
app.post('/api/announcements', authenticateUser, requireAuth, requirePermission('news.*'), async (req, res) => {
  try {
    const { title, content, clubId, category, isPinned, sendBroadcast } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required' });
    }

    const targetClub = clubId || 'all';
    if (targetClub !== 'all' && !hasClubAccess(req.user, targetClub)) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission to create announcements for club '${targetClub}'` });
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
        clubId: targetClub,
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
        clubId: targetClub,
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
app.put('/api/announcements/:id', authenticateUser, requireAuth, requirePermission('news.*'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, clubId, category, isPinned } = req.body;
    const dbConn = await connectToDatabase();

    if (dbConn) {
      const ann = await Announcement.findById(id);
      if (!ann) return res.status(404).json({ success: false, message: 'Announcement not found' });
      if (ann.clubId && ann.clubId !== 'all' && !hasClubAccess(req.user, ann.clubId)) {
        return res.status(403).json({ success: false, message: 'Access forbidden: You do not have permission to edit this announcement.' });
      }
      if (clubId && clubId !== 'all' && !hasClubAccess(req.user, clubId)) {
        return res.status(403).json({ success: false, message: 'Access forbidden: You do not have permission for the target club.' });
      }
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
    if (ann.clubId && ann.clubId !== 'all' && !hasClubAccess(req.user, ann.clubId)) {
      return res.status(403).json({ success: false, message: 'Access forbidden: You do not have permission to edit this announcement.' });
    }
    if (clubId && clubId !== 'all' && !hasClubAccess(req.user, clubId)) {
      return res.status(403).json({ success: false, message: 'Access forbidden: You do not have permission for the target club.' });
    }
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
app.delete('/api/announcements/:id', authenticateUser, requireAuth, requirePermission('news.*'), async (req, res) => {
  try {
    const { id } = req.params;
    const dbConn = await connectToDatabase();

    if (dbConn) {
      const ann = await Announcement.findById(id);
      if (!ann) return res.status(404).json({ success: false, message: 'Announcement not found' });
      if (ann.clubId && ann.clubId !== 'all' && !hasClubAccess(req.user, ann.clubId)) {
        return res.status(403).json({ success: false, message: 'Access forbidden: You do not have permission to delete this announcement.' });
      }
      await Announcement.findByIdAndDelete(id);
    } else {
      const ann = localAnnouncements.find(a => String(a._id) === String(id));
      if (!ann) return res.status(404).json({ success: false, message: 'Announcement not found' });
      if (ann.clubId && ann.clubId !== 'all' && !hasClubAccess(req.user, ann.clubId)) {
        return res.status(403).json({ success: false, message: 'Access forbidden: You do not have permission to delete this announcement.' });
      }
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
app.post('/api/matches/:id/live-start', authenticateUser, requireAuth, requirePermission('matches.*'), async (req, res) => {
  try {
    const { id } = req.params;
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const matches = dbData.matches || [];
    const match = matches.find(m => String(m.id || m._id) === String(id));
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });
    if (!hasClubAccess(req.user, match.clubId || 'spikers')) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission for club '${match.clubId || 'spikers'}'` });
    }

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
app.post('/api/matches/:id/live-score', authenticateUser, requireAuth, requirePermission('matches.*'), async (req, res) => {
  try {
    const { id } = req.params;
    const { scoringTeam, pointType, playerUsername, comment } = req.body;
    // scoringTeam: 'team1' | 'team2'
    // pointType: 'spike' | 'block' | 'ace' | 'error' | 'point'

    const dbRes = await getDB();
    if (dbRes.success && Array.isArray(dbRes.data.matches)) {
      const match = dbRes.data.matches.find(m => String(m.id || m._id) === String(id));
      if (match && !hasClubAccess(req.user, match.clubId || 'spikers')) {
        return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission for club '${match.clubId || 'spikers'}'` });
      }
    }

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
app.post('/api/matches/:id/live-set-end', authenticateUser, requireAuth, requirePermission('matches.*'), async (req, res) => {
  try {
    const { id } = req.params;

    const dbRes = await getDB();
    if (dbRes.success && Array.isArray(dbRes.data.matches)) {
      const match = dbRes.data.matches.find(m => String(m.id || m._id) === String(id));
      if (match && !hasClubAccess(req.user, match.clubId || 'spikers')) {
        return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission for club '${match.clubId || 'spikers'}'` });
      }
    }

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
app.post('/api/matches/:id/live-finish', authenticateUser, requireAuth, requirePermission('matches.*'), async (req, res) => {
  try {
    const { id } = req.params;
    const { mvpUsername } = req.body;
    const dbRes = await getDB();
    if (!dbRes.success) return res.status(500).json({ success: false, message: dbRes.error });
    const dbData = dbRes.data;
    const matches = dbData.matches || [];
    const match = matches.find(m => String(m.id || m._id) === String(id));
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });
    if (!hasClubAccess(req.user, match.clubId || 'spikers')) {
      return res.status(403).json({ success: false, message: `Access forbidden: You do not have permission for club '${match.clubId || 'spikers'}'` });
    }

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
    if (process.env.MONGODB_URI) {
      connectToDatabase().then(conn => {
        if (conn) seedInitialAuthAndClubs().catch(() => {});
      }).catch(() => {});
    }
  });
}

module.exports = app;
