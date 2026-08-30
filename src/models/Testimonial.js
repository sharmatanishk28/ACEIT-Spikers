const mongoose = require('mongoose');

const testimonialSchema = new mongoose.Schema(
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
      required: [true, 'Author name is required'],
      trim: true
    },
    role: {
      type: String,
      default: 'Alumni / Athlete',
      trim: true
    },
    quote: {
      type: String,
      required: [true, 'Testimonial quote is required'],
      trim: true
    },
    avatar: {
      type: String,
      default: '',
      trim: true
    },
    rating: {
      type: Number,
      default: 5,
      min: 1,
      max: 5
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

testimonialSchema.index({ clubId: 1, order: 1 });

const Testimonial = mongoose.models.Testimonial || mongoose.model('Testimonial', testimonialSchema);

module.exports = Testimonial;
