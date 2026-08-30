const express = require('express');
const router = express.Router();
const { Event, EventRsvp } = require('../models');
const { authenticateUser, requireAuth, requirePermission, requireClubAccess } = require('../middleware/auth');
const { normalizeClubId } = require('../utils/sanitize');
const { paginate } = require('../utils/pagination');

// GET /api/v2/events
router.get('/', async (req, res, next) => {
  try {
    const { clubId, status, page, limit } = req.query;
    const filter = {};
    if (clubId && clubId !== 'all') {
      filter.clubId = normalizeClubId(clubId);
    }
    if (status && status !== 'all') {
      filter.status = status;
    }

    if (page || limit) {
      const result = await paginate(Event, filter, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { date: -1, createdAt: -1 }
      });
      return res.json({ success: true, ...result });
    }

    const events = await Event.find(filter).sort({ date: -1, createdAt: -1 }).lean();
    res.json({ success: true, events });
  } catch (err) {
    next(err);
  }
});

// GET /api/v2/events/rsvp-counts
router.get('/rsvp-counts', async (req, res, next) => {
  try {
    const rsvps = await EventRsvp.find({ status: { $ne: 'Cancelled' } }).select('eventId').lean();
    const counts = {};
    rsvps.forEach(r => {
      counts[r.eventId] = (counts[r.eventId] || 0) + 1;
    });
    res.json({ success: true, counts });
  } catch (err) {
    next(err);
  }
});

// GET /api/v2/events/:id
router.get('/:id', async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id).lean();
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
    res.json({ success: true, event });
  } catch (err) {
    next(err);
  }
});

// POST /api/v2/events
router.post('/', authenticateUser, requireAuth, requirePermission('events.*'), requireClubAccess, async (req, res, next) => {
  try {
    const { title, description, date, time, venue, poster, regBtnText, regUrl, regEnabled, clubId } = req.body;
    if (!title || !date || !venue) {
      return res.status(400).json({ success: false, message: 'Title, date, and venue are required' });
    }

    const event = await Event.create({
      clubId: normalizeClubId(clubId || req.user.clubId || 'spikers'),
      title: String(title).trim(),
      description: description || '',
      date: String(date).trim(),
      time: time || '',
      venue: String(venue).trim(),
      poster: poster || '',
      regBtnText: regBtnText || 'Register Now',
      regUrl: regUrl || '',
      regEnabled: regEnabled !== false,
      status: 'upcoming'
    });

    res.status(201).json({ success: true, event, message: 'Event created successfully' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v2/events/:id
router.put('/:id', authenticateUser, requireAuth, requirePermission('events.*'), async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    Object.assign(event, req.body);
    await event.save();

    res.json({ success: true, event, message: 'Event updated successfully' });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v2/events/:id
router.delete('/:id', authenticateUser, requireAuth, requirePermission('events.*'), async (req, res, next) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ success: false, message: 'Event not found' });

    // Clean up registrations
    await EventRsvp.deleteMany({ eventId: req.params.id });

    res.json({ success: true, message: 'Event and registrations deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// EVENT RSVPS
// ==========================================

// POST /api/v2/events/:id/rsvp
router.post('/:id/rsvp', authenticateUser, requireAuth, async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const { eventTitle, teamName, phone } = req.body;
    const userId = req.user._id || req.user.id;
    const username = req.user.username;
    const name = req.user.name || username;
    const email = req.user.email || '';
    const rollNo = req.user.rtuRollNo || '';

    const rsvp = await EventRsvp.findOneAndUpdate(
      { eventId, username },
      {
        eventId,
        eventTitle: eventTitle || '',
        userId,
        username,
        name,
        email,
        phone: phone || req.user.mobile || '',
        rollNo,
        teamName: teamName || '',
        status: 'Registered'
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, rsvp, message: 'Registered for event successfully!' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v2/events/:id/rsvps
router.get('/:id/rsvps', authenticateUser, requireAuth, requirePermission('events.*'), async (req, res, next) => {
  try {
    const rsvps = await EventRsvp.find({ eventId: req.params.id, status: { $ne: 'Cancelled' } }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, rsvps, count: rsvps.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
