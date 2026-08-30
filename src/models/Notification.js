const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientUsername: {
      type: String,
      required: [true, 'Recipient username is required'],
      lowercase: true,
      trim: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true
    },
    type: {
      type: String,
      enum: ['selection', 'badge', 'application', 'match', 'broadcast'],
      default: 'broadcast',
      index: true
    },
    linkUrl: {
      type: String,
      default: '',
      trim: true
    },
    read: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

notificationSchema.index({ recipientUsername: 1, read: 1, createdAt: -1 });

const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

module.exports = Notification;
