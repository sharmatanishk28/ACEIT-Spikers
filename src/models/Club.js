const mongoose = require('mongoose');

const clubSchema = new mongoose.Schema(
  {
    clubId: {
      type: String,
      required: [true, 'Club ID is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Club name is required'],
      trim: true
    },
    sport: {
      type: String,
      required: [true, 'Sport category is required'],
      trim: true
    },
    slug: {
      type: String,
      required: [true, 'Club slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    logo: {
      type: String,
      default: '',
      trim: true
    },
    loaderLogo: {
      type: String,
      default: '',
      trim: true
    },
    coverImage: {
      type: String,
      default: '',
      trim: true
    },
    description: {
      type: String,
      default: '',
      trim: true
    },
    themeColor: {
      type: String,
      default: '#F5A623',
      trim: true
    },
    accentColor: {
      type: String,
      default: '#D97706',
      trim: true
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'archived'],
      default: 'active',
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Composite indexes for fast club queries
clubSchema.index({ active: 1, name: 1 });
clubSchema.index({ sport: 1, status: 1 });

const Club = mongoose.models.Club || mongoose.model('Club', clubSchema);

module.exports = Club;
