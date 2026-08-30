const mongoose = require('mongoose');

const matchAvailabilitySchema = new mongoose.Schema(
  {
    matchId: {
      type: mongoose.Schema.Types.Mixed, // String or ObjectId for versatility
      required: [true, 'Match ID is required'],
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      lowercase: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Player name is required'],
      trim: true
    },
    availability: {
      type: String,
      enum: ['Available', 'Tentative', 'Unavailable'],
      default: 'Available',
      index: true
    },
    note: {
      type: String,
      default: '',
      trim: true
    },
    isStartingLineup: {
      type: Boolean,
      default: false,
      index: true
    },
    position: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

matchAvailabilitySchema.index({ matchId: 1, username: 1 }, { unique: true });
matchAvailabilitySchema.index({ matchId: 1, isStartingLineup: 1 });

const MatchAvailability = mongoose.models.MatchAvailability || mongoose.model('MatchAvailability', matchAvailabilitySchema);

module.exports = MatchAvailability;
