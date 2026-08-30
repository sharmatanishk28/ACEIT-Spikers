const express = require('express');
const router = express.Router();
const { Match, MatchAvailability } = require('../models');
const { authenticateUser, requireAuth, requirePermission, requireClubAccess } = require('../middleware/auth');
const { normalizeClubId } = require('../utils/sanitize');
const { paginate } = require('../utils/pagination');

// GET /api/v2/matches
router.get('/', async (req, res, next) => {
  try {
    const { clubId, status, sport, page, limit } = req.query;
    const filter = {};

    if (clubId && clubId !== 'all') {
      filter.clubId = normalizeClubId(clubId);
    }
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (sport && sport !== 'all') {
      filter.sport = sport.toLowerCase();
    }

    if (page || limit) {
      const result = await paginate(Match, filter, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { date: -1, createdAt: -1 }
      });
      return res.json({ success: true, ...result });
    }

    const matches = await Match.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json({ success: true, matches });
  } catch (err) {
    next(err);
  }
});

// GET /api/v2/matches/live
router.get('/live', async (req, res, next) => {
  try {
    const { clubId } = req.query;
    const filter = { isLive: true };
    if (clubId && clubId !== 'all') {
      filter.clubId = normalizeClubId(clubId);
    }

    const liveMatch = await Match.findOne(filter).sort({ updatedAt: -1 }).lean();
    if (!liveMatch) {
      return res.json({ success: true, isLive: false, match: null });
    }

    res.json({ success: true, isLive: true, match: liveMatch });
  } catch (err) {
    next(err);
  }
});

// GET /api/v2/matches/:id
router.get('/:id', async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id).lean();
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });
    res.json({ success: true, match });
  } catch (err) {
    next(err);
  }
});

// POST /api/v2/matches
router.post('/', authenticateUser, requireAuth, requirePermission('matches.*'), requireClubAccess, async (req, res, next) => {
  try {
    const matchData = req.body;
    if (!matchData.team1 || (!matchData.team2 && !matchData.opp) || !matchData.venue || !matchData.date) {
      return res.status(400).json({ success: false, message: 'Teams, venue, and date are required' });
    }

    matchData.clubId = normalizeClubId(matchData.clubId || req.user.clubId || 'spikers');
    matchData.team2 = matchData.team2 || matchData.opp;
    matchData.opp = matchData.opp || matchData.team2;

    const match = await Match.create(matchData);
    res.status(201).json({ success: true, match, message: 'Match scheduled successfully' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v2/matches/:id
router.put('/:id', authenticateUser, requireAuth, requirePermission('matches.*'), async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

    Object.assign(match, req.body);
    await match.save();

    res.json({ success: true, match, message: 'Match updated successfully' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v2/matches/:id
router.delete('/:id', authenticateUser, requireAuth, requirePermission('matches.*'), async (req, res, next) => {
  try {
    const match = await Match.findByIdAndDelete(req.params.id);
    if (!match) return res.status(404).json({ success: false, message: 'Match not found' });

    // Clean up related match availability records
    await MatchAvailability.deleteMany({ matchId: req.params.id });

    res.json({ success: true, message: 'Match and associated records deleted' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// MATCH AVAILABILITY & SQUAD LINEUPS
// ==========================================

// GET /api/v2/matches/:id/lineup
router.get('/:id/lineup', async (req, res, next) => {
  try {
    const matchId = req.params.id;
    const responses = await MatchAvailability.find({ matchId }).lean();
    const starters = responses.filter(r => r.isStartingLineup);
    const available = responses.filter(r => r.availability === 'Available');

    res.json({ success: true, responses, starters, available });
  } catch (err) {
    next(err);
  }
});

// POST /api/v2/matches/:id/availability
router.post('/:id/availability', authenticateUser, requireAuth, async (req, res, next) => {
  try {
    const matchId = req.params.id;
    const { availability, note } = req.body;
    const userId = req.user._id || req.user.id;
    const username = req.user.username;
    const name = req.user.name || username;

    const record = await MatchAvailability.findOneAndUpdate(
      { matchId, username },
      {
        userId,
        username,
        name,
        availability: availability || 'Available',
        note: note || ''
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, availability: record, message: 'Match availability registered!' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
