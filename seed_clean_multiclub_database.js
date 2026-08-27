const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
require('dotenv').config();

const DATA_FILE = path.join(__dirname, 'data.json');

// MongoDB Models
const clubDocSchema = new mongoose.Schema({
  key: { type: String, default: 'main' },
  team: { type: Array, default: [] },
  matches: { type: Array, default: [] },
  news: { type: Array, default: [] },
  sponsors: { type: Array, default: [] },
  testimonials: { type: Array, default: [] },
  stats: { type: Array, default: [] },
  gallery: { type: Array, default: [] },
  events: { type: Array, default: [] },
  training: { type: Array, default: [] },
  slideshow: { type: Array, default: [] },
  about: { type: Object, default: {} },
  contact: { type: Object, default: {} },
  abouts: { type: Object, default: {} },
  contacts: { type: Object, default: {} },
  deletedCategories: { type: Object, default: {} },
  categories: { type: Object, default: {} },
  customCategories: { type: Object, default: {} },
  applications: { type: Array, default: [] },
  pin: { type: String, default: '2026' }
}, { timestamps: true });

const ClubDoc = mongoose.models.ClubDoc || mongoose.model('ClubDoc', clubDocSchema);

const clubSchema = new mongoose.Schema({
  clubId: { type: String, required: true },
  name: { type: String, required: true },
  sport: { type: String, required: true },
  slug: { type: String, required: true },
  logo: { type: String, default: '' },
  loaderLogo: { type: String, default: '' },
  coverImage: { type: String, default: '' },
  description: { type: String, default: '' },
  themeColor: { type: String, default: '' },
  accentColor: { type: String, default: '' },
  active: { type: Boolean, default: true },
  status: { type: String, default: 'active' }
}, { timestamps: true });

const Club = mongoose.models.Club || mongoose.model('Club', clubSchema);

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  badgeBg: { type: String, default: '#27AE60' },
  badgeText: { type: String, default: '#FFFFFF' },
  badgeGlow: { type: String, default: 'rgba(39, 174, 96, 0.65)' },
  permissions: { type: [String], default: [] },
  isSystem: { type: Boolean, default: false }
}, { timestamps: true });

const Role = mongoose.models.Role || mongoose.model('Role', roleSchema);

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  rtuRollNo: { type: String, default: '' },
  email: { type: String, default: '' },
  mobile: { type: String, default: '' },
  photo: { type: String, default: '' },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'STUDENT' },
  clubId: { type: String, default: 'ALL' },
  clubs: { type: [String], default: ['spikers'] },
  bio: { type: String, default: '' },
  sport: { type: String, default: 'Volleyball' },
  branch: { type: String, default: 'Computer Science & Engineering' },
  year: { type: String, default: '3rd Year' },
  position: { type: String, default: 'Outside Hitter' },
  jerseyNo: { type: String, default: '' },
  height: { type: String, default: '' },
  achievements: { type: Array, default: [] },
  permissions: { type: [String], default: [] },
  active: { type: Boolean, default: true },
  stats: { type: Object, default: () => ({ matchesPlayed: 0, points: 0, spikes: 0, blocks: 0, aces: 0, mvpAwards: 0, mvpPoints: 0 }) },
  badges: { type: Array, default: [] },
  lastLoginAt: { type: Date, default: null }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

const defaultClubsList = [
  {
    clubId: 'spikers',
    slug: 'spikers',
    name: 'ACEIT Spikers',
    sport: 'Volleyball',
    logo: 'spikers-logo.png',
    loaderLogo: 'volleyball-loader.png',
    coverImage: 'banner1.jpg',
    description: 'The official volleyball club of ACEIT. Built on discipline, driven by teamwork, and playing for every point that matters.',
    themeColor: '#F5A623',
    accentColor: '#FF5A1F',
    active: true,
    status: 'active'
  },
  {
    clubId: 'kabaddi',
    slug: 'kabaddi',
    name: 'ACEIT Kabaddi',
    sport: 'Kabaddi',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Kabaddi Club of Arya College of Engineering & IT. Unstoppable raid power, impenetrable defense, and collegiate champions.',
    themeColor: '#C0392B',
    accentColor: '#E74C3C',
    active: true,
    status: 'active'
  },
  {
    clubId: 'cricket',
    slug: 'cricket',
    name: 'ACEIT Cricket',
    sport: 'Cricket',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Cricket Club of ACEIT. Powerful strokeplay, lethal bowling spells, and collegiate derby champions.',
    themeColor: '#1ABC9C',
    accentColor: '#16A085',
    active: true,
    status: 'active'
  },
  {
    clubId: 'dunkers',
    slug: 'dunkers',
    name: 'ACEIT Dunkers',
    sport: 'Basketball',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Basketball Club of ACEIT. Fast-break offenses, lockdown defense, and soaring collegiate hoopers.',
    themeColor: '#E67E22',
    accentColor: '#D35400',
    active: true,
    status: 'active'
  },
  {
    clubId: 'shuttlers',
    slug: 'shuttlers',
    name: 'ACEIT Shuttlers',
    sport: 'Badminton',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Badminton Club of ACEIT. Lightning reflexes, precision smashes, and tournament agility.',
    themeColor: '#8E44AD',
    accentColor: '#9B59B6',
    active: true,
    status: 'active'
  },
  {
    clubId: 'strikers-fc',
    slug: 'strikers-fc',
    name: 'ACEIT Strikers FC',
    sport: 'Football',
    logo: '',
    coverImage: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80',
    description: 'Official Football Club of ACEIT. Tactical mastery, relentless stamina, and championship collegiate soccer.',
    themeColor: '#27AE60',
    accentColor: '#1E8449',
    active: true,
    status: 'active'
  }
];

const defaultRolesList = [
  { name: 'OWNER', title: 'Club Owner / Founder', badgeBg: '#F39C12', badgeText: '#FFFFFF', badgeGlow: 'rgba(243, 156, 18, 0.85)', permissions: ['*'], isSystem: true, description: 'Super-admin with unrestricted permissions across all clubs' },
  { name: 'ADMIN', title: 'Administrator', badgeBg: '#2980B9', badgeText: '#FFFFFF', badgeGlow: 'rgba(41, 128, 185, 0.85)', permissions: ['*'], isSystem: true, description: 'Club administrator managing team roster, matches, news, and operations' },
  { name: 'COORDINATOR', title: 'Sports Coordinator', badgeBg: '#8E44AD', badgeText: '#FFFFFF', badgeGlow: 'rgba(142, 68, 173, 0.85)', permissions: ['players.*', 'matches.*', 'events.*', 'news.*', 'gallery.*', 'training.*', 'testimonials.*', 'sponsors.*', 'stats.*', 'about.*', 'contact.*', 'applications.*'], isSystem: false, description: 'Club coordinator managing matches, events, news and tryouts' },
  { name: 'CAPTAIN', title: 'Team Captain', badgeBg: '#E67E22', badgeText: '#FFFFFF', badgeGlow: 'rgba(230, 126, 34, 0.85)', permissions: ['matches.*', 'players.view', 'training.*'], isSystem: false, description: 'Team captain with squad and live match control' },
  { name: 'STUDENT', title: 'Student Athlete', badgeBg: '#27AE60', badgeText: '#FFFFFF', badgeGlow: 'rgba(39, 174, 96, 0.65)', permissions: ['profile.view', 'profile.edit', 'clubs.join', 'applications.submit'], isSystem: true, description: 'Registered student sports profile' }
];

async function generateCleanDatabase() {
  console.log('--- Generating Clean Multi-Club Dataset ---');

  const now = new Date();
  function addDays(n) { const r = new Date(now); r.setDate(r.getDate() + n); return r.toISOString(); }

  // 1. Players across all 6 clubs
  const team = [
    // Volleyball (ACEIT Spikers) - Real Roster
    { id: 'p_spk_1', n: 'Shubham Patidar', num: 1, pos: 'Captain / Outside Hitter', cat: 'Boys Team', h: "6'1\"", exp: '4 yrs', cap: true, insta: 'shubham_spikers', photo: '', clubId: 'spikers' },
    { id: 'p_spk_2', n: 'Arjun Verma', num: 5, pos: 'Setter', cat: 'Boys Team', h: "5'10\"", exp: '3 yrs', cap: false, insta: 'arjun_setter', photo: '', clubId: 'spikers' },
    { id: 'p_spk_3', n: 'Ananya Sharma', num: 8, pos: 'Outside Hitter', cat: 'Girls Team', h: "5'9\"", exp: '2 yrs', cap: true, insta: 'ananya_vball', photo: '', clubId: 'spikers' },
    { id: 'p_spk_4', n: 'Rohan Mehta', num: 9, pos: 'Middle Blocker', cat: 'Boys Team', h: "6'3\"", exp: '2 yrs', cap: false, insta: 'rohan_block', photo: '', clubId: 'spikers' },
    { id: 'p_spk_5', n: 'Karan Singh', num: 11, pos: 'Libero', cat: 'Boys Team', h: "5'8\"", exp: '3 yrs', cap: false, insta: 'karan_libero', photo: '', clubId: 'spikers' },
    { id: 'p_spk_6', n: 'Priya Rathore', num: 15, pos: 'Setter', cat: 'Girls Team', h: "5'7\"", exp: '2 yrs', cap: false, insta: 'priya_setter', photo: '', clubId: 'spikers' },
    { id: 'p_spk_7', n: 'Aditya Rao', num: 14, pos: 'Opposite', cat: 'Boys Team', h: "6'0\"", exp: '2 yrs', cap: false, insta: 'aditya_spk', photo: '', clubId: 'spikers' },

    // Kabaddi (ACEIT Kabaddi)
    { id: 'p_kbd_1', n: 'Pardeep Narwal ACE', num: 9, pos: 'Lead Raider', cat: 'Raiders', h: "5'11\"", exp: '4 yrs', cap: true, insta: 'pardeep_kbd', photo: '', clubId: 'kabaddi' },
    { id: 'p_kbd_2', n: 'Sandeep Dhull', num: 3, pos: 'Left Corner Defender', cat: 'Defenders', h: "5'9\"", exp: '3 yrs', cap: false, insta: 'sandeep_corner', photo: '', clubId: 'kabaddi' },
    { id: 'p_kbd_3', n: 'Monu Goyat', num: 7, pos: 'Right Raider', cat: 'Raiders', h: "5'10\"", exp: '3 yrs', cap: false, insta: 'monu_raid', photo: '', clubId: 'kabaddi' },
    { id: 'p_kbd_4', n: 'Ravinder Pahal', num: 4, pos: 'Right Corner Defender', cat: 'Defenders', h: "5'10\"", exp: '4 yrs', cap: false, insta: 'ravinder_pahal', photo: '', clubId: 'kabaddi' },
    { id: 'p_kbd_5', n: 'Vikas Kandola', num: 11, pos: 'Running Hand Touch Specialist', cat: 'Raiders', h: "5'8\"", exp: '2 yrs', cap: false, insta: 'vikas_k', photo: '', clubId: 'kabaddi' },

    // Cricket (ACEIT Cricket)
    { id: 'p_crk_1', n: 'Virat Rajput', num: 18, pos: 'Top-Order Batsman', cat: 'Batsmen', h: "5'9\"", exp: '4 yrs', cap: true, insta: 'virat_rajput', photo: '', clubId: 'cricket' },
    { id: 'p_crk_2', n: 'Rohit Verma', num: 45, pos: 'Opening Batsman', cat: 'Batsmen', h: "5'10\"", exp: '3 yrs', cap: false, insta: 'rohit_bat', photo: '', clubId: 'cricket' },
    { id: 'p_crk_3', n: 'Jasprit Choudhary', num: 93, pos: 'Right-Arm Fast Bowler', cat: 'Bowlers', h: "6'0\"", exp: '3 yrs', cap: false, insta: 'jasprit_pace', photo: '', clubId: 'cricket' },
    { id: 'p_crk_4', n: 'Ravindra Meena', num: 8, pos: 'Spin All-Rounder', cat: 'All-Rounders', h: "5'8\"", exp: '3 yrs', cap: false, insta: 'ravi_allrounder', photo: '', clubId: 'cricket' },
    { id: 'p_crk_5', n: 'Rishabh Sharma', num: 17, pos: 'Wicketkeeper Batsman', cat: 'Wicketkeepers', h: "5'7\"", exp: '2 yrs', cap: false, insta: 'rishabh_wk', photo: '', clubId: 'cricket' },

    // Basketball (ACEIT Dunkers)
    { id: 'p_dnk_1', n: 'Marcus Singh', num: 23, pos: 'Point Guard', cat: 'Guards', h: "6'2\"", exp: '4 yrs', cap: true, insta: 'marcus_hoops', photo: '', clubId: 'dunkers' },
    { id: 'p_dnk_2', n: 'Kevin Sharma', num: 35, pos: 'Power Forward', cat: 'Forwards', h: "6'6\"", exp: '3 yrs', cap: false, insta: 'kevin_dunks', photo: '', clubId: 'dunkers' },
    { id: 'p_dnk_3', n: 'Stephen Rajput', num: 30, pos: 'Shooting Guard (3-PT Sharpshooter)', cat: 'Guards', h: "6'1\"", exp: '3 yrs', cap: false, insta: 'stephen_3pt', photo: '', clubId: 'dunkers' },
    { id: 'p_dnk_4', n: 'Nikola Meena', num: 15, pos: 'Center', cat: 'Centers', h: "6'8\"", exp: '2 yrs', cap: false, insta: 'nikola_center', photo: '', clubId: 'dunkers' },

    // Badminton (ACEIT Shuttlers)
    { id: 'p_sht_1', n: 'Lakshya Sharma', num: 1, pos: "Men's Singles", cat: 'Singles', h: "5'10\"", exp: '4 yrs', cap: true, insta: 'lakshya_badminton', photo: '', clubId: 'shuttlers' },
    { id: 'p_sht_2', n: 'PV Sindhu Verma', num: 7, pos: "Women's Singles", cat: 'Singles', h: "5'9\"", exp: '3 yrs', cap: false, insta: 'sindhu_shuttle', photo: '', clubId: 'shuttlers' },
    { id: 'p_sht_3', n: 'Chirag Rajput', num: 10, pos: "Men's Doubles Specialist", cat: 'Doubles', h: "6'0\"", exp: '3 yrs', cap: false, insta: 'chirag_doubles', photo: '', clubId: 'shuttlers' },
    { id: 'p_sht_4', n: 'Satwik Meena', num: 12, pos: "Men's Doubles Specialist", cat: 'Doubles', h: "6'1\"", exp: '3 yrs', cap: false, insta: 'satwik_smash', photo: '', clubId: 'shuttlers' },

    // Football (ACEIT Strikers FC)
    { id: 'p_stk_1', n: 'Carlos Silva', num: 10, pos: 'Striker / Forward', cat: 'Attackers', h: "5'11\"", exp: '4 yrs', cap: true, insta: 'carlos_strikers', photo: '', clubId: 'strikers-fc' },
    { id: 'p_stk_2', n: 'David Alaba Sharma', num: 4, pos: 'Centre Back', cat: 'Defenders', h: "6'1\"", exp: '3 yrs', cap: false, insta: 'david_cb', photo: '', clubId: 'strikers-fc' },
    { id: 'p_stk_3', n: 'Luka Meena', num: 8, pos: 'Central Midfielder', cat: 'Midfielders', h: "5'9\"", exp: '3 yrs', cap: false, insta: 'luka_playmaker', photo: '', clubId: 'strikers-fc' },
    { id: 'p_stk_4', n: 'Manuel Verma', num: 1, pos: 'Goalkeeper', cat: 'Goalkeepers', h: "6'3\"", exp: '4 yrs', cap: false, insta: 'manuel_gk', photo: '', clubId: 'strikers-fc' }
  ];

  // 2. Matches across all 6 clubs
  const matches = [
    // Volleyball
    { id: 'm_spk_1', team1: 'ACEIT Spikers', team1Logo: '', opp: 'Poornima University', team2: 'Poornima University', team2Logo: '', date: '2026-08-16T18:22:28.437Z', venue: 'ACEIT Indoor Court', status: 'completed', winner: 'team1', clubId: 'spikers' },
    { id: 'm_spk_2', team1: 'ACEIT Spikers', team1Logo: '', opp: 'JECRC Titans', team2: 'JECRC Titans', team2Logo: '', date: addDays(5), venue: 'JECRC Arena, Jaipur', status: 'upcoming', winner: 'none', clubId: 'spikers' },
    { id: 'm_spk_3', team1: 'ACEIT Spikers', team1Logo: '', opp: 'Manipal Smashers', team2: 'Manipal Smashers', team2Logo: '', date: addDays(14), venue: 'ACEIT Indoor Court', status: 'upcoming', winner: 'none', clubId: 'spikers' },

    // Kabaddi
    { id: 'm_kbd_1', team1: 'ACEIT Kabaddi', team1Logo: '', opp: 'Rajasthan University', team2: 'Rajasthan University', team2Logo: '', date: '2026-08-20T17:00:00.000Z', venue: 'SMS Stadium Kabaddi Mat, Jaipur', status: 'completed', winner: 'team1', clubId: 'kabaddi' },
    { id: 'm_kbd_2', team1: 'ACEIT Kabaddi', team1Logo: '', opp: 'JECRC Warriors', team2: 'JECRC Warriors', team2Logo: '', date: addDays(7), venue: 'ACEIT Outdoor Kabaddi Mat', status: 'upcoming', winner: 'none', clubId: 'kabaddi' },

    // Cricket
    { id: 'm_crk_1', team1: 'ACEIT Cricket', team1Logo: '', opp: 'MNIT Jaipur', team2: 'MNIT Jaipur', team2Logo: '', date: '2026-08-18T10:00:00.000Z', venue: 'MNIT Cricket Oval, Jaipur', status: 'completed', winner: 'team1', clubId: 'cricket' },
    { id: 'm_crk_2', team1: 'ACEIT Cricket', team1Logo: '', opp: 'Poornima Strikers', team2: 'Poornima Strikers', team2Logo: '', date: addDays(8), venue: 'Arya Main Cricket Ground, Kukas', status: 'upcoming', winner: 'none', clubId: 'cricket' },

    // Basketball
    { id: 'm_dnk_1', team1: 'ACEIT Dunkers', team1Logo: '', opp: 'Manipal Hoopers', team2: 'Manipal Hoopers', team2Logo: '', date: '2026-08-22T16:30:00.000Z', venue: 'Manipal Indoor Court, Jaipur', status: 'completed', winner: 'team1', clubId: 'dunkers' },
    { id: 'm_dnk_2', team1: 'ACEIT Dunkers', team1Logo: '', opp: 'JECRC Dunkers', team2: 'JECRC Dunkers', team2Logo: '', date: addDays(10), venue: 'ACEIT Basketball Arena', status: 'upcoming', winner: 'none', clubId: 'dunkers' },

    // Badminton
    { id: 'm_sht_1', team1: 'ACEIT Shuttlers', team1Logo: '', opp: 'Poornima Smashers', team2: 'Poornima Smashers', team2Logo: '', date: '2026-08-21T11:00:00.000Z', venue: 'ACEIT Wooden Badminton Court', status: 'completed', winner: 'team1', clubId: 'shuttlers' },
    { id: 'm_sht_2', team1: 'ACEIT Shuttlers', team1Logo: '', opp: 'Rajasthan Royals Badminton Club', team2: 'Rajasthan Royals Badminton Club', team2Logo: '', date: addDays(12), venue: 'SMS Indoor Badminton Hall', status: 'upcoming', winner: 'none', clubId: 'shuttlers' },

    // Football
    { id: 'm_stk_1', team1: 'ACEIT Strikers FC', team1Logo: '', opp: 'Rajasthan FC', team2: 'Rajasthan FC', team2Logo: '', date: '2026-08-19T16:00:00.000Z', venue: 'Arya College Football Turf', status: 'completed', winner: 'team1', clubId: 'strikers-fc' },
    { id: 'm_stk_2', team1: 'ACEIT Strikers FC', team1Logo: '', opp: 'JECRC United', team2: 'JECRC United', team2Logo: '', date: addDays(9), venue: 'JECRC Football Stadium', status: 'upcoming', winner: 'none', clubId: 'strikers-fc' }
  ];

  // 3. News across clubs
  const news = [
    { id: 'n_spk_1', tag: 'Featured', date: '20 Jul 2026', title: 'Spikers clinch regional title after thrilling 5-set final', body: 'ACEIT Spikers edged out a tightly contested final to bring home the regional championship trophy for the second year running.', featured: true, clubId: 'spikers' },
    { id: 'n_spk_2', tag: 'Announcement', date: '14 Jul 2026', title: 'New training block begins August 1', body: 'An updated strength & conditioning block kicks off next month for all first-team players.', featured: false, clubId: 'spikers' },
    { id: 'n_kbd_1', tag: 'Championship', date: '22 Aug 2026', title: 'ACEIT Kabaddi storm into State Semifinals after dominant 15-point raid masterclass', body: 'Pardeep Narwal led the charge with a 14-point Super 10 raid performance against Rajasthan University.', featured: true, clubId: 'kabaddi' },
    { id: 'n_crk_1', tag: 'Trophy', date: '19 Aug 2026', title: 'ACEIT Cricket lift Inter-Collegiate T20 Trophy with thrilling final over finish', body: 'Virat Rajput scored 74 off 42 balls as ACEIT chased down 178 in the championship final against MNIT.', featured: true, clubId: 'cricket' },
    { id: 'n_dnk_1', tag: 'Highlights', date: '23 Aug 2026', title: 'Dunkers secure Regional Basketball Championship in overtime thriller', body: 'Marcus Singh nailed a game-winning 3-pointer with 2.4 seconds remaining on the shot clock.', featured: true, clubId: 'dunkers' },
    { id: 'n_sht_1', tag: 'Gold Medal', date: '22 Aug 2026', title: 'ACEIT Shuttlers sweep Gold and Silver at State Collegiate Open', body: 'Lakshya Sharma dominated men singles in straight sets 21-14, 21-17 to claim the university gold.', featured: true, clubId: 'shuttlers' },
    { id: 'n_stk_1', tag: 'Victory', date: '20 Aug 2026', title: 'Strikers FC clinch Inter-University Football League title with undefeated run', body: 'Carlos Silva scored a stunning brace as Strikers FC defeated Rajasthan FC 3-1 in the final fixture.', featured: true, clubId: 'strikers-fc' }
  ];

  // 4. Events across clubs
  const events = [
    { id: 'ev_spk_1', title: 'ACEIT Inter-College Volleyball Cup 2026', description: 'Annual inter-college championship featuring top collegiate teams across Rajasthan.', date: '25 Sep 2026', time: '09:00 AM - 06:00 PM', venue: 'ACEIT Sports Complex - Main Indoor Court', poster: '', regBtnText: 'Register Now', regUrl: 'https://tally.so/r/RGeGvd', regEnabled: true, clubId: 'spikers' },
    { id: 'ev_kbd_1', title: 'Rajasthan State Collegiate Kabaddi Cup 2026', description: 'State-level championship mat matches featuring the fiercest collegiate raiders and defenders.', date: '15 Oct 2026', time: '08:00 AM - 07:00 PM', venue: 'Arya College Kabaddi Arena, Jaipur', poster: '', regBtnText: 'Register Team', regUrl: 'https://tally.so/r/RGeGvd', regEnabled: true, clubId: 'kabaddi' },
    { id: 'ev_crk_1', title: 'Arya Premier League (APL) T20 Championship 2026', description: 'Annual college cricket league tournament with 8 departmental squads competing for glory.', date: '20 Oct 2026', time: '09:30 AM - 05:30 PM', venue: 'Arya Main Cricket Stadium, Kukas', poster: '', regBtnText: 'Join Player Auction', regUrl: 'https://tally.so/r/RGeGvd', regEnabled: true, clubId: 'cricket' },
    { id: 'ev_dnk_1', title: 'ACEIT 3x3 Inter-College Basketball Jam 2026', description: 'Fast-paced streetball and collegiate 3x3 showdown with high-flying dunks and 3-point shootouts.', date: '05 Nov 2026', time: '04:00 PM - 09:00 PM', venue: 'ACEIT Floodlit Basketball Court', poster: '', regBtnText: 'Register Squad', regUrl: 'https://tally.so/r/RGeGvd', regEnabled: true, clubId: 'dunkers' },
    { id: 'ev_sht_1', title: 'ACEIT Open Shuttle Badminton Masters 2026', description: 'Men and Women singles and doubles open badminton championship.', date: '12 Nov 2026', time: '09:00 AM - 06:00 PM', venue: 'ACEIT Indoor Badminton Complex', poster: '', regBtnText: 'Enter Draw', regUrl: 'https://tally.so/r/RGeGvd', regEnabled: true, clubId: 'shuttlers' },
    { id: 'ev_stk_1', title: 'Arya Inter-Collegiate Football Cup 2026', description: 'Prestigious 11v11 collegiate football championship under floodlights.', date: '18 Nov 2026', time: '03:00 PM - 08:30 PM', venue: 'Arya College Main Football Arena', poster: '', regBtnText: 'Register Club', regUrl: 'https://tally.so/r/RGeGvd', regEnabled: true, clubId: 'strikers-fc' }
  ];

  // 5. Training sessions across clubs
  const training = [
    // Volleyball
    { id: 'tr_spk_1', icon: '🌅', title: 'Morning Session', time: '06:00 – 07:30', desc: 'Mon / Wed / Fri — footwork, serving accuracy, and reception drills.', clubId: 'spikers' },
    { id: 'tr_spk_2', icon: '🌆', title: 'Evening Session', time: '17:30 – 19:30', desc: 'Daily — full-court scrimmage, attack combinations, block timing.', clubId: 'spikers' },
    { id: 'tr_spk_3', icon: '💪', title: 'Strength Training', time: 'Tue / Thu 18:00', desc: 'Conditioning, jump strength, and injury-prevention work in the gym.', clubId: 'spikers' },

    // Kabaddi
    { id: 'tr_kbd_1', icon: '🤼', title: 'Morning Mat Drills', time: '06:00 – 08:00', desc: 'Mon / Wed / Fri — explosive raid footwork, ankle catch, thigh hold drills.', clubId: 'kabaddi' },
    { id: 'tr_kbd_2', icon: '⚡', title: 'Evening Defense Tactics', time: '17:00 – 19:00', desc: 'Chain defense, corner positioning, and full mat match simulations.', clubId: 'kabaddi' },

    // Cricket
    { id: 'tr_crk_1', icon: '🏏', title: 'Morning Bowling Nets', time: '06:30 – 08:30', desc: 'Tue / Thu / Sat — pace bowling line & length, spin variations on turf nets.', clubId: 'cricket' },
    { id: 'tr_crk_2', icon: '🎯', title: 'Evening Batting Practice', time: '16:30 – 18:30', desc: 'Throwdowns, power hitting against spin, and death overs execution.', clubId: 'cricket' },

    // Basketball
    { id: 'tr_dnk_1', icon: '🏀', title: 'Morning Shooting Drills', time: '06:00 – 07:30', desc: '3-point spot shooting, mid-range pullups, free throw discipline.', clubId: 'dunkers' },
    { id: 'tr_dnk_2', icon: '🔥', title: 'Evening Fast-Break Practice', time: '17:30 – 19:30', desc: 'Defensive transition, pick-and-roll execution, 5v5 full court.', clubId: 'dunkers' },

    // Badminton
    { id: 'tr_sht_1', icon: '🏸', title: 'Court Agility & Footwork', time: '06:00 – 07:30', desc: 'Multi-shuttle shadow drills, reflex smashes, net-kill accuracy.', clubId: 'shuttlers' },
    { id: 'tr_sht_2', icon: '🏆', title: 'Match Play & Strategy', time: '17:00 – 19:00', desc: 'Singles and doubles match tactical rehearsal ahead of state cup.', clubId: 'shuttlers' },

    // Football
    { id: 'tr_stk_1', icon: '⚽', title: 'Morning Fitness & Rondos', time: '06:00 – 07:30', desc: 'Passing accuracy, high-press positioning, cardiovascular sprints.', clubId: 'strikers-fc' },
    { id: 'tr_stk_2', icon: '🥅', title: 'Evening Tactical 11v11', time: '17:00 – 19:00', desc: 'Set-piece mastery, defensive shape, attacking transitions.', clubId: 'strikers-fc' }
  ];

  // 6. Gallery items across clubs
  const gallery = [
    { id: 'g_spk_1', cat: 'matches', h: 260, label: 'Volleyball Match Day', clubId: 'spikers' },
    { id: 'g_spk_2', cat: 'training', h: 180, label: 'Spikers Morning Practice', clubId: 'spikers' },
    { id: 'g_spk_3', cat: 'tournaments', h: 240, label: 'Regional Trophy Presentation', clubId: 'spikers' },
    { id: 'g_kbd_1', cat: 'matches', h: 260, label: 'Super Raid Point', clubId: 'kabaddi' },
    { id: 'g_kbd_2', cat: 'tournaments', h: 240, label: 'Kabaddi Trophy Winners', clubId: 'kabaddi' },
    { id: 'g_crk_1', cat: 'matches', h: 260, label: 'Championship Winning Six', clubId: 'cricket' },
    { id: 'g_crk_2', cat: 'training', h: 200, label: 'Turf Wicket Practice', clubId: 'cricket' },
    { id: 'g_dnk_1', cat: 'matches', h: 260, label: 'Fast Break Slam Dunk', clubId: 'dunkers' },
    { id: 'g_sht_1', cat: 'matches', h: 240, label: 'Jump Smash Down the Line', clubId: 'shuttlers' },
    { id: 'g_stk_1', cat: 'matches', h: 260, label: 'Top-Corner Goal Celebration', clubId: 'strikers-fc' }
  ];

  // 7. Sponsors
  const sponsors = [
    { id: 'sp_1', name: 'Wonder Cement', clubId: 'spikers' },
    { id: 'sp_2', name: 'FireNodeX', clubId: 'spikers' },
    { id: 'sp_3', name: 'Arya College', clubId: 'spikers' },
    { id: 'sp_4', name: 'Sports Authority of India', clubId: 'spikers' },
    { id: 'sp_5', name: 'Nova Sports Gear', clubId: 'spikers' },
    { id: 'sp_6', name: 'Wonder Cement', clubId: 'cricket' },
    { id: 'sp_7', name: 'Arya College', clubId: 'cricket' },
    { id: 'sp_8', name: 'Arya College', clubId: 'kabaddi' },
    { id: 'sp_9', name: 'Sports Authority', clubId: 'kabaddi' },
    { id: 'sp_10', name: 'Arya College', clubId: 'dunkers' },
    { id: 'sp_11', name: 'Arya College', clubId: 'shuttlers' },
    { id: 'sp_12', name: 'Arya College', clubId: 'strikers-fc' }
  ];

  // 8. Testimonials
  const testimonials = [
    { id: 'tm_spk_1', q: 'Joining Spikers made me a better player and a better teammate. The discipline here is real.', n: 'Arjun Verma', r: 'Setter', clubId: 'spikers' },
    { id: 'tm_spk_2', q: 'Our coaches push us hard, but they care harder. That balance is what wins matches.', n: 'Karan Singh', r: 'Libero', clubId: 'spikers' },
    { id: 'tm_spk_3', q: 'This club taught me more about leadership than any classroom could.', n: 'Shubham Patidar', r: 'Team Captain', clubId: 'spikers' },
    { id: 'tm_kbd_1', q: 'The mat training at ACEIT Kabaddi gave me the physical strength and tactical vision to compete at state level.', n: 'Pardeep Narwal ACE', r: 'Lead Raider', clubId: 'kabaddi' },
    { id: 'tm_crk_1', q: 'Playing cricket for ACEIT is an unmatched honor. The turf facilities and coaching mentorship are championship tier.', n: 'Virat Rajput', r: 'Team Captain', clubId: 'cricket' }
  ];

  // 9. Stats
  const stats = [
    { id: 'st_spk_1', label: 'Championships', target: 7, clubId: 'spikers' },
    { id: 'st_spk_2', label: 'Tournament Wins', target: 24, clubId: 'spikers' },
    { id: 'st_spk_3', label: 'Players', target: 38, clubId: 'spikers' },
    { id: 'st_spk_4', label: 'Coaches', target: 5, clubId: 'spikers' },
    { id: 'st_spk_5', label: 'Training Sessions', target: 410, clubId: 'spikers' },
    { id: 'st_spk_6', label: 'Years Active', target: 6, clubId: 'spikers' },

    { id: 'st_kbd_1', label: 'State Trophies', target: 4, clubId: 'kabaddi' },
    { id: 'st_kbd_2', label: 'Super Raids', target: 142, clubId: 'kabaddi' },
    { id: 'st_kbd_3', label: 'All-Outs Forced', target: 88, clubId: 'kabaddi' },
    { id: 'st_kbd_4', label: 'Active Raiders', target: 22, clubId: 'kabaddi' },

    { id: 'st_crk_1', label: 'APL Titles', target: 5, clubId: 'cricket' },
    { id: 'st_crk_2', label: 'T20 Match Wins', target: 36, clubId: 'cricket' },
    { id: 'st_crk_3', label: 'Centuries Scored', target: 12, clubId: 'cricket' },
    { id: 'st_crk_4', label: 'Squad Size', target: 26, clubId: 'cricket' },

    { id: 'st_dnk_1', label: 'Regional Cups', target: 3, clubId: 'dunkers' },
    { id: 'st_dnk_2', label: '3-Pointers Made', target: 280, clubId: 'dunkers' },
    { id: 'st_dnk_3', label: 'Hoopers', target: 18, clubId: 'dunkers' },

    { id: 'st_sht_1', label: 'State Gold Medals', target: 8, clubId: 'shuttlers' },
    { id: 'st_sht_2', label: 'Matches Won', target: 64, clubId: 'shuttlers' },
    { id: 'st_sht_3', label: 'Shuttlers', target: 16, clubId: 'shuttlers' },

    { id: 'st_stk_1', label: 'League Titles', target: 4, clubId: 'strikers-fc' },
    { id: 'st_stk_2', label: 'Goals Scored', target: 114, clubId: 'strikers-fc' },
    { id: 'st_stk_3', label: 'Clean Sheets', target: 19, clubId: 'strikers-fc' }
  ];

  // 10. Slideshow
  const slideshow = [
    { id: 'slide_spk_1', title: 'WINNER TEAM SPIKERS 2.0', date: 'AI&DS 3RD YEAR TEAM · Champions', image: 'banner1.jpg', link: '#matches', btnText: 'View Highlights', clubId: 'spikers' },
    { id: 'slide_spk_2', title: 'Championship Season 2026', date: 'Upcoming Tournament · 15 Sept 2026', image: 'banner2.jpg', link: '#matches', btnText: 'View Match Schedule', clubId: 'spikers' },
    { id: 'slide_spk_3', title: 'Intense Team Training & Practice', date: 'Daily Practice · Arya Campus Grounds', image: 'banner1.jpg', link: '#training', btnText: 'View Timetable', clubId: 'spikers' },
    { id: 'slide_spk_4', title: 'ACEIT Inter-College Volleyball Cup', date: 'Main Indoor Court · 25 Sep 2026', image: 'banner2.jpg', link: '#events', btnText: 'Explore Event', clubId: 'spikers' },

    { id: 'slide_kbd_1', title: 'ACEIT KABADDI CHAMPIONSHIP RUN', date: 'SMS Stadium Jaipur · State Champions', image: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?auto=format&fit=crop&w=1200&q=80', link: '#matches', btnText: 'View Match Highlights', clubId: 'kabaddi' },
    { id: 'slide_crk_1', title: 'ARYA PREMIER LEAGUE T20 CRICKET', date: 'Arya Main Cricket Stadium · Champions', image: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=1200&q=80', link: '#matches', btnText: 'View Scorecard', clubId: 'cricket' },
    { id: 'slide_dnk_1', title: 'ACEIT DUNKERS COURT DOMINANCE', date: 'Regional Basketball Cup · Overtime Thriller', image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=80', link: '#matches', btnText: 'View Highlights', clubId: 'dunkers' },
    { id: 'slide_sht_1', title: 'ACEIT SHUTTLERS STATE GOLD', date: 'Inter-University Badminton Open · Champions', image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?auto=format&fit=crop&w=1200&q=80', link: '#matches', btnText: 'View Highlights', clubId: 'shuttlers' },
    { id: 'slide_stk_1', title: 'STRIKERS FC UNDEFEATED LEAGUE CHAMPIONS', date: 'Arya College Football Turf · Title Winners', image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?auto=format&fit=crop&w=1200&q=80', link: '#matches', btnText: 'View Highlights', clubId: 'strikers-fc' }
  ];

  // 11. About and Contact
  const abouts = {
    spikers: {
      eyebrow: 'Who we are',
      title: 'Built on the court,\ndefined by character.',
      sub: 'ACEIT Spikers brings together players who train hard, compete fair, and show up for one another — on and off the court.',
      mission: 'To build a competitive volleyball program that develops skilled, disciplined athletes while creating a home for anyone who wants to play, grow, and belong.',
      vision: 'To be recognised as the standard-bearer for collegiate volleyball at ACEIT — a club that wins with class and trains the next generation of captains.'
    },
    kabaddi: {
      eyebrow: 'Pride of ACEIT',
      title: 'Strength on the mat,\nunstoppable in raid.',
      sub: 'ACEIT Kabaddi brings together fierce raiders and ironclad defenders trained for collegiate championships and state tournaments.',
      mission: 'To cultivate mental grit, explosive raid power, and tactical defense in traditional and modern collegiate Kabaddi.',
      vision: 'To be the premier collegiate Kabaddi powerhouse in Rajasthan, producing champion athletes who play with honor.'
    },
    cricket: {
      eyebrow: "Gentleman's Game",
      title: 'Discipline at the crease,\npower on the field.',
      sub: 'ACEIT Cricket combines technical batting, hostile fast & spin bowling, and sharp fielding for every match fixture.',
      mission: 'To build a formidable collegiate cricket squad grounded in match temperament, relentless fitness, and teamwork.',
      vision: 'To be celebrated as the top university cricket team in the region with an undefeated championship spirit.'
    },
    dunkers: {
      eyebrow: 'Court Dominance',
      title: 'Every possession counts,\nevery basket earned.',
      sub: 'ACEIT Dunkers squad trains with relentless pace, sharpshooting accuracy, and lockdown team defense.',
      mission: 'To develop high-IQ, fast-paced basketball players who execute under pressure with unity, grit, and passion.',
      vision: 'To build an elite championship-winning basketball legacy representing Arya College across national tourneys.'
    },
    shuttlers: {
      eyebrow: 'Speed & Precision',
      title: 'Master every rally,\nsmash every limit.',
      sub: 'ACEIT Shuttlers brings together dedicated singles and doubles shuttlers competing for collegiate and university glory.',
      mission: 'To refine reflex speed, court agility, and mental composure in high-stakes collegiate badminton tournaments.',
      vision: 'To nurture collegiate badminton champions who dominate inter-university championships with skill and grace.'
    },
    'strikers-fc': {
      eyebrow: 'The Beautiful Game',
      title: 'Passion on the pitch,\nunited for 90 minutes.',
      sub: 'ACEIT Strikers FC is built on swift passing, clinical finishing, tactical discipline, and unwavering brotherhood.',
      mission: 'To foster tactical intelligence, cardiovascular stamina, and sportsmanship through modern football training.',
      vision: 'To set the collegiate benchmark for competitive football at ACEIT with discipline, flair, and championships.'
    }
  };

  const contacts = {
    spikers: {
      address: 'Arya Campus 1, Kukas, Jaipur, Rajasthan 302028',
      email: 'spikers-official@aceit.edu.in',
      phone: '+91 7067787571',
      hours: 'Mon–Sun, 5:00 AM – 9:00 PM',
      insta: 'https://instagram.com/aceit_spikers',
      fb: 'https://facebook.com/aceitspikers',
      yt: 'https://youtube.com/@aceitspikers',
      wa: 'https://wa.me/919999988888'
    },
    kabaddi: {
      address: 'Arya College of Engineering & IT, Jaipur, Rajasthan',
      email: 'kabaddi@aceit.edu.in',
      phone: '+91 98765 43210',
      hours: 'Mon–Sat, 6:00 AM – 8:00 PM',
      insta: '#',
      fb: '#',
      yt: '#',
      wa: '#'
    },
    cricket: {
      address: 'Arya Main Cricket Grounds, Kukas, Jaipur',
      email: 'cricket@aceit.edu.in',
      phone: '+91 98765 43211',
      hours: 'Mon–Sat, 6:00 AM – 7:30 PM',
      insta: '#',
      fb: '#',
      yt: '#',
      wa: '#'
    },
    dunkers: {
      address: 'ACEIT Indoor Basketball Arena, Jaipur',
      email: 'basketball@aceit.edu.in',
      phone: '+91 98765 43212',
      hours: 'Mon–Sat, 6:00 AM – 8:00 PM',
      insta: '#',
      fb: '#',
      yt: '#',
      wa: '#'
    },
    shuttlers: {
      address: 'ACEIT Indoor Badminton Hall, Jaipur',
      email: 'badminton@aceit.edu.in',
      phone: '+91 98765 43213',
      hours: 'Mon–Sat, 6:00 AM – 8:00 PM',
      insta: '#',
      fb: '#',
      yt: '#',
      wa: '#'
    },
    'strikers-fc': {
      address: 'Arya Football Turf Stadium, Kukas, Jaipur',
      email: 'football@aceit.edu.in',
      phone: '+91 98765 43214',
      hours: 'Mon–Sat, 6:00 AM – 8:00 PM',
      insta: '#',
      fb: '#',
      yt: '#',
      wa: '#'
    }
  };

  const cleanDB = {
    team,
    matches,
    news,
    sponsors,
    testimonials,
    stats,
    gallery,
    events,
    training,
    slideshow,
    about: abouts.spikers,
    contact: contacts.spikers,
    abouts,
    contacts,
    categories: {
      team: ['boys team', 'girls team', 'alumni', 'raiders', 'defenders', 'batsmen', 'bowlers', 'all-rounders', 'guards', 'forwards', 'singles', 'doubles', 'attackers', 'midfielders'],
      gallery: ['matches', 'training', 'team', 'events', 'tournaments']
    },
    deletedCategories: { team: [], gallery: [] },
    customCategories: { team: [], gallery: [] },
    applications: [
      {
        _id: 'app_sample_1',
        name: 'Rahul Sharma',
        email: 'rahul.sharma@aceit.edu.in',
        phone: '+91 98765 43210',
        position: 'Outside Hitter',
        experience: '2 years district level volleyball',
        message: 'Excited to represent ACEIT Spikers in upcoming collegiate tournaments!',
        status: 'Accepted',
        source: 'Join Club Form',
        clubId: 'spikers',
        createdAt: new Date().toISOString()
      },
      {
        _id: 'app_sample_2',
        name: 'Amitabh Verma',
        email: 'amitabh.v@aceit.edu.in',
        phone: '+91 98765 43211',
        position: 'Raider',
        experience: 'State championship finalist',
        message: 'Interested in joining ACEIT Kabaddi squad for the inter-collegiate season.',
        status: 'Pending',
        source: 'Website Tryouts',
        clubId: 'kabaddi',
        createdAt: new Date().toISOString()
      }
    ]
  };

  // 12. Standard Demo Accounts for Testing & Development
  const salt = bcrypt.genSaltSync(10);
  const ownerHash = bcrypt.hashSync('OwnerSecret123!', salt);
  const adminHash = bcrypt.hashSync('AdminSecret123!', salt);
  const studentHash = bcrypt.hashSync('StudentSecret123!', salt);

  const cleanUsers = [
    // Authoritative OWNER Account
    {
      name: 'Founder / Super Owner',
      username: 'founder',
      email: 'founder@aceit.edu.in',
      rtuRollNo: '00EATFND001',
      passwordHash: ownerHash,
      role: 'OWNER',
      clubId: 'ALL',
      clubs: ['spikers', 'kabaddi', 'cricket', 'dunkers', 'shuttlers', 'strikers-fc'],
      permissions: ['*'],
      active: true,
      sport: 'All Sports',
      branch: 'Administration',
      year: 'Faculty / Management'
    },

    // CLUB ADMIN Accounts (Scoped)
    {
      name: 'Cricket Club Admin',
      username: 'cricket_admin',
      email: 'cricket.admin@aceit.edu.in',
      rtuRollNo: '22EATCR001',
      passwordHash: adminHash,
      role: 'ADMIN',
      clubId: 'cricket',
      clubs: ['cricket'],
      permissions: ['players.*', 'matches.*', 'news.*', 'gallery.*', 'events.*', 'training.*', 'testimonials.*', 'sponsors.*', 'stats.*', 'about.*', 'contact.*', 'applications.*'],
      active: true,
      sport: 'Cricket',
      branch: 'Mechanical Engineering',
      year: '4th Year'
    },
    {
      name: 'Kabaddi Club Admin',
      username: 'kabaddi_admin',
      email: 'kabaddi.admin@aceit.edu.in',
      rtuRollNo: '22EATKB001',
      passwordHash: adminHash,
      role: 'ADMIN',
      clubId: 'kabaddi',
      clubs: ['kabaddi'],
      permissions: ['players.*', 'matches.*', 'news.*', 'gallery.*', 'events.*', 'training.*', 'testimonials.*', 'sponsors.*', 'stats.*', 'about.*', 'contact.*', 'applications.*'],
      active: true,
      sport: 'Kabaddi',
      branch: 'Civil Engineering',
      year: '4th Year'
    },
    {
      name: 'Football Club Admin',
      username: 'football_admin',
      email: 'football.admin@aceit.edu.in',
      rtuRollNo: '22EATFT001',
      passwordHash: adminHash,
      role: 'ADMIN',
      clubId: 'strikers-fc',
      clubs: ['strikers-fc'],
      permissions: ['players.*', 'matches.*', 'news.*', 'gallery.*', 'events.*', 'training.*', 'testimonials.*', 'sponsors.*', 'stats.*', 'about.*', 'contact.*', 'applications.*'],
      active: true,
      sport: 'Football',
      branch: 'Electrical Engineering',
      year: '4th Year'
    },

    // COORDINATOR Accounts
    {
      name: 'Sports General Coordinator',
      username: 'sports_coord',
      email: 'coordinator@aceit.edu.in',
      rtuRollNo: '23EATSP010',
      passwordHash: adminHash,
      role: 'COORDINATOR',
      clubId: 'spikers',
      clubs: ['spikers', 'cricket', 'kabaddi'],
      permissions: ['players.*', 'matches.*', 'events.*', 'news.*', 'gallery.*', 'training.*', 'testimonials.*', 'sponsors.*', 'stats.*', 'about.*', 'contact.*', 'applications.*'],
      active: true,
      sport: 'Volleyball',
      branch: 'Computer Science & Engineering',
      year: '3rd Year'
    },
    {
      name: 'Basketball Coordinator',
      username: 'dunkers_coord',
      email: 'dunkers.coord@aceit.edu.in',
      rtuRollNo: '23EATBK012',
      passwordHash: adminHash,
      role: 'COORDINATOR',
      clubId: 'dunkers',
      clubs: ['dunkers'],
      permissions: ['players.*', 'matches.*', 'events.*', 'news.*', 'gallery.*', 'training.*'],
      active: true,
      sport: 'Basketball',
      branch: 'Information Technology',
      year: '3rd Year'
    },

    // STUDENT / USER Accounts
    {
      name: 'Student Athlete (Multi-Sport)',
      username: 'student_athlete',
      email: 'student.athlete@aceit.edu.in',
      rtuRollNo: '22EATCS089',
      passwordHash: studentHash,
      role: 'STUDENT',
      clubId: 'spikers',
      clubs: ['spikers', 'cricket', 'kabaddi'],
      permissions: ['profile.view', 'profile.edit', 'clubs.join', 'applications.submit'],
      active: true,
      sport: 'Volleyball',
      branch: 'Computer Science & Engineering',
      year: '3rd Year (Batch 2023-27)',
      position: 'Outside Hitter',
      jerseyNo: '7',
      height: "6'0\" (183 cm)",
      mobile: '+91 98765 43210',
      bio: 'Collegiate athlete passionate about volleyball spikes, cricket, and fitness.',
      achievements: [
        { title: 'Inter-College Volleyball Gold Medalist', year: '2025' },
        { title: 'Rajasthan State Selection Trialist', year: '2026' }
      ],
      stats: { matchesPlayed: 14, points: 68, spikes: 42, blocks: 18, aces: 8, mvpAwards: 2, mvpPoints: 110 }
    },
    {
      name: 'Rahul Sharma',
      username: 'rahul_sharma',
      email: 'rahul.sharma@aceit.edu.in',
      rtuRollNo: '23EATEC042',
      passwordHash: studentHash,
      role: 'STUDENT',
      clubId: 'spikers',
      clubs: ['spikers'],
      permissions: ['profile.view', 'profile.edit', 'clubs.join', 'applications.submit'],
      active: true,
      sport: 'Volleyball',
      branch: 'Electronics & Communication',
      year: '2nd Year (Batch 2024-28)',
      position: 'Setter',
      jerseyNo: '12',
      height: "5'11\"",
      mobile: '+91 98765 43219',
      bio: 'Aspiring collegiate volleyball setter.',
      achievements: [
        { title: 'Freshers Volleyball Tournament MVP', year: '2024' }
      ],
      stats: { matchesPlayed: 8, points: 28, spikes: 10, blocks: 6, aces: 12, mvpAwards: 1, mvpPoints: 50 }
    }
  ];

  // Save clean data to local file fallback
  fs.writeFileSync(DATA_FILE, JSON.stringify(cleanDB, null, 2), 'utf8');
  console.log('✓ Successfully wrote clean multi-club dataset to local data.json');

  // If MongoDB URI is present, connect and sync to MongoDB Atlas
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri) {
    try {
      console.log('Connecting to MongoDB Atlas to sync clean database...');
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
      console.log('✓ Connected to MongoDB Atlas');

      // 1. Sync ClubDoc
      await ClubDoc.findOneAndUpdate(
        { key: 'main' },
        { ...cleanDB, pin: process.env.ADMIN_PIN || '2026' },
        { upsert: true, new: true }
      );
      console.log('✓ Synchronized clean ClubDoc ("main") on MongoDB Atlas');

      // 2. Sync Clubs
      for (const c of defaultClubsList) {
        await Club.findOneAndUpdate(
          { $or: [{ clubId: c.clubId }, { slug: c.slug }] },
          c,
          { upsert: true, new: true }
        );
      }
      // Remove any extraneous clubs not in default list
      const validClubIds = defaultClubsList.map(c => c.clubId);
      await Club.deleteMany({ clubId: { $nin: validClubIds } });
      console.log(`✓ Synchronized ${defaultClubsList.length} standard clubs on MongoDB Atlas`);

      // 3. Sync Roles
      for (const r of defaultRolesList) {
        await Role.findOneAndUpdate(
          { name: r.name },
          r,
          { upsert: true, new: true }
        );
      }
      console.log(`✓ Synchronized ${defaultRolesList.length} RBAC roles on MongoDB Atlas`);

      // 4. Sync Users
      // Keep only clean test/demo users and remove extraneous test accounts
      const standardUsernames = cleanUsers.map(u => u.username);
      for (const u of cleanUsers) {
        await User.findOneAndUpdate(
          { username: u.username },
          u,
          { upsert: true, new: true }
        );
      }
      // Remove old random test users (e.g. test_coord_*, strikers_admin_*, spikertest_*)
      const deleteResult = await User.deleteMany({
        username: { $nin: standardUsernames, $regex: /^(test_|strikers_admin_|spikertest_|coord_test)/i }
      });
      console.log(`✓ Synchronized clean test accounts (Removed ${deleteResult.deletedCount || 0} old dummy test users)`);

      await mongoose.disconnect();
      console.log('✓ MongoDB Atlas clean synchronization complete and disconnected safely.');
    } catch (err) {
      console.warn('MongoDB Atlas connection or sync note:', err.message);
    }
  } else {
    console.log('Note: MONGODB_URI not configured. Clean dataset persisted in local data.json fallback.');
  }

  console.log('--- Database Cleaning Complete ---');
}

if (require.main === module) {
  generateCleanDatabase().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('Fatal error generating clean database:', err);
    process.exit(1);
  });
}

module.exports = { generateCleanDatabase, defaultClubsList, defaultRolesList };
