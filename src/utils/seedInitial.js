const bcrypt = require('bcryptjs');
const { Club, Role, User, ClubAbout, ClubContact } = require('../models');
const env = require('../config/env');

const DEFAULT_SYSTEM_ROLES = [
  { name: 'OWNER', title: 'Club Owner / Founder', badgeBg: '#F39C12', badgeText: '#FFFFFF', badgeGlow: 'rgba(243, 156, 18, 0.85)', permissions: ['*'], isSystem: true, description: 'Super-admin with unrestricted platform permissions' },
  { name: 'ADMIN', title: 'Administrator', badgeBg: '#2980B9', badgeText: '#FFFFFF', badgeGlow: 'rgba(41, 128, 185, 0.85)', permissions: ['*'], isSystem: true, description: 'System administrator with full club management permissions' },
  { name: 'COORDINATOR', title: 'Sports Coordinator', badgeBg: '#8E44AD', badgeText: '#FFFFFF', badgeGlow: 'rgba(142, 68, 173, 0.85)', permissions: ['players.*', 'matches.*', 'events.*', 'news.*', 'gallery.*', 'training.*', 'testimonials.*', 'sponsors.*', 'stats.*', 'about.*', 'contact.*', 'applications.*'], isSystem: false, description: 'Club coordinator managing matches, events, news and tryouts' },
  { name: 'CAPTAIN', title: 'Team Captain', badgeBg: '#E67E22', badgeText: '#FFFFFF', badgeGlow: 'rgba(230, 126, 34, 0.85)', permissions: ['matches.*', 'players.view', 'training.*'], isSystem: false, description: 'Team leader with squad and match management' },
  { name: 'STUDENT', title: 'Student Athlete', badgeBg: '#27AE60', badgeText: '#FFFFFF', badgeGlow: 'rgba(39, 174, 96, 0.65)', permissions: ['profile.view', 'profile.edit', 'clubs.join', 'applications.submit'], isSystem: true, description: 'Registered student athlete' }
];

const DEFAULT_CLUBS = [
  {
    clubId: 'spikers',
    name: 'ACEIT Spikers',
    sport: 'Volleyball',
    slug: 'spikers',
    logo: 'spikers-logo.png',
    loaderLogo: 'volleyball-loader.png',
    coverImage: 'banner1.jpg',
    description: 'The official volleyball club of ACEIT. Built on discipline, driven by teamwork, and playing for every point that matters.',
    themeColor: '#F5A623',
    accentColor: '#D97706',
    active: true,
    status: 'active'
  },
  {
    clubId: 'kabaddi',
    name: 'ACEIT Kabaddi',
    sport: 'Kabaddi',
    slug: 'kabaddi',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Kabaddi Club of Arya College of Engineering & IT. Unstoppable raid power, impenetrable defense, and collegiate champions.',
    themeColor: '#C0392B',
    accentColor: '#E74C3C',
    active: true,
    status: 'active'
  },
  {
    clubId: 'dunkers',
    name: 'ACEIT Dunkers',
    sport: 'Basketball',
    slug: 'dunkers',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Basketball Club of ACEIT. Fast-break offenses, lockdown defense, and soaring collegiate hoopers.',
    themeColor: '#E67E22',
    accentColor: '#D35400',
    active: true,
    status: 'active'
  },
  {
    clubId: 'strikers-fc',
    name: 'ACEIT Strikers FC',
    sport: 'Football',
    slug: 'strikers-fc',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Football Club of ACEIT. Tactical mastery, relentless stamina, and championship collegiate soccer.',
    themeColor: '#27AE60',
    accentColor: '#2ECC71',
    active: true,
    status: 'active'
  },
  {
    clubId: 'shuttlers',
    name: 'ACEIT Shuttlers',
    sport: 'Badminton',
    slug: 'shuttlers',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Badminton Club of ACEIT. Lightning reflexes, precision smashes, and tournament agility.',
    themeColor: '#16A085',
    accentColor: '#1ABC9C',
    active: true,
    status: 'active'
  },
  {
    clubId: 'cricket',
    name: 'ACEIT Cricket',
    sport: 'Cricket',
    slug: 'cricket',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Cricket Club of ACEIT. Powerful strokeplay, lethal bowling spells, and collegiate derby champions.',
    themeColor: '#2980B9',
    accentColor: '#3498DB',
    active: true,
    status: 'active'
  }
];

let _seeded = false;

/**
 * Initializes essential foundation records (system roles, default clubs, single Owner)
 * Guaranteed to be idempotent and safe for multi-invocation environments
 */
async function seedInitialDatabase() {
  if (_seeded) return;

  try {
    // 1. Seed Roles
    const roleCount = await Role.countDocuments();
    if (roleCount === 0) {
      await Role.insertMany(DEFAULT_SYSTEM_ROLES);
      console.log('[Database Seed] Initialized default system roles');
    }

    // 2. Seed Clubs
    for (const c of DEFAULT_CLUBS) {
      const exists = await Club.findOne({ $or: [{ clubId: c.clubId }, { slug: c.slug }] });
      if (!exists) {
        await Club.create(c);
        console.log(`[Database Seed] Created default club: ${c.name}`);
      }
    }

    // 3. Seed Owner Account if none exists
    const ownerCount = await User.countDocuments({ role: 'OWNER' });
    if (ownerCount === 0) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(env.OWNER_PASSWORD, salt);

      await User.create({
        name: 'Founder / Super Owner',
        username: env.OWNER_USERNAME,
        email: 'founder@aceit.edu.in',
        rtuRollNo: '00EATFND001',
        passwordHash: hash,
        role: 'OWNER',
        clubId: 'ALL',
        clubs: ['spikers', 'kabaddi', 'cricket', 'dunkers', 'shuttlers', 'strikers-fc'],
        permissions: ['*'],
        active: true
      });
      console.log(`[Database Seed] Created single OWNER account: "${env.OWNER_USERNAME}"`);
    }

    // 4. Seed Default Spikers About & Contact if missing
    const spikersAbout = await ClubAbout.findOne({ clubId: 'spikers' });
    if (!spikersAbout) {
      await ClubAbout.create({
        clubId: 'spikers',
        eyebrow: 'Who we are',
        title: 'Built on the court,\ndefined by character.',
        sub: 'ACEIT Spikers brings together players who train hard, compete fair, and show up for one another — on and off the court.',
        mission: 'To build a competitive volleyball program that develops skilled, disciplined athletes while creating a home for anyone who wants to play, grow, and belong.',
        vision: 'To be recognised as the standard-bearer for collegiate volleyball at ACEIT — a club that wins with class and trains the next generation of captains.'
      });
    }

    const spikersContact = await ClubContact.findOne({ clubId: 'spikers' });
    if (!spikersContact) {
      await ClubContact.create({
        clubId: 'spikers',
        address: 'Arya College of Engineering & IT, Jaipur, Rajasthan',
        email: 'spikers@aceit.edu.in',
        phone: '+91 98765 43210',
        hours: 'Mon–Sat, 6:00 AM – 8:00 PM',
        socials: { insta: '#', fb: '#', yt: '#', wa: '#', x: '#' }
      });
    }

    _seeded = true;
  } catch (err) {
    console.error('[Database Seed Error]', err.message);
  }
}

module.exports = {
  seedInitialDatabase
};
