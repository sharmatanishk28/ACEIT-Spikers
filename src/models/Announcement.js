const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Announcement title is required'],
      trim: true
    },
    content: {
      type: String,
      required: [true, 'Announcement content is required'],
      trim: true
    },
    clubId: {
      type: String,
      default: 'all',
      lowercase: true,
      trim: true,
      index: true
    },
    category: {
      type: String,
      enum: ['Urgent', 'Selection', 'Practice', 'Tournament', 'General'],
      default: 'General',
      index: true
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true
    },
    authorName: {
      type: String,
      default: 'Sports Coordinator',
      trim: true
    },
    authorRole: {
      type: String,
      default: 'COORDINATOR',
      trim: true
    },
    authorUsername: {
      type: String,
      default: 'admin',
      trim: true
    },
    expiresAt: {
      type: Date
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

announcementSchema.index({ clubId: 1, isPinned: -1, createdAt: -1 });

const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);

module.exports = Announcement;
