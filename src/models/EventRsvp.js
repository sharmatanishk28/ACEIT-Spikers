const mongoose = require('mongoose');

const eventRsvpSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Event ID is required'],
      index: true
    },
    eventTitle: {
      type: String,
      default: '',
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    username: {
      type: String,
      lowercase: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Attendee name is required'],
      trim: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: ''
    },
    phone: {
      type: String,
      trim: true,
      default: ''
    },
    rollNo: {
      type: String,
      trim: true,
      default: ''
    },
    teamName: {
      type: String,
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: ['Registered', 'Attending', 'Cancelled'],
      default: 'Registered',
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

eventRsvpSchema.index({ eventId: 1, userId: 1 });
eventRsvpSchema.index({ eventId: 1, username: 1 });

const EventRsvp = mongoose.models.EventRsvp || mongoose.model('EventRsvp', eventRsvpSchema);

module.exports = EventRsvp;
