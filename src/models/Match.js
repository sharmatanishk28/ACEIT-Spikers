const mongoose = require('mongoose');

const setScoreSchema = new mongoose.Schema(
  {
    set: { type: Number, required: true },
    team1: { type: Number, required: true },
    team2: { type: Number, required: true },
    winner: { type: String, default: '' }
  },
  { _id: false }
);

const playByPlaySchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    time: { type: String, default: '' },
    text: { type: String, required: true },
    type: { type: String, default: 'point' },
    scoringTeam: { type: String, enum: ['home', 'away', 'team1', 'team2'], default: 'home' },
    playerUsername: { type: String, default: '' },
    score: { type: String, default: '' },
    scoreHome: { type: Number, default: 0 },
    scoreAway: { type: Number, default: 0 }
  },
  { _id: false }
);

const matchSchema = new mongoose.Schema(
  {
    clubId: {
      type: String,
      required: [true, 'Club ID is required'],
      lowercase: true,
      trim: true,
      index: true
    },
    sport: {
      type: String,
      enum: ['volleyball', 'cricket', 'football', 'basketball', 'kabaddi', 'badminton', 'other'],
      default: 'volleyball',
      index: true
    },
    team1: {
      type: String,
      required: [true, 'Team 1 (Home) name is required'],
      trim: true
    },
    team2: {
      type: String,
      required: [true, 'Team 2 (Away/Opponent) name is required'],
      trim: true
    },
    opp: {
      type: String,
      trim: true
    },
    team1Logo: {
      type: String,
      default: '',
      trim: true
    },
    team2Logo: {
      type: String,
      default: '',
      trim: true
    },
    venue: {
      type: String,
      required: [true, 'Match venue is required'],
      trim: true
    },
    date: {
      type: String,
      required: [true, 'Match date is required'],
      trim: true,
      index: true
    },
    time: {
      type: String,
      default: '',
      trim: true
    },
    status: {
      type: String,
      enum: ['upcoming', 'live', 'completed', 'cancelled'],
      default: 'upcoming',
      index: true
    },
    winner: {
      type: String,
      enum: ['team1', 'team2', 'draw', 'none'],
      default: 'none'
    },
    isLive: {
      type: Boolean,
      default: false,
      index: true
    },
    score1: {
      type: Number,
      default: 0
    },
    score2: {
      type: Number,
      default: 0
    },
    team1Score: {
      type: Number,
      default: 0
    },
    team2Score: {
      type: Number,
      default: 0
    },
    setsWonHome: {
      type: Number,
      default: 0
    },
    setsWonAway: {
      type: Number,
      default: 0
    },
    sets: {
      type: String,
      default: ''
    },
    currentPeriod: {
      type: Number,
      default: 1
    },
    servingTeam: {
      type: String,
      enum: ['home', 'away', 'team1', 'team2'],
      default: 'home'
    },
    scoreSummary: {
      type: String,
      default: ''
    },
    setScores: {
      type: [setScoreSchema],
      default: []
    },
    sportStats: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({ home: {}, away: {} })
    },
    playByPlay: {
      type: [playByPlaySchema],
      default: []
    },
    mvpUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    mvpUsername: {
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

// Auto-sync opp and team2 aliases before validation
matchSchema.pre('validate', function (next) {
  if (!this.opp && this.team2) this.opp = this.team2;
  if (!this.team2 && this.opp) this.team2 = this.opp;
  next();
});

matchSchema.index({ clubId: 1, status: 1, date: -1 });

const Match = mongoose.models.Match || mongoose.model('Match', matchSchema);

module.exports = Match;
