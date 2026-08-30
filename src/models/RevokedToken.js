const mongoose = require('mongoose');

const revokedTokenSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0 // MongoDB TTL index: automatically deletes document when current time >= expiresAt
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

const RevokedToken = mongoose.models.RevokedToken || mongoose.model('RevokedToken', revokedTokenSchema);

module.exports = RevokedToken;
