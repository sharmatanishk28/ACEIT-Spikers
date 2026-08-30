const mongoose = require('mongoose');

const sponsorSchema = new mongoose.Schema(
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
      required: [true, 'Sponsor name is required'],
      trim: true
    },
    logo: {
      type: String,
      required: [true, 'Sponsor logo URL is required'],
      trim: true
    },
    tier: {
      type: String,
      enum: ['Title', 'Platinum', 'Gold', 'Silver', 'Official Partner'],
      default: 'Official Partner',
      index: true
    },
    website: {
      type: String,
      default: '',
      trim: true
    },
    description: {
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

sponsorSchema.index({ clubId: 1, tier: 1, order: 1 });

const Sponsor = mongoose.models.Sponsor || mongoose.model('Sponsor', sponsorSchema);

module.exports = Sponsor;
