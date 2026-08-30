const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Role identifier is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true
    },
    title: {
      type: String,
      required: [true, 'Role title is required'],
      trim: true
    },
    badgeBg: {
      type: String,
      default: '#8E44AD',
      trim: true
    },
    badgeText: {
      type: String,
      default: '#FFFFFF',
      trim: true
    },
    badgeGlow: {
      type: String,
      default: 'rgba(142, 68, 173, 0.85)',
      trim: true
    },
    permissions: {
      type: [String],
      default: []
    },
    isSystem: {
      type: Boolean,
      default: false,
      index: true
    },
    description: {
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

const Role = mongoose.models.Role || mongoose.model('Role', roleSchema);

module.exports = Role;
