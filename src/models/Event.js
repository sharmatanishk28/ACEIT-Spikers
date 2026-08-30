const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
  {
    clubId: {
      type: String,
      required: [true, 'Club ID is required'],
      lowercase: true,
      trim: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true
    },
    description: {
      type: String,
      default: '',
      trim: true
    },
    date: {
      type: String,
      required: [true, 'Event date is required'],
      trim: true,
      index: true
    },
    time: {
      type: String,
      default: '',
      trim: true
    },
    venue: {
      type: String,
      required: [true, 'Event venue is required'],
      trim: true
    },
    poster: {
      type: String,
      default: '',
      trim: true
    },
    regBtnText: {
      type: String,
      default: 'Register Now',
      trim: true
    },
    regUrl: {
      type: String,
      default: '',
      trim: true
    },
    regEnabled: {
      type: Boolean,
      default: true,
      index: true
    },
    maxParticipants: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
      default: 'upcoming',
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

eventSchema.index({ clubId: 1, date: -1 });

const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);

module.exports = Event;
