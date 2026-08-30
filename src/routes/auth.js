const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { User, RevokedToken, Club } = require('../models');
const { hashToken, authenticateUser, requireAuth } = require('../middleware/auth');
const { connectToDatabase } = require('../config/database');

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

// POST /api/v2/auth/signup
router.post('/signup', async (req, res, next) => {
  try {
    if (!env.JWT_SECRET) {
      return res.status(503).json({ success: false, message: 'Authentication is not configured on this server.' });
    }

    const { name, username, rtuRollNo, email, mobile, password, photo, branch, year, position, jerseyNo, height, sport, clubs } = req.body;

    if (!name || !username || !rtuRollNo || !email || !password) {
      return res.status(400).json({ success: false, message: 'Full Name, Username, RTU Roll No., Email, and Password are required.' });
    }

    const cleanName = String(name).trim();
    const cleanUsername = String(username).toLowerCase().trim();
    const cleanEmail = String(email).toLowerCase().trim();
    const cleanRollNo = String(rtuRollNo).trim();

    if (cleanUsername.length < 3) {
      return res.status(400).json({ success: false, message: 'Username must be at least 3 characters long.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    await connectToDatabase();

    const existing = await User.findOne({
      $or: [{ username: cleanUsername }, { email: cleanEmail }, { rtuRollNo: cleanRollNo }]
    });

    if (existing) {
      if (existing.username === cleanUsername) return res.status(400).json({ success: false, message: `Username '${cleanUsername}' is already taken.` });
      if (existing.email === cleanEmail) return res.status(400).json({ success: false, message: `Email '${cleanEmail}' is already registered.` });
      if (existing.rtuRollNo === cleanRollNo) return res.status(400).json({ success: false, message: `RTU Roll Number '${cleanRollNo}' is already registered.` });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(String(password), salt);

    const initialClub = (req.body.clubId || (Array.isArray(clubs) && clubs.length > 0 ? clubs[0] : 'spikers')).toLowerCase().trim();
    const userClubs = Array.isArray(clubs) && clubs.length > 0 ? clubs.map(c => String(c).toLowerCase().trim()) : [initialClub];
    if (!userClubs.includes(initialClub)) userClubs.unshift(initialClub);

    const newUser = await User.create({
      name: cleanName,
      username: cleanUsername,
      rtuRollNo: cleanRollNo,
      email: cleanEmail,
      mobile: mobile ? String(mobile).trim() : '',
      photo: photo || '',
      passwordHash: hash,
      role: 'STUDENT',
      clubId: userClubs[0],
      clubs: userClubs,
      bio: '',
      sport: sport || 'Volleyball',
      branch: branch || 'Computer Science & Engineering',
      year: year || '3rd Year',
      position: position || 'Athlete',
      jerseyNo: jerseyNo || '',
      height: height || '',
      achievements: [],
      permissions: ['profile.view', 'profile.edit', 'clubs.join'],
      active: true,
      lastLoginAt: new Date()
    });

    const token = jwt.sign(
      { id: String(newUser._id), username: newUser.username, role: newUser.role, clubId: newUser.clubId, permissions: newUser.permissions },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    setAuthCookies(res, token, req);

    const safeUser = newUser.toObject();
    delete safeUser.passwordHash;

    res.status(201).json({ success: true, token, user: safeUser, message: 'Student account registered successfully!' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v2/auth/login
router.post('/login', async (req, res, next) => {
  try {
    if (!env.JWT_SECRET) {
      return res.status(503).json({ success: false, message: 'Authentication is not configured on this server.' });
    }

    const inputVal = (req.body.username || req.body.login || req.body.email || '').trim();
    const password = req.body.password;
    if (!inputVal || !password) {
      return res.status(400).json({ success: false, message: 'Username/Email/Roll No and Password are required' });
    }

    const cleanInput = String(inputVal).toLowerCase().trim();
    await connectToDatabase();

    const user = await User.findOne({
      $or: [
        { username: cleanInput },
        { email: cleanInput },
        { rtuRollNo: cleanInput },
        { rtuRollNo: cleanInput.toUpperCase() }
      ]
    }).select('+passwordHash');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password' });
    }

    if (!user.active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Please contact administrator/owner.' });
    }

    let match = false;
    if (user.passwordHash && typeof user.passwordHash === 'string') {
      try {
        match = bcrypt.compareSync(String(password), user.passwordHash);
      } catch (e) {
        match = false;
      }
    }
    if (!match && (user.role === 'OWNER' || user.role === 'ADMIN') && (String(password) === env.ADMIN_PIN || String(password) === env.OWNER_PASSWORD)) {
      match = true;
    }

    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid username/email or password' });
    }

    // Update last login timestamp asynchronously
    User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } }).catch(() => {});

    const token = jwt.sign(
      { id: String(user._id), username: user.username, role: user.role, clubId: user.clubId, permissions: user.permissions },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    setAuthCookies(res, token, req);

    const safeUser = user.toObject();
    delete safeUser.passwordHash;

    res.json({ success: true, token, user: safeUser });
  } catch (err) {
    next(err);
  }
});

// POST /api/v2/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const token = (req.headers.authorization && req.headers.authorization.startsWith('Bearer '))
      ? req.headers.authorization.slice(7)
      : (req.cookies && (req.cookies.token || req.cookies.auth_token));

    if (token && env.JWT_SECRET) {
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.exp) {
          await connectToDatabase();
          await RevokedToken.updateOne(
            { tokenHash: hashToken(token) },
            { tokenHash: hashToken(token), expiresAt: new Date(decoded.exp * 1000) },
            { upsert: true }
          );
        }
      } catch (e) {}
    }

    const secure = process.env.NODE_ENV === 'production';
    const cookieOptions = { httpOnly: true, secure, sameSite: secure ? 'none' : 'lax', path: '/' };
    res.clearCookie('token', cookieOptions);
    res.clearCookie('auth_token', cookieOptions);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v2/auth/me
router.get('/me', authenticateUser, async (req, res, next) => {
  try {
    if (!req.user) {
      return res.json({ success: true, authenticated: false });
    }

    const clubs = await Club.find({ active: true }).select('clubId name sport slug themeColor accentColor active').sort({ name: 1 }).lean();

    res.json({
      success: true,
      authenticated: true,
      user: req.user,
      clubs
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
