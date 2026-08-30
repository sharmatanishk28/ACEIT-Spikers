import { Document, Model, Types } from 'mongoose';

// ==========================================
// 1. CLUBS & SPORTS
// ==========================================
export type ClubStatus = 'active' | 'inactive' | 'archived';

export interface IClub {
  clubId: string;
  name: string;
  sport: string;
  slug: string;
  logo?: string;
  loaderLogo?: string;
  coverImage?: string;
  description?: string;
  themeColor?: string;
  accentColor?: string;
  active: boolean;
  status: ClubStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IClubDocument extends IClub, Document {}
export interface IClubModel extends Model<IClubDocument> {}

// ==========================================
// 2. ROLES & RBAC
// ==========================================
export interface IRole {
  name: string;
  title: string;
  badgeBg: string;
  badgeText: string;
  badgeGlow: string;
  permissions: string[];
  isSystem: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRoleDocument extends IRole, Document {}
export interface IRoleModel extends Model<IRoleDocument> {}

// ==========================================
// 3. USERS & ATHLETE PROFILES
// ==========================================
export interface IUserStats {
  matchesPlayed: number;
  points: number;
  spikes: number;
  blocks: number;
  aces: number;
  mvpAwards: number;
  mvpPoints: number;
}

export interface IUserBadge {
  badgeKey: string;
  title: string;
  icon: string;
  glow?: string;
  bg?: string;
  text?: string;
  description?: string;
  awardedAt?: Date;
}

export interface IUserAchievement {
  title: string;
  year?: string;
  desc?: string;
}

export interface IUser {
  name: string;
  username: string;
  rtuRollNo?: string;
  email?: string;
  mobile?: string;
  photo?: string;
  passwordHash: string;
  role: string;
  clubId: string;
  clubs: string[];
  bio?: string;
  sport?: string;
  branch?: string;
  year?: string;
  position?: string;
  jerseyNo?: string;
  height?: string;
  achievements: IUserAchievement[];
  stats: IUserStats;
  badges: IUserBadge[];
  permissions: string[];
  active: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserDocument extends IUser, Document {}
export interface IUserModel extends Model<IUserDocument> {}

// ==========================================
// 4. PLAYERS (CLUB ROSTER)
// ==========================================
export interface IPlayerStats {
  matches?: number;
  points?: number;
  kills?: number;
  blocks?: number;
  aces?: number;
  mvps?: number;
  [key: string]: any;
}

export interface IPlayer {
  clubId: string;
  name: string;
  role: string;
  number?: number | string;
  userId?: Types.ObjectId | string;
  photo?: string;
  bio?: string;
  height?: string;
  weight?: string;
  experience?: string;
  stats?: IPlayerStats;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPlayerDocument extends IPlayer, Document {}
export interface IPlayerModel extends Model<IPlayerDocument> {}

// ==========================================
// 5. MATCHES & MULTI-SPORT LIVE SCORING
// ==========================================
export type MatchStatus = 'upcoming' | 'live' | 'completed' | 'cancelled';
export type MatchWinner = 'team1' | 'team2' | 'draw' | 'none';
export type MatchSport = 'volleyball' | 'cricket' | 'football' | 'basketball' | 'kabaddi' | 'badminton' | 'other';

export interface ISetScore {
  set: number;
  team1: number;
  team2: number;
  winner?: string;
}

export interface IPlayByPlayEvent {
  id: string;
  time: string;
  text: string;
  type?: string;
  scoringTeam?: 'home' | 'away';
  playerUsername?: string;
  score?: string;
  scoreHome?: number;
  scoreAway?: number;
}

export interface IMatch {
  clubId: string;
  sport: MatchSport;
  team1: string;
  team2: string;
  opp?: string;
  team1Logo?: string;
  team2Logo?: string;
  venue: string;
  date: string;
  time?: string;
  status: MatchStatus;
  winner: MatchWinner;
  isLive: boolean;
  score1: number;
  score2: number;
  team1Score: number;
  team2Score: number;
  setsWonHome: number;
  setsWonAway: number;
  sets?: string;
  currentPeriod: number;
  servingTeam?: 'home' | 'away';
  scoreSummary?: string;
  setScores: ISetScore[];
  sportStats?: Record<string, any>;
  playByPlay: IPlayByPlayEvent[];
  mvpUserId?: Types.ObjectId | string;
  mvpUsername?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMatchDocument extends IMatch, Document {}
export interface IMatchModel extends Model<IMatchDocument> {}

// ==========================================
// 6. MATCH AVAILABILITY & SQUAD LINEUP
// ==========================================
export type AvailabilityStatus = 'Available' | 'Tentative' | 'Unavailable';

export interface IMatchAvailability {
  matchId: Types.ObjectId | string;
  userId?: Types.ObjectId | string;
  username: string;
  name: string;
  availability: AvailabilityStatus;
  note?: string;
  isStartingLineup: boolean;
  position?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMatchAvailabilityDocument extends IMatchAvailability, Document {}
export interface IMatchAvailabilityModel extends Model<IMatchAvailabilityDocument> {}

// ==========================================
// 7. EVENTS & TOURNAMENTS
// ==========================================
export type EventStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled';

export interface IEvent {
  clubId: string;
  title: string;
  description: string;
  date: string;
  time?: string;
  venue: string;
  poster?: string;
  regBtnText?: string;
  regUrl?: string;
  regEnabled: boolean;
  maxParticipants?: number;
  status: EventStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEventDocument extends IEvent, Document {}
export interface IEventModel extends Model<IEventDocument> {}

// ==========================================
// 8. EVENT RSVPS
// ==========================================
export type RsvpStatus = 'Registered' | 'Attending' | 'Cancelled';

export interface IEventRsvp {
  eventId: Types.ObjectId | string;
  eventTitle?: string;
  userId?: Types.ObjectId | string;
  username?: string;
  name: string;
  email?: string;
  phone?: string;
  rollNo?: string;
  teamName?: string;
  status: RsvpStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IEventRsvpDocument extends IEventRsvp, Document {}
export interface IEventRsvpModel extends Model<IEventRsvpDocument> {}

// ==========================================
// 9. NEWS & ARTICLES
// ==========================================
export interface INews {
  clubId: string;
  title: string;
  summary?: string;
  content: string;
  author?: string;
  image?: string;
  tags: string[];
  publishedAt: Date;
  isFeatured: boolean;
  views: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface INewsDocument extends INews, Document {}
export interface INewsModel extends Model<INewsDocument> {}

// ==========================================
// 10. GALLERY & MEDIA METADATA
// ==========================================
export interface IGalleryItem {
  clubId: string;
  title?: string;
  caption?: string;
  imageUrl: string;
  thumbnailUrl?: string;
  publicId?: string;
  category?: string;
  tags: string[];
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IGalleryDocument extends IGalleryItem, Document {}
export interface IGalleryModel extends Model<IGalleryDocument> {}

// ==========================================
// 11. TRAINING SESSIONS
// ==========================================
export interface ITraining {
  clubId: string;
  title: string;
  icon?: string;
  time?: string;
  days?: string[];
  venue?: string;
  coach?: string;
  desc?: string;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITrainingDocument extends ITraining, Document {}
export interface ITrainingModel extends Model<ITrainingDocument> {}

// ==========================================
// 12. SPONSORS & PARTNERS
// ==========================================
export type SponsorTier = 'Title' | 'Platinum' | 'Gold' | 'Silver' | 'Official Partner';

export interface ISponsor {
  clubId: string;
  name: string;
  logo: string;
  tier: SponsorTier;
  website?: string;
  description?: string;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISponsorDocument extends ISponsor, Document {}
export interface ISponsorModel extends Model<ISponsorDocument> {}

// ==========================================
// 13. TESTIMONIALS & QUOTES
// ==========================================
export interface ITestimonial {
  clubId: string;
  name: string;
  role?: string;
  quote: string;
  avatar?: string;
  rating?: number;
  order: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITestimonialDocument extends ITestimonial, Document {}
export interface ITestimonialModel extends Model<ITestimonialDocument> {}

// ==========================================
// 14. CLUB ABOUT & IDENTITY
// ==========================================
export interface IClubValue {
  title: string;
  desc: string;
  icon?: string;
}

export interface IClubStatItem {
  label: string;
  val: string | number;
  icon?: string;
}

export interface IClubAbout {
  clubId: string;
  eyebrow?: string;
  title?: string;
  sub?: string;
  mission?: string;
  vision?: string;
  history?: string;
  values?: IClubValue[];
  stats?: IClubStatItem[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IClubAboutDocument extends IClubAbout, Document {}
export interface IClubAboutModel extends Model<IClubAboutDocument> {}

// ==========================================
// 15. CLUB CONTACT & COORDINATES
// ==========================================
export interface IClubSocials {
  insta?: string;
  fb?: string;
  yt?: string;
  wa?: string;
  x?: string;
}

export interface IClubContact {
  clubId: string;
  address?: string;
  email?: string;
  phone?: string;
  hours?: string;
  socials?: IClubSocials;
  mapEmbedUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IClubContactDocument extends IClubContact, Document {}
export interface IClubContactModel extends Model<IClubContactDocument> {}

// ==========================================
// 16. ANNOUNCEMENTS & NOTICE BOARD
// ==========================================
export type AnnouncementCategory = 'Urgent' | 'Selection' | 'Practice' | 'Tournament' | 'General';

export interface IAnnouncement {
  title: string;
  content: string;
  clubId: string;
  category: AnnouncementCategory;
  isPinned: boolean;
  authorName: string;
  authorRole: string;
  authorUsername: string;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAnnouncementDocument extends IAnnouncement, Document {}
export interface IAnnouncementModel extends Model<IAnnouncementDocument> {}

// ==========================================
// 17. IN-APP NOTIFICATIONS
// ==========================================
export type NotificationType = 'selection' | 'badge' | 'application' | 'match' | 'broadcast';

export interface INotification {
  recipientUsername: string;
  title: string;
  message: string;
  type: NotificationType;
  linkUrl?: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface INotificationDocument extends INotification, Document {}
export interface INotificationModel extends Model<INotificationDocument> {}

// ==========================================
// 18. TRYOUTS & JOIN APPLICATIONS
// ==========================================
export type ApplicationStatus = 'Pending' | 'Reviewed' | 'Accepted' | 'Rejected';

export interface IApplication {
  userId?: Types.ObjectId | string;
  username?: string;
  clubSlug: string;
  name: string;
  email: string;
  phone?: string;
  position?: string;
  experience?: string;
  message?: string;
  status: ApplicationStatus;
  source: string;
  adminFeedback?: string;
  tallyEventId?: string;
  tallyResponseId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IApplicationDocument extends IApplication, Document {}
export interface IApplicationModel extends Model<IApplicationDocument> {}

// ==========================================
// 19. REVOKED TOKENS (SECURITY)
// ==========================================
export interface IRevokedToken {
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRevokedTokenDocument extends IRevokedToken, Document {}
export interface IRevokedTokenModel extends Model<IRevokedTokenDocument> {}
