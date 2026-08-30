const mongoose = require('mongoose');
const env = require('./env');

// DNS server resilience
const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {}

// Global serverless connection cache
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

let lastMongoError = null;
let _lastConnFailTime = 0;
const CONN_RETRY_COOLDOWN_MS = 3000; // 3 seconds cooldown between retries to prevent thundering herd

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
          try { decodedUser = decodeURIComponent(rawUser); } catch (e) {}
          const safeUser = encodeURIComponent(decodedUser);

          let decodedPass = rawPass;
          try { decodedPass = decodeURIComponent(rawPass); } catch (e) {}
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

/**
 * Connect to MongoDB with robust connection pooling, retry cooldown, and serverless promise reuse
 */
async function connectToDatabase() {
  const rawUri = env.MONGODB_URI;
  if (!rawUri) {
    lastMongoError = 'MONGODB_URI environment variable is missing';
    return null;
  }

  const uri = safeSanitizeMongoUri(rawUri);

  // Fast path: already connected
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  // Cooldown protection against hammering Atlas on failure
  if (!cached.promise && _lastConnFailTime > 0 && (Date.now() - _lastConnFailTime) < CONN_RETRY_COOLDOWN_MS) {
    return null;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
      dbName: 'spikers',
      autoIndex: process.env.NODE_ENV !== 'production'
    };

    console.log('[MongoDB Production] Connecting to database cluster...');
    cached.promise = mongoose.connect(uri, opts).then((m) => {
      console.log('[MongoDB Production] Connected successfully to database!');
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
    console.error('[MongoDB Error] Connection failed:', lastMongoError);
    return null;
  }

  return cached.conn;
}

// Connection event listeners
mongoose.connection.on('error', (err) => {
  console.warn('[MongoDB Event Warning]', err.message);
  lastMongoError = err.message;
});

mongoose.connection.on('disconnected', () => {
  console.warn('[MongoDB Event] Disconnected from cluster');
  cached.conn = null;
  cached.promise = null;
});

function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return {
    connected: readyState === 1,
    state: states[readyState] || 'unknown',
    readyState,
    lastError: readyState === 1 ? null : lastMongoError,
    hasUri: Boolean(env.MONGODB_URI)
  };
}

module.exports = {
  connectToDatabase,
  getDatabaseStatus,
  safeSanitizeMongoUri
};
