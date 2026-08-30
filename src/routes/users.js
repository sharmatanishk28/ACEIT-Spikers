const express = require('express');
const router = express.Router();
const { User, Application, Notification, Role } = require('../models');
const { authenticateUser, requireAuth, requirePermission } = require('../middleware/auth');
const { paginate } = require('../utils/pagination');

// ==========================================
// USER ATHLETE PROFILE (Self)
// ==========================================

// GET /api/v2/profile/me
router.get('/me', authenticateUser, requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id || req.user.id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User profile not found' });
    res.json({ success: true, profile: user });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v2/profile/me
router.put('/me', authenticateUser, requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id || req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User profile not found' });

    const { name, mobile, photo, bio, sport, branch, year, position, jerseyNo, height, achievements } = req.body;
    if (name) user.name = String(name).trim();
    if (mobile !== undefined) user.mobile = String(mobile).trim();
    if (photo !== undefined) user.photo = photo;
    if (bio !== undefined) user.bio = String(bio).trim();
    if (sport !== undefined) user.sport = String(sport).trim();
    if (branch !== undefined) user.branch = String(branch).trim();
    if (year !== undefined) user.year = String(year).trim();
    if (position !== undefined) user.position = String(position).trim();
    if (jerseyNo !== undefined) user.jerseyNo = String(jerseyNo).trim();
    if (height !== undefined) user.height = String(height).trim();
    if (Array.isArray(achievements)) user.achievements = achievements;

    await user.save();
    const safe = user.toObject();
    delete safe.passwordHash;

    res.json({ success: true, profile: safe, message: 'Profile updated successfully' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// ATHLETE LEADERBOARD
// ==========================================
router.get('/leaderboard', async (req, res, next) => {
  try {
    const athletes = await User.find({ active: true })
      .select('name username photo sport clubs stats badges role')
      .sort({ 'stats.mvpPoints': -1, 'stats.points': -1 })
      .limit(50)
      .lean();

    res.json({ success: true, leaderboard: athletes });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// IN-APP NOTIFICATIONS
// ==========================================
router.get('/notifications', authenticateUser, requireAuth, async (req, res, next) => {
  try {
    const notifications = await Notification.find({ recipientUsername: req.user.username })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    next(err);
  }
});

router.put('/notifications/:id/read', authenticateUser, requireAuth, async (req, res, next) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientUsername: req.user.username },
      { read: true }
    );
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// TRYOUT APPLICATIONS
// ==========================================
router.post('/applications', async (req, res, next) => {
  try {
    const { name, email, phone, position, experience, message, clubSlug } = req.body;
    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    const application = await Application.create({
      name: String(name).trim(),
      email: String(email).toLowerCase().trim(),
      phone: phone ? String(phone).trim() : '',
      position: position || 'Player',
      experience: experience || 'Beginner',
      message: message || '',
      clubSlug: clubSlug ? String(clubSlug).toLowerCase().trim() : 'spikers',
      status: 'Pending',
      source: 'Website Form'
    });

    res.status(201).json({ success: true, application, message: 'Application submitted successfully' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// ADMIN USER MANAGEMENT
// ==========================================
router.get('/users', authenticateUser, requireAuth, requirePermission('users.view'), async (req, res, next) => {
  try {
    const { role, clubId, page, limit } = req.query;
    const filter = {};
    if (role && role !== 'all') filter.role = role.toUpperCase();
    if (clubId && clubId !== 'all') filter.clubs = clubId;

    if (page || limit) {
      const result = await paginate(User, filter, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { createdAt: -1 }
      });
      return res.json({ success: true, ...result });
    }

    const users = await User.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// ROLES & RBAC
// ==========================================
router.get('/roles', async (req, res, next) => {
  try {
    const roles = await Role.find({}).sort({ createdAt: 1 }).lean();
    res.json({ success: true, roles });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
