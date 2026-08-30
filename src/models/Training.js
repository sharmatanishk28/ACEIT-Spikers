const mongoose = require('mongoose');

const trainingSchema = new mongoose.Schema(
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
      required: [true, 'Training session title is required'],
      trim: true
    },
    icon: {
      type: String,
      default: '🏐',
      trim: true
    },
    time: {
      type: String,
      default: '',
      trim: true
    },
    days: {
      type: [String],
      default: []
    },
    venue: {
      type: String,
      default: 'Indoor Sports Complex',
      trim: true
    },
    coach: {
      type: String,
      default: '',
      trim: true
    },
    desc: {
      type: String,
      default: '',
      trim: true
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

trainingSchema.index({ clubId: 1, order: 1 });

const Training = mongoose.models.Training || mongoose.model('Training', trainingSchema);

module.exports = Training;
