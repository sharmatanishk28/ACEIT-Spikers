const express = require('express');
const router = express.Router();

const authRoutes = require('./routes/auth');
const clubRoutes = require('./routes/clubs');
const playerRoutes = require('./routes/players');
const matchRoutes = require('./routes/matches');
const eventRoutes = require('./routes/events');
const contentRoutes = require('./routes/content');
const userRoutes = require('./routes/users');
const { getDatabaseStatus } = require('./config/database');

// Health Check
router.get('/health', (req, res) => {
  const dbStatus = getDatabaseStatus();
  res.set('Cache-Control', 'no-store');
  res.json({
    status: 'ok',
    version: '2.0.0',
    architecture: 'Normalized Multi-Collection MongoDB Architecture',
    database: dbStatus.connected ? 'MongoDB Atlas' : 'Disconnected',
    connected: dbStatus.connected,
    mongoState: dbStatus.state,
    lastError: dbStatus.lastError
  });
});

// Mount modular sub-routers
router.use('/auth', authRoutes);
router.use('/clubs', clubRoutes);
router.use('/players', playerRoutes);
router.use('/team', playerRoutes); // Alias for backward compatibility
router.use('/matches', matchRoutes);
router.use('/events', eventRoutes);
router.use('/content', contentRoutes);
router.use('/', contentRoutes); // Alias top-level routes (e.g. /news, /gallery, /sponsors)
router.use('/', userRoutes); // Alias profile, users, notifications, leaderboard

module.exports = router;
