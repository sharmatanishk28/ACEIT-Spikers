const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema(
  {
    clubId: {
      type: String,
      required: [true, 'Club ID is required'],
      lowercase: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Player name is required'],
      trim: true
    },
    role: {
      type: String,
      required: [true, 'Playing position/role is required'],
      trim: true
    },
    number: {
      type: mongoose.Schema.Types.Mixed,
      default: '',
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    photo: {
      type: String,
      default: '',
      trim: true
    },
    bio: {
      type: String,
      default: '',
      trim: true
    },
    height: {
      type: String,
      default: '',
      trim: true
    },
    weight: {
      type: String,
      default: '',
      trim: true
    },
    experience: {
      type: String,
      default: '',
      trim: true
    },
    stats: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
    },
    order: {
      type: Number,
      default: 0,
      index: true
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

playerSchema.index({ clubId: 1, order: 1 });
playerSchema.index({ clubId: 1, active: 1 });

const Player = mongoose.models.Player || mongoose.model('Player', playerSchema);

module.exports = Player;
