const express = require('express');
const router = express.Router();
const { Player } = require('../models');
const { authenticateUser, requireAuth, requirePermission, requireClubAccess } = require('../middleware/auth');
const { normalizeClubId } = require('../utils/sanitize');
const { paginate } = require('../utils/pagination');

// GET /api/v2/players
router.get('/', async (req, res, next) => {
  try {
    const clubId = normalizeClubId(req.query.clubId || 'spikers');
    const filter = { active: true };
    if (clubId !== 'all') {
      filter.clubId = clubId;
    }

    const { page, limit } = req.query;
    if (page || limit) {
      const result = await paginate(Player, filter, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { order: 1, createdAt: 1 }
      });
      return res.json({ success: true, ...result });
    }

    const players = await Player.find(filter).sort({ order: 1, createdAt: 1 }).lean();
    res.json({ success: true, players });
  } catch (err) {
    next(err);
  }
});

// POST /api/v2/players
router.post('/', authenticateUser, requireAuth, requirePermission('players.*'), requireClubAccess, async (req, res, next) => {
  try {
    const { name, role, number, clubId, photo, bio, height, weight, experience, order } = req.body;
    if (!name || !role) {
      return res.status(400).json({ success: false, message: 'Player name and role are required' });
    }

    const targetClub = normalizeClubId(clubId || req.user.clubId || 'spikers');

    const player = await Player.create({
      clubId: targetClub,
      name: String(name).trim(),
      role: String(role).trim(),
      number: number || '',
      photo: photo || '',
      bio: bio || '',
      height: height || '',
      weight: weight || '',
      experience: experience || '',
      order: order !== undefined ? parseInt(order, 10) : 0,
      active: true
    });

    res.status(201).json({ success: true, player, message: 'Player added to squad successfully' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v2/players/:id
router.put('/:id', authenticateUser, requireAuth, requirePermission('players.*'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const player = await Player.findById(id);
    if (!player) return res.status(404).json({ success: false, message: 'Player not found' });

    const updates = req.body;
    if (updates.name) player.name = String(updates.name).trim();
    if (updates.role) player.role = String(updates.role).trim();
    if (updates.number !== undefined) player.number = updates.number;
    if (updates.photo !== undefined) player.photo = updates.photo;
    if (updates.bio !== undefined) player.bio = updates.bio;
    if (updates.height !== undefined) player.height = updates.height;
    if (updates.weight !== undefined) player.weight = updates.weight;
    if (updates.experience !== undefined) player.experience = updates.experience;
    if (updates.order !== undefined) player.order = parseInt(updates.order, 10);
    if (updates.active !== undefined) player.active = !!updates.active;
    if (updates.stats !== undefined) player.stats = updates.stats;

    await player.save();
    res.json({ success: true, player, message: 'Player profile updated successfully' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v2/players/:id
router.delete('/:id', authenticateUser, requireAuth, requirePermission('players.*'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const player = await Player.findByIdAndDelete(id);
    if (!player) return res.status(404).json({ success: false, message: 'Player not found' });

    res.json({ success: true, message: 'Player removed from squad successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
