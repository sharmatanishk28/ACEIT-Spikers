# Production MongoDB Database Architecture & Requirements Map

This document defines the new backend data architecture for **ACEIT Spikers / Multi-Club Sports Platform**.

---

## 1. Database Requirements Map

The legacy single-document pattern (`ClubDoc` storing embedded arrays for players, matches, events, news, sponsors, etc.) is replaced with **fully independent, normalized, indexed MongoDB collections** managed by clean, typed Mongoose models.

```
OLD MONOLITHIC DOCUMENT (ClubDoc)
               ↓
    CLEAN NORMALIZED COLLECTIONS
 ├── clubs (multisport athletic clubs)
 ├── users (athletes, coordinators, admins, owner)
 ├── roles (custom and system roles with RBAC)
 ├── players (team rosters & athlete athletic stats)
 ├── matches (schedules, results, multi-sport live scores)
 ├── match_availabilities (squad availability & starting 6 lineups)
 ├── events (tournaments, tryouts, clinics)
 ├── event_rsvps (attendees & registrations)
 ├── news (articles, press releases, match reports)
 ├── gallery (photos, albums, media metadata)
 ├── training (training drills, schedules & coaches)
 ├── sponsors (tiers, partners, transparent logos)
 ├── testimonials (quotes, reviews, achievements)
 ├── club_abouts (club identity, mission, vision, history)
 ├── club_contacts (venues, socials, inquiry coordinates)
 ├── announcements (notices, urgent broadcasts)
 ├── notifications (in-app alerts, badges, tryout updates)
 ├── applications (join club tryout applications)
 └── revoked_tokens (security & JWT revocation with TTL)
```

### Detailed Domain Mapping

| Feature Domain | Target Collection | Primary Fields & Types | Relationships / References | Required Indexes | Key API Operations | Media / Asset Handling |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Clubs / Sports** | `clubs` | `clubId` (str), `name` (str), `sport` (str), `slug` (str), `logo` (str), `loaderLogo` (str), `coverImage` (str), `description` (str), `themeColor` (str), `accentColor` (str), `active` (bool), `status` (enum) | Referenced by `players`, `matches`, `events`, `announcements`, `users` | `{ slug: 1 }` (unique), `{ clubId: 1 }` (unique), `{ active: 1, name: 1 }` | GET `/api/clubs`, GET `/api/clubs/:id`, POST `/api/clubs`, PUT `/api/clubs/:id`, DELETE `/api/clubs/:id` | URLs + Cloudinary public_ids stored. Lazy loaded. |
| **Users / Auth** | `users` | `name` (str), `username` (str), `rtuRollNo` (str), `email` (str), `mobile` (str), `passwordHash` (str), `role` (ref Role), `clubId` (str), `clubs` ([str]), `bio` (str), `sport` (str), `branch` (str), `year` (str), `position` (str), `jerseyNo` (str), `height` (str), `stats` (subdoc), `badges` ([subdoc]), `permissions` ([str]), `active` (bool), `lastLoginAt` (date) | References `roles.name`, links to `clubs.clubId` | `{ username: 1 }` (unique), `{ email: 1 }`, `{ rtuRollNo: 1 }`, `{ role: 1 }`, `{ clubs: 1 }`, `{ active: 1 }` | POST `/api/auth/signup`, POST `/api/auth/login`, GET `/api/auth/me`, GET `/api/profile`, PUT `/api/profile`, GET/POST/PUT/DELETE `/api/users` | Avatar URLs stored. Passwords bcrypt hashed (cost 10+). |
| **Roles & RBAC** | `roles` | `name` (str), `title` (str), `badgeBg` (str), `badgeText` (str), `badgeGlow` (str), `permissions` ([str]), `isSystem` (bool), `description` (str) | Referenced by `users.role` | `{ name: 1 }` (unique) | GET `/api/roles`, POST `/api/roles`, PUT `/api/roles/:id`, DELETE `/api/roles/:id` | None. |
| **Players & Profiles** | `players` | `clubId` (str), `name` (str), `role` (str), `number` (num/str), `userId` (ref User), `photo` (str), `bio` (str), `height` (str), `weight` (str), `experience` (str), `stats` (subdoc), `order` (num), `active` (bool) | Belongs to `clubs.clubId`, optional reference to `users._id` | `{ clubId: 1, order: 1 }`, `{ clubId: 1, active: 1 }`, `{ userId: 1 }` | GET `/api/team`, POST `/api/team`, PUT `/api/team/:id`, DELETE `/api/team/:id` | Player action photos / portrait URLs stored with Cloudinary metadata. |
| **Matches & Multi-Sport Scoring** | `matches` | `clubId` (str), `sport` (enum), `team1` (str), `team2` (str), `opp` (str), `venue` (str), `date` (date/str), `time` (str), `status` (enum: upcoming, live, completed, cancelled), `winner` (enum), `score1` (num), `score2` (num), `team1Score` (num), `team2Score` (num), `setsWonHome` (num), `setsWonAway` (num), `currentPeriod` (num), `scoreSummary` (str), `setScores` ([subdoc]), `sportStats` (subdoc), `playByPlay` ([subdoc]), `mvpUserId` (ref User) | Belongs to `clubs.clubId`, references `users._id` for MVP | `{ clubId: 1, status: 1, date: -1 }`, `{ status: 1 }`, `{ date: -1 }` | GET `/api/matches`, POST `/api/matches`, PUT `/api/matches/:id`, DELETE `/api/matches/:id`, Live scoring endpoints | Team crest URLs stored. |
| **Match Availability & Lineups** | `match_availabilities`| `matchId` (ref Match), `userId` (ref User), `username` (str), `name` (str), `availability` (enum: Available, Tentative, Unavailable), `note` (str), `isStartingLineup` (bool), `position` (str) | References `matches._id` and `users._id` | `{ matchId: 1, userId: 1 }` (unique), `{ matchId: 1, isStartingLineup: 1 }` | POST `/api/matches/:id/availability`, GET `/api/matches/:id/lineup`, PUT `/api/matches/:id/lineup` | None. |
| **Events & Tournaments** | `events` | `clubId` (str), `title` (str), `description` (str), `date` (date/str), `time` (str), `venue` (str), `poster` (str), `regBtnText` (str), `regUrl` (str), `regEnabled` (bool), `maxParticipants` (num), `status` (enum) | Belongs to `clubs.clubId` | `{ clubId: 1, date: -1 }`, `{ status: 1 }` | GET `/api/events`, POST `/api/events`, PUT `/api/events/:id`, DELETE `/api/events/:id` | Event poster banner image URLs with dimensions. |
| **Event RSVPs** | `event_rsvps` | `eventId` (ref Event), `eventTitle` (str), `userId` (ref User), `username` (str), `name` (str), `email` (str), `phone` (str), `rollNo` (str), `teamName` (str), `status` (enum: Registered, Attending, Cancelled) | References `events._id` and `users._id` | `{ eventId: 1, userId: 1 }`, `{ eventId: 1, status: 1 }`, `{ userId: 1 }` | POST `/api/events/:id/rsvp`, DELETE `/api/events/:id/rsvp`, GET `/api/events/:id/rsvps` | None. |
| **News & Articles** | `news` | `clubId` (str), `title` (str), `summary` (str), `content` (str), `author` (str), `image` (str), `tags` ([str]), `publishedAt` (date), `isFeatured` (bool), `views` (num) | Belongs to `clubs.clubId` | `{ clubId: 1, publishedAt: -1 }`, `{ isFeatured: 1 }`, `{ tags: 1 }` | GET `/api/news`, POST `/api/news`, PUT `/api/news/:id`, DELETE `/api/news/:id` | Cover image URL + thumbnail URL. |
| **Gallery & Media** | `gallery` | `clubId` (str), `title` (str), `caption` (str), `imageUrl` (str), `thumbnailUrl` (str), `publicId` (str), `category` (str), `tags` ([str]), `width` (num), `height` (num), `format` (str), `bytes` (num), `order` (num) | Belongs to `clubs.clubId` | `{ clubId: 1, category: 1, createdAt: -1 }`, `{ clubId: 1, order: 1 }` | GET `/api/gallery`, POST `/api/gallery`, PUT `/api/gallery/:id`, DELETE `/api/gallery/:id`, POST `/api/upload` | High-res image URLs with width/height/format for layout stability. |
| **Training Sessions** | `training` | `clubId` (str), `title` (str), `icon` (str), `time` (str), `days` ([str]), `venue` (str), `coach` (str), `desc` (str), `order` (num), `active` (bool) | Belongs to `clubs.clubId` | `{ clubId: 1, order: 1 }` | GET `/api/training`, POST `/api/training`, PUT `/api/training/:id`, DELETE `/api/training/:id` | Icon / thumbnail. |
| **Sponsors & Partners**| `sponsors` | `clubId` (str), `name` (str), `logo` (str), `tier` (enum: Title, Platinum, Gold, Silver, Official Partner), `website` (str), `description` (str), `order` (num), `active` (bool) | Belongs to `clubs.clubId` | `{ clubId: 1, tier: 1, order: 1 }` | GET `/api/sponsors`, POST `/api/sponsors`, PUT `/api/sponsors/:id`, DELETE `/api/sponsors/:id` | Transparent PNG logos with metadata. |
| **Testimonials / Quotes** | `testimonials` | `clubId` (str), `name` (str), `role` (str), `quote` (str), `avatar` (str), `rating` (num), `order` (num), `active` (bool) | Belongs to `clubs.clubId` | `{ clubId: 1, order: 1 }` | GET `/api/testimonials`, POST `/api/testimonials`, PUT `/api/testimonials/:id`, DELETE `/api/testimonials/:id` | Headshot avatars. |
| **Club About & Identity** | `club_abouts` | `clubId` (str), `eyebrow` (str), `title` (str), `sub` (str), `mission` (str), `vision` (str), `history` (str), `values` ([subdoc]), `stats` ([subdoc]) | Belongs to `clubs.clubId` | `{ clubId: 1 }` (unique) | GET `/api/about`, POST/PUT `/api/about` | Banner / facility images. |
| **Club Contact Coordinates**| `club_contacts`| `clubId` (str), `address` (str), `email` (str), `phone` (str), `hours` (str), `socials` (subdoc: insta, fb, yt, wa, x), `mapCoordinates` (subdoc) | Belongs to `clubs.clubId` | `{ clubId: 1 }` (unique) | GET `/api/contact`, POST/PUT `/api/contact` | None. |
| **Announcements & Board** | `announcements` | `title` (str), `content` (str), `clubId` (str), `category` (enum: Urgent, Selection, Practice, Tournament, General), `isPinned` (bool), `authorName` (str), `authorRole` (str), `authorUsername` (str), `expiresAt` (date) | Belongs to `clubs.clubId` ('all' for universal) | `{ clubId: 1, isPinned: -1, createdAt: -1 }` | GET `/api/announcements`, POST `/api/announcements`, PUT `/api/announcements/:id`, DELETE `/api/announcements/:id` | None. |
| **In-App Notifications** | `notifications` | `recipientUsername` (str), `title` (str), `message` (str), `type` (enum: selection, badge, application, match, broadcast), `linkUrl` (str), `read` (bool) | Targets `users.username` | `{ recipientUsername: 1, read: 1, createdAt: -1 }` | GET `/api/notifications`, PUT `/api/notifications/:id/read`, PUT `/api/notifications/read-all`, DELETE `/api/notifications/:id`, POST `/api/notifications/broadcast` | None. |
| **Join Club Applications** | `applications` | `userId` (ref User), `username` (str), `clubSlug` (str), `name` (str), `email` (str), `phone` (str), `position` (str), `experience` (str), `message` (str), `status` (enum: Pending, Reviewed, Accepted, Rejected), `source` (str), `adminFeedback` (str), `tallyEventId` (str), `tallyResponseId` (str) | References `users._id`, targets `clubs.slug` | `{ clubSlug: 1, status: 1, createdAt: -1 }`, `{ userId: 1 }`, `{ email: 1 }`, `{ tallyEventId: 1 }` (sparse unique) | POST `/api/applications`, GET `/api/applications`, GET `/api/profile/applications`, PUT `/api/applications/:id/status`, DELETE `/api/applications/:id`, POST `/api/webhooks/tally` | None. |
| **Token Revocation (Security)** | `revoked_tokens`| `tokenHash` (str), `expiresAt` (date) | Relates to JWT tokens | `{ tokenHash: 1 }` (unique), `{ expiresAt: 1 }` (TTL index) | Auto-checked on authenticated requests | None. |

---

## 2. Architecture & Directory Structure

```
src/
├── config/
│   ├── database.js          # Connection pooling, reconnect logic, serverless cached handler
│   ├── env.js               # Environment variable validation & secret management
│   └── cloudinary.js        # Media storage configuration & upload helper
├── types/
│   ├── models.d.ts          # Complete TypeScript interfaces for every collection
│   └── api.d.ts             # API request/response & pagination types
├── models/
│   ├── Club.js              # Club model schema & indexes
│   ├── User.js              # User model schema & indexes
│   ├── Role.js              # Role & permissions schema
│   ├── Player.js            # Player / Team roster schema & indexes
│   ├── Match.js             # Match, multi-sport live scores & lineup schema
│   ├── MatchAvailability.js # Squad availability & starting 6 lineup schema
│   ├── Event.js             # Event & tournament schema
│   ├── EventRsvp.js         # Event RSVP & registration schema
│   ├── News.js              # News & article schema
│   ├── Gallery.js           # Gallery & media asset metadata schema
│   ├── Training.js          # Training sessions schema
│   ├── Sponsor.js           # Sponsor & partner schema
│   ├── Testimonial.js       # Testimonial & quotes schema
│   ├── ClubAbout.js         # Club about & identity schema
│   ├── ClubContact.js       # Club contact info schema
│   ├── Announcement.js      # Club announcements & notice board schema
│   ├── Notification.js      # In-app notifications schema
│   ├── Application.js       # Tryouts & join club applications schema
│   ├── RevokedToken.js      # JWT revocation token schema with TTL
│   └── index.js             # Central export for all models
├── middleware/
│   ├── auth.js              # JWT verification, cookie parsing & permission check
│   ├── validate.js          # Request validation helper
│   ├── errorHandler.js      # Global error handler with clean sanitized responses
│   └── cache.js             # In-memory TTL caching for high-traffic read routes
├── utils/
│   ├── pagination.js        # Reusable lean pagination, sorting & projection helper
│   ├── sanitize.js          # Input sanitization & query normalization
│   └── seedInitial.js       # Safe initial system seeding (Owner, Roles, Default Club)
└── server.js                # Clean production Express app mount
```
