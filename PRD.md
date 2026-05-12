# CENTRAL — Product Requirements Document

> **Version:** 2.1  
> **Last updated:** May 2026  
> **Purpose:** Comprehensive product context for AI agents, engineers, and contributors working on this codebase.

---

## 1. Product Overview

**CENTRAL** is a multi-tenant church communication and ministry management platform built for college ministries. It is deployed at **joincentral.app**.

The name "CENTRAL" is intentional: it is meant to be the single place where all ministry communication and planning happens, replacing group texts, emails, scattered messaging apps, and disconnected planning tools.

**The core problem it solves:** College ministries are highly relational but logistically fragmented. Leaders blast announcements via text, members use different apps to chat, praise teams coordinate over iMessage, discipleship group leaders have no tools, and no one has a single place to find who someone is, how to pray for them, or what events are coming up.

**The platform vision:** Like Slack for churches — every ministry gets their own isolated workspace with their own members, chats, announcements, teams, and planning tools. A pastor registers their ministry in 5 minutes and invites their congregation.

---

## 2. Target Users

| Role | Description | Access Level |
|------|-------------|--------------|
| **Admin** | Pastor, deacon, elder, or founding leader. | Full control — members, teams, settings, all features, destructive actions |
| **Leader** | DGL, Student Board member, Praise Team member. | Announcements CRUD, church chat management, team planning tools |
| **Member** | Regular church attendee. | Chats, directory, announcements, RSVP, profile, journal, giving |
| **Visitor** | Participant before formal membership. | Identical to Member — full standard access, no admin/leader actions |

> **Note:** A person can be a Member AND be on multiple teams simultaneously. Team membership grants additional access to the Plan tab — it does not replace their base member access.

> **Visitor vs Member:** Visitors have identical permissions to Members in every check. Any code that allows Members must allow Visitors: `["member", "visitor"].includes(role)`. The distinction is purely social/organizational — admins can tell at a glance who hasn't completed membership (white outlined badge vs. filled cream badge).

**Leader subtypes:** DGL, Student Org Board, Praise Team — all share the leader permission tier.  
**Admin subtypes:** Pastors, Deacons, Elders — all share the admin permission tier.

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Database + Auth | Supabase (Postgres + Row Level Security + Realtime) |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui (Radix primitives) |
| Language | TypeScript (strict) |
| Fonts | Instrument Serif (display) / Inter (UI) |
| Hosting | Vercel |
| Domain | joincentral.app (Namecheap → Vercel) |

### Key conventions
- All components use Tailwind utility classes — no CSS modules, no styled-components.
- The desktop app uses a three-column shell: dark icon rail (76px) + cream sidebar (304px) + flexible main column.
- All database reads/writes go through the Supabase JS client (`lib/supabase.ts` for client, `lib/supabase-server.ts` for server components).
- Server actions live in `app/actions/`.
- The entire app shell lives in `app/home/home-app.tsx` — a single large client component, intentionally not split.
- Middleware lives in `proxy.ts` — `middleware.ts` was deleted and must not be recreated.

---

## 4. Design System

> **Direction: Quiet Modern** — editorial cream-and-plum aesthetic. Read `skills/design-system/design-system.md` for the full spec. The summary below is for quick reference only.

### Core colors
| Token | Hex | Use |
|-------|-----|-----|
| `--plum` | `#3E1540` | Primary accent, active borders, hero gradients |
| `--plum-2` | `#2D0F2E` | Primary button background, active text |
| `--ink` | `#13101A` | Primary headings, message content |
| `--gold` | `#D4A45C` | Avatar accent only — never as button color |
| `--cream` | `#FBF8F2` | Primary surface (page bg, cards) |
| `--body` | `#5A5466` | Body text, descriptions |
| `--muted` | `#8A8497` | Timestamps, secondary labels |
| `--line` | `#E8E2D2` | Primary hairline |

> **Rules:** Max 2–3 plum elements per screen. Gold for avatar accent only. No colored shadows. No pure white — always cream. Full token list in `skills/design-system/design-system.md`.

### Typography
- **Display / headings:** Instrument Serif — page titles, section headers, card titles, stat numbers
- **UI / body:** Inter — all other text
- **Eyebrows:** monospace, 11px, tracking 1.4, all-caps — required above every H1 and H2
- Never bold serif. Never Inter for headlines.

### Shell layout (desktop)
[ 76px dark icon rail ] [ 304px cream sidebar ] [ flexible main column ]
- Icon rail: `#13101A` background, plum primary "+" button, section icons
- Sidebar: cream `#FBF8F2`, 304px, verse callout always present at bottom
- Main column: cream, breadcrumb header top, content below

### Z-index layers
| Element | Z |
|---------|---|
| Bottom nav | 50 |
| Announcement detail | 50 |
| Member sheet | 60 |
| Announcements modal | 60 |
| Chat screen | 100 |
| Chat settings | 110 |
| Emoji dismiss overlay | 150 |
| Emoji picker | 160 |

---

## 5. Database Schema

### `ministries`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `name` | text | e.g. "Central Church Student Fellowship" |
| `university` | text | |
| `size` | text | `"small"`, `"medium"`, `"large"` |
| `invite_code` | text | Unique, members use to join |
| `is_public` | boolean | Controls public discovery listing |
| `created_by` | UUID | FK → auth.users |
| `created_at` | timestamptz | |

### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Matches `auth.users.id` |
| `ministry_id` | UUID | FK → ministries(id) — NULL until user completes /join |
| `name` | text | |
| `email` | text | |
| `graduation_year` | int | |
| `role` | text | `"admin"`, `"leader"`, `"member"`, `"visitor"` — always lowercase |
| `about_me` | text? | |
| `bible_verse` | text? | |
| `prayer_request` | text? | |
| `pray_for_me` | text? | |

### `groups`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `ministry_id` | UUID | FK → ministries(id) |
| `name` | text | |
| `type` | text | `"church"`, `"my"`, `"dm"` |
| `created_by` | UUID | |
| `archived` | boolean | |

### `group_members`
| Column | Type | Notes |
|--------|------|-------|
| `group_id` | UUID | |
| `user_id` | UUID | |
| `last_read_at` | timestamptz? | |

### `messages`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | |
| `group_id` | UUID | |
| `sender_id` | UUID | |
| `content` | text | |
| `created_at` | timestamptz | |
| `reply_to_id` | UUID? | FK → messages(id) ON DELETE SET NULL |

### `message_reactions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | |
| `message_id` | UUID | |
| `user_id` | UUID | |
| `emoji` | text | One of: 👍 ❤️ 😂 🙏 🔥 😮 |
| `created_at` | timestamptz | |

**Constraint:** `UNIQUE(message_id, user_id, emoji)`

### `announcements`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | |
| `ministry_id` | UUID | FK → ministries(id) |
| `title` | text | |
| `body` | text | |
| `created_at` | timestamptz | |
| `is_pinned` | boolean | |
| `is_event` | boolean | |
| `image_url` | text? | |
| `audience` | text? | `"all"`, `"2025"`–`"2028"`, `"group"` |
| `created_by` | UUID? | |
| `show_attendees` | boolean | Controls whether members can see RSVP list |

### `announcement_views`
| Column | Type | Notes |
|--------|------|-------|
| `announcement_id` | UUID | |
| `user_id` | UUID | |
**Constraint:** `UNIQUE(announcement_id, user_id)`

### `rsvps`
| Column | Type | Notes |
|--------|------|-------|
| `announcement_id` | UUID | |
| `user_id` | UUID | |
**Constraint:** `UNIQUE(announcement_id, user_id)` — enforces one RSVP per person, enables toggle behavior

### `teams`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `ministry_id` | UUID | FK → ministries(id) |
| `name` | text | |
| `description` | text? | |
| `icon` | text? | Emoji icon |
| `created_by` | UUID | FK → profiles(id) |
| `created_at` | timestamptz | |

### `team_roles`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `team_id` | UUID | FK → teams(id) |
| `name` | text | |
| `permissions` | JSONB | Array of permission flags |
| `created_at` | timestamptz | |

### `team_members`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `team_id` | UUID | FK → teams(id) |
| `user_id` | UUID | FK → profiles(id) |
| `role_id` | UUID | FK → team_roles(id) |
| `added_by` | UUID | FK → profiles(id) |
| `joined_at` | timestamptz | |
**Constraint:** `UNIQUE(team_id, user_id)`

### Worship tables
`worship_weeks`, `worship_songs`, `worship_roles`, `worship_availability`, `worship_charts`, `worship_annotations` — see §8.12 for full schema.

### Storage buckets
| Bucket | Access |
|--------|--------|
| `announcement-images` | Public |
| `devotionals` | Public |
| `profile-images` | Needs public toggle + policies |
| `worship-charts` | Public |

---

## 6. Row Level Security (RLS)

All data is scoped by `ministry_id`. Two SECURITY DEFINER helpers bypass profile-table RLS to prevent recursion:
- `auth_ministry_id()` — returns current user's `ministry_id`
- `auth_is_admin_or_leader()` — returns `true` if role is admin or leader

**Never query `profiles` directly inside other table RLS policies — use these helpers.**

### Per-table summary
- **`ministries`** — SELECT: any authenticated user. INSERT: any authenticated user. UPDATE: admin only.
- **`profiles`** — SELECT: same ministry members. UPDATE: own row only.
- **`groups`** — SELECT: group member. INSERT: any ministry member. UPDATE: admin/leader for church type.
- **`group_members`** — SELECT: any ministry member. INSERT: any ministry member. UPDATE: own row. DELETE: self or admin/leader.
- **`messages`** — SELECT/INSERT: group members only. `sender_id` must equal `auth.uid()`.
- **`message_reactions`** — SELECT: via group membership. INSERT/DELETE: own rows only.
- **`teams`** — SELECT: ministry members. INSERT/UPDATE: admin only.
- **`team_roles`** — SELECT: ministry members. INSERT/UPDATE: `can_manage_team` permission.
- **`team_members`** — SELECT: ministry members. INSERT: existing team member. DELETE: self or `can_manage_team`.
- **`rsvps`** — INSERT: own row only. DELETE: own row only. SELECT: own row always; all rows for admin/leader; all rows for members when `show_attendees = true`.

---

## 7. Application Structure

### Middleware
Lives in `proxy.ts` — never recreate `middleware.ts`.

**Public routes:** `/`, `/landing`, `/login`, `/signup`, `/join`, `/onboarding`, `/ministries`, `/auth/`

**Routing logic:**
Unauthenticated → /login
Authenticated, no ministry_id → /join
Authenticated, has ministry_id → /home

### Entry paths
Landing (joincentral.app)
├── I have an account → /login → /home
├── Find my ministry → /join → browse or invite code
└── Register my ministry → /onboarding → wizard → /home

### Tab structure
Desktop shell (home-app.tsx)
├── HomeTab           — greeting, role badge, up next event, stats, recent chats
├── AnnouncementsTab  — full feed, RSVP, admin/leader CRUD, Cards/Compact view
├── ChatsTab          — Church Chats / My Chats, search, unread badges
├── PlanTab           — team planning (Praise Team, Student Org Board, Small Groups)
├── DirectoryTab      — searchable member list, DM creation
├── JournalTab        — devotionals, prayers, verses
├── GivingTab         — Zelle info, editable by admins
└── ProfileTab        — spiritual profile fields (About, Verse, Prayer)

### Sidebar nav modes
- `navMode="home"` — Home, Announcements, Church Settings (admin only)
- `navMode="teams"` — team-scoped surfaces (Plan tab)
- `navMode="profile"` — Profile, Journal
- `navMode="give"` — Give

### Global state (HomeApp)
- `activeTab` — which tab is visible
- `globalOpenChat` — mounts ChatScreen above everything when non-null
- `totalChatsUnread` — drives BottomNav badge
- `chatRefreshKey` — incremented on chat close to trigger refreshes
- `recentChats` — top 3 chats by latest message, kept live via Realtime
- `ministryId` — current user's ministry UUID, passed to all DB-writing components

---

## 8. Feature Specifications

### 8.1 Authentication
- Email + password via Supabase auth. Google OAuth supported (desktop verified, mobile in progress).
- Email verification enabled.
- On signup, `handle_new_user()` trigger fires `AFTER INSERT ON auth.users` and auto-creates `profiles` row. `ministry_id` is NULL until user completes `/join`.
- Middleware uses `supabase.auth.getUser()` exclusively — never `getSession()`.

### 8.2 Home Tab
- Personal greeting with first name, time-of-day aware.
- Role badge (Admin / Leader / Member) shown below name.
- Stats row: upcoming events, unread messages, member count (member count visible to admins only).
- "Up Next" hero card — next upcoming event by date, plum gradient treatment.
- "For You" section — unread announcements and events the user hasn't RSVPed to.
- Recent chats preview (top 3).

### 8.3 Announcements Tab
- Feed with Cards and Compact view toggle.
- Filter pills: All, Events, Posts, Pinned.
- RSVP is a toggle — one row per (user, announcement). Insert on first click, delete on second. Duplicate RSVPs are impossible.
- Leaders and admins always see the full RSVP attendee list.
- Admins can toggle `show_attendees` per announcement to control member visibility.
- Admin/leader CRUD: create, edit, delete announcements.
- View count tracking via `announcement_views`.

### 8.4 Chats Tab
- Two sub-tabs: Church Chats (leader/admin created) and My Chats (any member).
- Search across all chats.
- Unread badge tracking.
- New chats appear in sidebar without page refresh.
- Admins can delete any chat.

### 8.5 ChatScreen
- Real-time messaging via Supabase Realtime.
- Tap (< 400ms) = emoji picker. Long-press (≥ 400ms) = reply/context menu. Never break this distinction.
- Emoji reactions: 👍 ❤️ 😂 🙏 🔥 😮
- Threaded replies with quoted message preview.
- Read receipts via `last_read_at` on `group_members`.

### 8.6 Directory Tab
- Searchable member list scoped to the current ministry.
- Opens MemberSheet with spiritual profile fields.
- DM creation from member sheet.

### 8.7 Profile Tab
- Editable fields: About me, Bible verse, Prayer request, How to pray for me this week.
- Plum hero banner with name and role badge.
- Profile and Journal sub-tabs.
- Sign out in sidebar only — not on profile page.

### 8.8 Journal Tab
- Devotionals, prayers, and verses.
- Personal — not visible to other members.

### 8.9 Giving Tab
- Displays ministry's Zelle destination (email/phone).
- Admins can edit the Zelle info.
- Disclaimer: Central does not process payments or track gifts.
- Amount selector UI (purely informational — opens Zelle externally).

### 8.10 Church Settings Tab
- Visible to admins only. Hidden entirely from members and leaders.
- Ministry profile card with edit capability (name, description, university).
- Member list — shows 6 members by default, "View all N members →" expands.
- Role management — admins can change any member's role (promote to leader/admin, demote, remove).
- Overview stat cards: Members, Leaders, Admins, Regular members.
- Discovery toggle — controls `is_public` on the ministry.
- Invite code with copy and regenerate.
- Danger zone — archive/delete ministry with confirmation modal.

### 8.11 Onboarding Flow
**Route:** `/onboarding` — full screen wizard, no bottom nav.

- Step 1: Basic info (ministry name, university, size)
- Step 2: Structure questions (praise team, small groups, student org, tech team)
- Step 3: Preset team recommendations based on answers
- Step 4: Customize team names, roles, permissions
- Step 5: Invite first members or share invite code

On completion: ministry created, admin profile linked, redirect to `/home`.

### 8.12 Praise Team Plan Tab
Four sub-tabs: **Schedule**, **Set Builder**, **Slides**, **Charts**.

**Roles:** President (full access), Leader (assigned weeks only), Member (read-only, own weeks only).

**Features:**
- Monthly schedule with weekly set cards (date, leader, set list, roster, status)
- Availability system — members mark Sundays, leaders see availability when building roster
- Song set list with title, key, assigned song leader, drag-and-drop reorder
- Lyric slide generator via Anthropic API
- Chord chart upload (PDF) with OCR extraction via Tesseract.js
- In-app chart viewer

**Worship tables:** `worship_weeks`, `worship_songs`, `worship_roles`, `worship_availability`, `worship_charts`, `worship_annotations`

---

## 9. Realtime Architecture

| Channel | Table | Events | Consumer |
|---------|-------|--------|---------|
| `group-messages-{groupId}` | `messages` | INSERT | `ChatScreen` |
| `reactions-{groupId}` | `message_reactions` | INSERT, DELETE | `ChatScreen` |
| `home-app-recent-chats` | `messages` | INSERT | `HomeApp` |
| `read-receipts-{groupId}` | `group_members` | UPDATE | `ChatScreen` |

---

## 10. Roles & Permissions

| Feature | Member | Leader | Admin |
|---------|--------|--------|-------|
| View announcements | ✓ | ✓ | ✓ |
| Create/edit/delete announcements | ✗ | ✓ | ✓ |
| Create church chats | ✗ | ✓ | ✓ |
| Create my/DM chats | ✓ | ✓ | ✓ |
| Archive/manage church chats | ✗ | ✓ | ✓ |
| Delete any chat | ✗ | ✗ | ✓ |
| View RSVP attendee list | ✗ | ✓ | ✓ |
| Toggle public attendee visibility | ✗ | ✗ | ✓ |
| Access Church Settings | ✗ | ✗ | ✓ |
| Change member roles | ✗ | ✗ | ✓ |
| Remove members | ✗ | ✗ | ✓ |
| Edit giving info | ✗ | ✗ | ✓ |
| Edit ministry profile | ✗ | ✗ | ✓ |
| Regenerate invite code | ✗ | ✗ | ✓ |
| Toggle public discovery | ✗ | ✗ | ✓ |

**Role check pattern:** always `["admin", "leader"].includes(userRole.toLowerCase())`

---

## 11. Critical Conventions

1. **Never use `localStorage` or `sessionStorage`** — Supabase session only
2. **Optimistic updates** on all user-facing writes (messages, reactions, RSVPs)
3. **All DB writes** go through the browser Supabase client or server actions — no raw fetch
4. **Don't split `home-app.tsx`** — intentionally one file
5. **Tap vs long-press in ChatScreen:** < 400ms = emoji picker, ≥ 400ms = reply — never break this
6. **ministry_id on all writes:** every INSERT/UPDATE must include `.eq("ministry_id", ministryId)` — defense-in-depth on top of RLS
7. **RSVP is a toggle:** UNIQUE constraint on (announcement_id, user_id). Insert = going, delete = not going. Never duplicate.
8. **Middleware is `proxy.ts`:** never recreate `middleware.ts`
9. **Always read `skills/design-system/SKILL.md`** before writing or editing any UI code

---

## 12. Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (auth callback) |
| `ANTHROPIC_API_KEY` | Praise team slideshow generator |
| `NEXT_PUBLIC_SITE_URL` | `https://joincentral.app` |

---

## 13. File Map
central/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── join/page.tsx
│   ├── landing/page.tsx
│   ├── ministries/page.tsx
│   ├── onboarding/page.tsx
│   ├── actions/
│   │   ├── create-group.ts
│   │   └── ministry.ts
│   ├── home/
│   │   ├── home-app.tsx
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/ui/
│   ├── avatar.tsx
│   ├── bottom-nav.tsx
│   ├── button.tsx
│   ├── card.tsx
│   ├── chats-section.tsx
│   ├── input.tsx
│   └── label.tsx
├── lib/
│   ├── supabase.ts
│   ├── supabase-server.ts
│   └── utils.ts
├── skills/
│   └── design-system/
│       ├── SKILL.md
│       └── design-system.md
├── supabase/
│   ├── multi_tenant_migration.sql
│   ├── profile_trigger_migration.sql
│   └── [other migration files]
├── proxy.ts
├── CLAUDE.md
└── PRD.md

---

## 14. Vision and Principles

**What CENTRAL should feel like:** A calm, focused workspace built for ministry — not a generic SaaS tool, not a social feed.

**What it is NOT:**
- Not a general-purpose Slack clone
- Not a social media feed
- Not publicly accessible without an invite

**Design principles:**
1. **Quiet Modern.** Editorial cream and plum. Instrument Serif gives warmth; Inter keeps it legible.
2. **Content over chrome.** Minimal decoration. Whitespace is load-bearing.
3. **Realtime first.** The app should never feel stale.
4. **Spiritual intentionality.** Prayer requests, Bible verses, and "pray for me this week" are first-class features.
5. **Role-appropriate simplicity.** Members see a calm focused app. Leaders and admins see tools. The UI reflects who you are.
6. **Platform thinking.** Built for any college ministry anywhere — not just one church.

---

## 15. Roadmap

### Completed
- Real-time messaging with reply threading and emoji reactions
- Read receipts and unread badge tracking
- Announcements with RSVP toggle, attendee visibility control, audience targeting, image uploads
- Member directory with DM creation
- Chat settings (rename, add/remove members, archive, delete)
- Multi-tenant architecture with RLS and invite-code join flow
- Teams and roles schema
- Plan tab — Praise Team (schedule, set builder, slide generator, chart upload + OCR)
- Church Settings — member management, role assignment, discovery toggle, invite code
- Giving tab with Zelle info
- Journal tab with devotionals, prayers, verses
- Public ministry discovery (/ministries, /join)
- Ministry registration wizard (/onboarding)
- Google OAuth (desktop)
- Landing page with chapel photo hero
- Design system documented in `skills/design-system/`

### In Progress
- Google OAuth mobile
- Design consistency pass using design system skill
- Home page redesign (personal briefing, role badge, stats)
- Settings page expansion (full admin control panel)

### Near-term
- Push notifications (Web Push API + VAPID keys)
- Security review before church presentation
- Chat UX fixes (new chat in sidebar without refresh)

### Mid-term
- Small group leaders tools
- Bible study generator
- Event planning tools
- Attendance tracking
- PWA support

### Long-term
- SongSelect integration
- Visitor onboarding flow
- Analytics dashboard
- Finances tracking