const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema(
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
      required: [true, 'Article title is required'],
      trim: true
    },
    summary: {
      type: String,
      default: '',
      trim: true
    },
    content: {
      type: String,
      required: [true, 'Article content is required']
    },
    author: {
      type: String,
      default: 'Editorial Team',
      trim: true
    },
    image: {
      type: String,
      default: '',
      trim: true
    },
    tags: {
      type: [String],
      default: [],
      index: true
    },
    publishedAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true
    },
    views: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

newsSchema.index({ clubId: 1, publishedAt: -1 });

const News = mongoose.models.News || mongoose.model('News', newsSchema);

module.exports = News;
