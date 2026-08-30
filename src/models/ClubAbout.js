const mongoose = require('mongoose');

const clubValueSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    desc: { type: String, required: true, trim: true },
    icon: { type: String, default: '🏆', trim: true }
  },
  { _id: false }
);

const clubStatItemSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    val: { type: mongoose.Schema.Types.Mixed, required: true },
    icon: { type: String, default: '⚡', trim: true }
  },
  { _id: false }
);

const clubAboutSchema = new mongoose.Schema(
  {
    clubId: {
      type: String,
      required: [true, 'Club ID is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    eyebrow: {
      type: String,
      default: 'Who we are',
      trim: true
    },
    title: {
      type: String,
      default: 'Built on the court,\ndefined by character.',
      trim: true
    },
    sub: {
      type: String,
      default: 'ACEIT Sports brings together athletes who train hard, compete fair, and show up for one another.',
      trim: true
    },
    mission: {
      type: String,
      default: 'To build a competitive athletic program that develops skilled, disciplined athletes while creating a collegiate home.',
      trim: true
    },
    vision: {
      type: String,
      default: 'To be recognised as the standard-bearer for collegiate athletics at Arya College of Engineering & IT.',
      trim: true
    },
    history: {
      type: String,
      default: '',
      trim: true
    },
    values: {
      type: [clubValueSchema],
      default: []
    },
    stats: {
      type: [clubStatItemSchema],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

const ClubAbout = mongoose.models.ClubAbout || mongoose.model('ClubAbout', clubAboutSchema);

module.exports = ClubAbout;
