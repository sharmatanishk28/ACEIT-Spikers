const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true
    },
    username: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
      index: true
    },
    clubSlug: {
      type: String,
      required: [true, 'Target club is required'],
      lowercase: true,
      trim: true,
      default: 'spikers',
      index: true
    },
    name: {
      type: String,
      required: [true, 'Applicant name is required'],
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Applicant email is required'],
      lowercase: true,
      trim: true,
      index: true
    },
    phone: {
      type: String,
      default: '',
      trim: true
    },
    position: {
      type: String,
      default: 'Player',
      trim: true
    },
    experience: {
      type: String,
      default: 'Beginner',
      trim: true
    },
    message: {
      type: String,
      default: '',
      trim: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Reviewed', 'Accepted', 'Rejected'],
      default: 'Pending',
      index: true
    },
    source: {
      type: String,
      default: 'Website Form',
      trim: true
    },
    adminFeedback: {
      type: String,
      default: '',
      trim: true
    },
    tallyEventId: {
      type: String,
      default: null,
      sparse: true,
      index: true
    },
    tallyResponseId: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

applicationSchema.index({ clubSlug: 1, status: 1, createdAt: -1 });

const Application = mongoose.models.Application || mongoose.model('Application', applicationSchema);

module.exports = Application;
