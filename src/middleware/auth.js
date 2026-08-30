const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');
const { User, RevokedToken } = require('../models');
const { connectToDatabase } = require('../config/database');
const { normalizeClubId } = require('../utils/sanitize');

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Parses JWT token from Bearer header or HTTP-only cookies
 */
async function authenticateUser(req, res, next) {
  req.user = null;
  let token = null;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token && req.cookies) {
    token = req.cookies.token || req.cookies.auth_token;
  }

  if (!token || !env.JWT_SECRET) return next();

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (!decoded) return next();

    // Check token revocation list
    const dbConn = await connectToDatabase();
    if (dbConn) {
      const isRevoked = await RevokedToken.exists({ tokenHash: hashToken(token) });
      if (isRevoked) {
        req.user = null;
        return next();
      }

      const user = await User.findById(decoded.id).select('-passwordHash').lean();
      if (user) {
        req.user = user;
        if (user.active === false) {
          req.userIsDisabled = true;
        }
      }
    } else {
      req.user = {
        _id: decoded.id,
        id: decoded.id,
        username: decoded.username,
        role: decoded.role,
        clubId: decoded.clubId,
        permissions: decoded.permissions || []
      };
    }

    if (req.user && req.user.role === 'OWNER') {
      req.user.clubId = 'ALL';
      req.user.permissions = ['*'];
    }
  } catch (err) {
    // Invalid/expired token
    req.user = null;
  }
  next();
}

/**
 * Requires an authenticated user
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Authentication required. Please log in.' });
  }
  if (req.user.active === false || req.userIsDisabled) {
    return res.status(403).json({ success: false, message: 'Account is disabled. Please contact the Owner.' });
  }
  next();
}

/**
 * Requires specific permission or wildcard permission
 */
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

/**
 * Checks if user has permission to view/manage the target club
 */
function hasClubAccess(user, clubId) {
  if (!user) return false;
  if (user.role === 'OWNER' || user.clubId === 'ALL') return true;
  if (!clubId) return true;
  const targetNorm = normalizeClubId(clubId);
  if (Array.isArray(user.clubs)) {
    const normClubs = user.clubs.map(c => normalizeClubId(c));
    if (normClubs.includes(targetNorm)) return true;
  }
  const uClub = normalizeClubId(user.clubId);
  if (uClub === targetNorm) return true;
  return false;
}

/**
 * Middleware: Requires club access scope
 */
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
  if (!reqClub) return next();
  if (hasClubAccess(req.user, reqClub)) return next();
  return res.status(403).json({ success: false, message: `Access forbidden: You do not have access to club '${reqClub}'` });
}

module.exports = {
  hashToken,
  authenticateUser,
  requireAuth,
  requirePermission,
  hasClubAccess,
  requireClubAccess
};
