const express = require('express');
const router = express.Router();
const { Club } = require('../models');
const { authenticateUser, requireAuth, requirePermission, requireClubAccess } = require('../middleware/auth');
const { apiCache, clearApiCache } = require('../middleware/cache');
const { paginate } = require('../utils/pagination');

// GET /api/v2/clubs
router.get('/', apiCache(60), async (req, res, next) => {
  try {
    const { sport, active, page, limit } = req.query;
    let clubs = await Club.find({}).sort({ name: 1 }).lean();
    if (!clubs || clubs.length === 0) {
      clubs = require('../../server').localClubs || [];
    }
    if (sport) {
      const s = String(sport).toLowerCase().trim();
      clubs = clubs.filter(c => (c.sport || '').toLowerCase() === s);
    }
    if (active !== undefined) {
      const a = active === 'true';
      clubs = clubs.filter(c => c.active === a);
    }
    if (page || limit) {
      const p = parseInt(page, 10) || 1;
      const l = parseInt(limit, 10) || 10;
      const total = clubs.length;
      const paginated = clubs.slice((p - 1) * l, p * l);
      return res.json({
        success: true,
        data: paginated,
        clubs: paginated,
        pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) }
      });
    }
    res.json({ success: true, data: clubs, clubs });
  } catch (err) {
    next(err);
  }
});

// GET /api/v2/clubs/:id
router.get('/:id', apiCache(30), async (req, res, next) => {
  try {
    const { id } = req.params;
    const cleanId = String(id).toLowerCase().trim();

    const club = await Club.findOne({
      $or: [{ clubId: cleanId }, { slug: cleanId }]
    }).lean();

    if (!club) return res.status(404).json({ success: false, message: 'Club not found' });
    res.json({ success: true, club });
  } catch (err) {
    next(err);
  }
});

// POST /api/v2/clubs
router.post('/', authenticateUser, requireAuth, requirePermission('clubs.create'), async (req, res, next) => {
  try {
    const { clubId, name, sport, slug, logo, loaderLogo, coverImage, description, themeColor, accentColor, active, status } = req.body;
    if (!name || !sport) {
      return res.status(400).json({ success: false, message: 'Club Name and Sport are required' });
    }

    const cleanSlug = (slug || clubId || (name + '-' + sport)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const cleanClubId = (clubId || cleanSlug).toLowerCase().trim();

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
      themeColor: themeColor || '#F5A623',
      accentColor: accentColor || '#D97706',
      active: active !== undefined ? !!active : true,
      status: status || 'active'
    });

    clearApiCache('/clubs');
    res.status(201).json({ success: true, club, message: 'Club created successfully' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v2/clubs/:id
router.put('/:id', authenticateUser, requireAuth, requirePermission('clubs.edit'), requireClubAccess, async (req, res, next) => {
  try {
    const { id } = req.params;
    const cleanId = String(id).toLowerCase().trim();

    const club = await Club.findOne({ $or: [{ clubId: cleanId }, { slug: cleanId }] });
    if (!club) return res.status(404).json({ success: false, message: 'Club not found' });

    const updates = req.body;
    if (updates.slug && updates.slug !== club.slug) {
      const cleanSlug = updates.slug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const conflict = await Club.findOne({ slug: cleanSlug, _id: { $ne: club._id } });
      if (conflict) return res.status(400).json({ success: false, message: 'Club slug already taken.' });
      club.slug = cleanSlug;
    }

    if (updates.name) club.name = String(updates.name).trim();
    if (updates.sport) club.sport = String(updates.sport).trim();
    if (updates.logo !== undefined) club.logo = updates.logo;
    if (updates.loaderLogo !== undefined) club.loaderLogo = updates.loaderLogo;
    if (updates.coverImage !== undefined) club.coverImage = updates.coverImage;
    if (updates.description !== undefined) club.description = updates.description;
    if (updates.themeColor !== undefined) club.themeColor = updates.themeColor;
    if (updates.accentColor !== undefined) club.accentColor = updates.accentColor;
    if (updates.active !== undefined) club.active = !!updates.active;
    if (updates.status !== undefined) club.status = updates.status;

    await club.save();
    clearApiCache('/clubs');
    res.json({ success: true, club, message: 'Club updated successfully' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v2/clubs/:id
router.delete('/:id', authenticateUser, requireAuth, requirePermission('clubs.delete'), requireClubAccess, async (req, res, next) => {
  try {
    const { id } = req.params;
    const cleanId = String(id).toLowerCase().trim();

    if (cleanId === 'spikers' || cleanId === 'aceit-spikers') {
      return res.status(400).json({ success: false, message: 'Cannot delete primary club ACEIT Spikers.' });
    }

    const club = await Club.findOneAndDelete({ $or: [{ clubId: cleanId }, { slug: cleanId }] });
    if (!club) return res.status(404).json({ success: false, message: 'Club not found' });

    clearApiCache('/clubs');
    res.json({ success: true, message: 'Club deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
