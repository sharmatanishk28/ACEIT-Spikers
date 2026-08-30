const mongoose = require('mongoose');

const clubSocialsSchema = new mongoose.Schema(
  {
    insta: { type: String, default: '#', trim: true },
    fb: { type: String, default: '#', trim: true },
    yt: { type: String, default: '#', trim: true },
    wa: { type: String, default: '#', trim: true },
    x: { type: String, default: '#', trim: true }
  },
  { _id: false }
);

const clubContactSchema = new mongoose.Schema(
  {
    clubId: {
      type: String,
      required: [true, 'Club ID is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true
    },
    address: {
      type: String,
      default: 'Arya College of Engineering & IT, SP-42, RIICO Industrial Area, Kukas, Jaipur, Rajasthan 302028',
      trim: true
    },
    email: {
      type: String,
      default: 'sports@aceit.edu.in',
      trim: true
    },
    phone: {
      type: String,
      default: '+91 98765 43210',
      trim: true
    },
    hours: {
      type: String,
      default: 'Mon–Sat, 6:00 AM – 8:00 PM',
      trim: true
    },
    socials: {
      type: clubSocialsSchema,
      default: () => ({})
    },
    mapEmbedUrl: {
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

const ClubContact = mongoose.models.ClubContact || mongoose.model('ClubContact', clubContactSchema);

module.exports = ClubContact;
