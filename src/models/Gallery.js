const mongoose = require('mongoose');

const gallerySchema = new mongoose.Schema(
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
      default: '',
      trim: true
    },
    caption: {
      type: String,
      default: '',
      trim: true
    },
    imageUrl: {
      type: String,
      required: [true, 'Image URL is required'],
      trim: true
    },
    thumbnailUrl: {
      type: String,
      default: '',
      trim: true
    },
    publicId: {
      type: String,
      default: '',
      trim: true
    },
    category: {
      type: String,
      default: 'Matches',
      trim: true,
      index: true
    },
    tags: {
      type: [String],
      default: []
    },
    width: {
      type: Number
    },
    height: {
      type: Number
    },
    format: {
      type: String,
      trim: true
    },
    bytes: {
      type: Number
    },
    order: {
      type: Number,
      default: 0,
      index: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

gallerySchema.index({ clubId: 1, category: 1, createdAt: -1 });
gallerySchema.index({ clubId: 1, order: 1 });

const Gallery = mongoose.models.Gallery || mongoose.model('Gallery', gallerySchema);

module.exports = Gallery;
