const express = require('express');
const router = express.Router();
const { News, Gallery, Training, Sponsor, Testimonial, ClubAbout, ClubContact, Announcement, Notification, Application } = require('../models');
const { authenticateUser, requireAuth, requirePermission, requireClubAccess } = require('../middleware/auth');
const { normalizeClubId } = require('../utils/sanitize');
const { paginate } = require('../utils/pagination');
const { uploadToCloudinary } = require('../config/cloudinary');

// ==========================================
// MEDIA UPLOAD
// ==========================================
router.post('/upload', async (req, res, next) => {
  try {
    const { image, file, dataUrl, folder } = req.body || {};
    const payload = image || file || dataUrl;
    if (!payload) {
      return res.status(400).json({ success: false, message: 'Image payload is required' });
    }

    const result = await uploadToCloudinary(payload, folder || 'aceit_spikers');
    if (!result.success && result.error) {
      return res.status(500).json({ success: false, message: result.error });
    }

    res.json({
      success: true,
      url: result.url,
      publicId: result.public_id || null,
      format: result.format || null,
      width: result.width || null,
      height: result.height || null
    });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// NEWS & MATCH REPORTS
// ==========================================
router.get('/news', async (req, res, next) => {
  try {
    const clubId = normalizeClubId(req.query.clubId || 'spikers');
    const filter = {};
    if (clubId !== 'all') filter.clubId = clubId;

    const { page, limit } = req.query;
    if (page || limit) {
      const result = await paginate(News, filter, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { publishedAt: -1 }
      });
      return res.json({ success: true, ...result });
    }

    const news = await News.find(filter).sort({ publishedAt: -1 }).lean();
    res.json({ success: true, news });
  } catch (err) {
    next(err);
  }
});

router.post('/news', authenticateUser, requireAuth, requirePermission('news.*'), requireClubAccess, async (req, res, next) => {
  try {
    const item = await News.create(req.body);
    res.status(201).json({ success: true, item, message: 'News published successfully' });
  } catch (err) {
    next(err);
  }
});

router.put('/news/:id', authenticateUser, requireAuth, requirePermission('news.*'), async (req, res, next) => {
  try {
    const item = await News.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'News item not found' });
    res.json({ success: true, item });
  } catch (err) {
    next(err);
  }
});

router.delete('/news/:id', authenticateUser, requireAuth, requirePermission('news.*'), async (req, res, next) => {
  try {
    const item = await News.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'News item not found' });
    res.json({ success: true, message: 'News deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// GALLERY & PHOTOS
// ==========================================
router.get('/gallery', async (req, res, next) => {
  try {
    const clubId = normalizeClubId(req.query.clubId || 'spikers');
    const filter = {};
    if (clubId !== 'all') filter.clubId = clubId;
    if (req.query.category && req.query.category !== 'all') filter.category = req.query.category;

    const gallery = await Gallery.find(filter).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, gallery });
  } catch (err) {
    next(err);
  }
});

router.post('/gallery', authenticateUser, requireAuth, requirePermission('gallery.*'), requireClubAccess, async (req, res, next) => {
  try {
    const item = await Gallery.create(req.body);
    res.status(201).json({ success: true, item, message: 'Photo added to gallery' });
  } catch (err) {
    next(err);
  }
});

router.delete('/gallery/:id', authenticateUser, requireAuth, requirePermission('gallery.*'), async (req, res, next) => {
  try {
    const item = await Gallery.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Gallery item not found' });
    res.json({ success: true, message: 'Photo deleted from gallery' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// TRAINING SESSIONS
// ==========================================
router.get('/training', async (req, res, next) => {
  try {
    const clubId = normalizeClubId(req.query.clubId || 'spikers');
    const filter = { active: true };
    if (clubId !== 'all') filter.clubId = clubId;

    const training = await Training.find(filter).sort({ order: 1 }).lean();
    res.json({ success: true, training });
  } catch (err) {
    next(err);
  }
});

router.post('/training', authenticateUser, requireAuth, requirePermission('training.*'), requireClubAccess, async (req, res, next) => {
  try {
    const session = await Training.create(req.body);
    res.status(201).json({ success: true, training: session, message: 'Training session created' });
  } catch (err) {
    next(err);
  }
});

router.delete('/training/:id', authenticateUser, requireAuth, requirePermission('training.*'), async (req, res, next) => {
  try {
    await Training.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Training session deleted' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// SPONSORS
// ==========================================
router.get('/sponsors', async (req, res, next) => {
  try {
    const clubId = normalizeClubId(req.query.clubId || 'spikers');
    const filter = { active: true };
    if (clubId !== 'all') filter.clubId = clubId;

    const sponsors = await Sponsor.find(filter).sort({ order: 1 }).lean();
    res.json({ success: true, sponsors });
  } catch (err) {
    next(err);
  }
});

router.post('/sponsors', authenticateUser, requireAuth, requirePermission('sponsors.*'), requireClubAccess, async (req, res, next) => {
  try {
    const item = await Sponsor.create(req.body);
    res.status(201).json({ success: true, item, message: 'Sponsor added' });
  } catch (err) {
    next(err);
  }
});

router.delete('/sponsors/:id', authenticateUser, requireAuth, requirePermission('sponsors.*'), async (req, res, next) => {
  try {
    await Sponsor.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Sponsor deleted' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// TESTIMONIALS & QUOTES
// ==========================================
router.get('/testimonials', async (req, res, next) => {
  try {
    const clubId = normalizeClubId(req.query.clubId || 'spikers');
    const filter = { active: true };
    if (clubId !== 'all') filter.clubId = clubId;

    const testimonials = await Testimonial.find(filter).sort({ order: 1 }).lean();
    res.json({ success: true, testimonials });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// CLUB ABOUT & CONTACT
// ==========================================
router.get('/about', async (req, res, next) => {
  try {
    const clubId = normalizeClubId(req.query.clubId || 'spikers');
    const about = await ClubAbout.findOne({ clubId }).lean();
    res.json({ success: true, about: about || {} });
  } catch (err) {
    next(err);
  }
});

router.post('/about', authenticateUser, requireAuth, requirePermission('about.*'), async (req, res, next) => {
  try {
    const clubId = normalizeClubId(req.body.clubId || req.query.clubId || 'spikers');
    const about = await ClubAbout.findOneAndUpdate({ clubId }, req.body, { upsert: true, new: true });
    res.json({ success: true, about, message: 'About details updated' });
  } catch (err) {
    next(err);
  }
});

router.get('/contact', async (req, res, next) => {
  try {
    const clubId = normalizeClubId(req.query.clubId || 'spikers');
    const contact = await ClubContact.findOne({ clubId }).lean();
    res.json({ success: true, contact: contact || {} });
  } catch (err) {
    next(err);
  }
});

router.post('/contact', authenticateUser, requireAuth, requirePermission('contact.*'), async (req, res, next) => {
  try {
    const clubId = normalizeClubId(req.body.clubId || req.query.clubId || 'spikers');
    const contact = await ClubContact.findOneAndUpdate({ clubId }, req.body, { upsert: true, new: true });
    res.json({ success: true, contact, message: 'Contact coordinates updated' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// ANNOUNCEMENTS & NOTICE BOARD
// ==========================================
router.get('/announcements', async (req, res, next) => {
  try {
    const { clubId, category } = req.query;
    const filter = {};
    if (clubId && clubId !== 'all') {
      filter.$or = [{ clubId: 'all' }, { clubId: normalizeClubId(clubId) }];
    }
    if (category && category !== 'all') filter.category = category;

    const announcements = await Announcement.find(filter).sort({ isPinned: -1, createdAt: -1 }).lean();
    res.json({ success: true, announcements });
  } catch (err) {
    next(err);
  }
});

router.post('/announcements', authenticateUser, requireAuth, requirePermission('news.*'), async (req, res, next) => {
  try {
    const item = await Announcement.create({
      ...req.body,
      authorName: req.user.name || req.user.username,
      authorUsername: req.user.username
    });
    res.status(201).json({ success: true, announcement: item, message: 'Announcement posted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
