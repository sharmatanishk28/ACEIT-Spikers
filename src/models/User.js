const mongoose = require('mongoose');

const userStatsSchema = new mongoose.Schema(
  {
    matchesPlayed: { type: Number, default: 0, min: 0 },
    points: { type: Number, default: 0, min: 0 },
    spikes: { type: Number, default: 0, min: 0 },
    blocks: { type: Number, default: 0, min: 0 },
    aces: { type: Number, default: 0, min: 0 },
    mvpAwards: { type: Number, default: 0, min: 0 },
    mvpPoints: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
);

const userBadgeSchema = new mongoose.Schema(
  {
    badgeKey: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    icon: { type: String, default: '⭐' },
    glow: { type: String, default: 'rgba(241, 196, 15, 0.85)' },
    bg: { type: String, default: '#F1C40F' },
    text: { type: String, default: '#000000' },
    description: { type: String, default: '' },
    awardedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const userAchievementSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    year: { type: String, default: '', trim: true },
    desc: { type: String, default: '', trim: true }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
      match: [/^[a-z0-9_.-]+$/, 'Username can only contain letters, numbers, dots, dashes, and underscores']
    },
    rtuRollNo: {
      type: String,
      trim: true,
      default: '',
      index: true
    },
    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: '',
      index: true
    },
    mobile: {
      type: String,
      trim: true,
      default: ''
    },
    photo: {
      type: String,
      default: '',
      trim: true
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false // Excluded by default for safe queries
    },
    role: {
      type: String,
      default: 'STUDENT',
      uppercase: true,
      trim: true,
      index: true
    },
    clubId: {
      type: String,
      default: 'ALL',
      trim: true
    },
    clubs: {
      type: [String],
      default: ['spikers'],
      index: true
    },
    bio: {
      type: String,
      default: '',
      trim: true
    },
    sport: {
      type: String,
      default: 'Volleyball',
      trim: true
    },
    branch: {
      type: String,
      default: 'Computer Science & Engineering',
      trim: true
    },
    year: {
      type: String,
      default: '3rd Year',
      trim: true
    },
    position: {
      type: String,
      default: 'Outside Hitter',
      trim: true
    },
    jerseyNo: {
      type: String,
      default: '',
      trim: true
    },
    height: {
      type: String,
      default: '',
      trim: true
    },
    achievements: {
      type: [userAchievementSchema],
      default: []
    },
    stats: {
      type: userStatsSchema,
      default: () => ({})
    },
    badges: {
      type: [userBadgeSchema],
      default: []
    },
    permissions: {
      type: [String],
      default: ['profile.view', 'profile.edit', 'clubs.join']
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    lastLoginAt: {
      type: Date
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound indexes for high-speed authentication and filtered queries
userSchema.index({ active: 1, role: 1 });
userSchema.index({ 'stats.mvpPoints': -1 });

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
