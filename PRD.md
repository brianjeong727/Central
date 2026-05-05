# CENTRAL — Product Requirements Document

> **Version:** 2.0  
> **Last updated:** April 2026  
> **Purpose:** Comprehensive product context for AI agents, engineers, and contributors working on this codebase.

---

## 1. Product Overview

**CENTRAL** is a mobile-first church communication and ministry management platform built for college ministries. It is a multi-tenant platform — any college ministry can sign up, create their own workspace, and invite their members.

The name "CENTRAL" is intentional: it is meant to be the single place where all ministry communication and planning happens, replacing group texts, emails, scattered messaging apps, and disconnected planning tools.

**The core problem it solves:** College ministries are highly relational but logistically fragmented. Leaders blast announcements via text, members use different apps to chat, praise teams coordinate over iMessage, discipleship group leaders have no tools, and no one has a single place to find who someone is, how to pray for them, or what events are coming up.

**The platform vision:** Like Slack for churches — every ministry gets their own isolated workspace with their own members, chats, announcements, teams, and planning tools. A pastor registers their ministry in 5 minutes and invites their congregation.

---

## 2. Target Users

| Role | Description | Access Level |
|------|-------------|--------------|
| **Ministry Admin** | Pastor, deacon, or founding leader who registers the ministry. | Full control over workspace — members, teams, all features |
| **Admin** | Trusted leader assigned by Ministry Admin. | All features + destructive actions within the ministry |
| **Team Member** | Member assigned to a team (PT, DGL, CCSF, etc). | Access to their team's Plan tab tools only |
| **Member** | Regular church attendee. | Chats, directory, announcements, RSVP, profile |
| **Visitor** | Not yet implemented. Intended for first-time guests. | Limited read access (planned) |

> **Note:** A person can be a Member AND be on multiple teams simultaneously. Team membership grants additional access to the Plan tab — it does not replace their base member access.

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router, v16) |
| Database + Auth | Supabase (Postgres + Row Level Security + Realtime) |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui (Radix primitives) |
| Language | TypeScript (strict) |
| Font | Instrument Serif (display) / Inter (UI) |
| Hosting | Vercel |

### Key conventions
- All components use Tailwind utility classes — no CSS modules, no styled-components.
- The app renders in a **max-width 390px centered column** to simulate a native mobile app in the browser.
- All database reads/writes go through the Supabase JS client (`lib/supabase.ts` for client, `lib/supabase-server.ts` for server components).
- Server actions live in `app/actions/`.
- The entire app shell lives in `app/home/home-app.tsx` — a single large client component file organized into tab components.

---

## 4. Design System

> **Direction: Quiet Modern** — regal plum palette, warm ivory surfaces, Instrument Serif for display text.

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| Primary (regal plum) | `#3E1540` | Buttons, active nav, hero card bg, chat avatars (alternating) |
| Primary hover | `#2D0F2E` | Hover states on plum elements |
| Ink | `#13101A` | Primary headings, message content, second avatar color |
| Gold accent | `#C9A34B` | Unread badges only — sparingly |
| Surface | `#FBF8F2` | Page background, card bg, input fills |
| Border | `#ECE8DE` | Card borders, inputs, dividers |
| Body text | `#5A5466` | Announcement body, chat previews |
| Muted text | `#8A8497` | Timestamps, secondary labels |
| Faint text | `#C4C4C4` | Placeholders |
| Ivory | `#F6F4EF` | Text/icons on plum backgrounds |

> **Rules:** Max 2–3 plum elements per screen. Gold only for unread badges. No colored shadows — neutral only (`rgba(19,16,26,0.08)`).

### Layout
- Outer wrapper: `max-w-[390px] mx-auto` — always centered, never full-width.
- Full-screen overlays: `fixed inset-0 z-[N]` with `max-w-[390px] mx-auto w-full h-full flex flex-col`.
- Bottom nav height: accounted for with `pb-28` on scrollable content.
- Safe area: `pt-12` on full-screen overlay headers (accounts for iOS status bar).

### Typography
- **Display / headings:** Instrument Serif via `var(--font-instrument-serif)`
- **UI / body:** Inter via `var(--font-inter)`
- Section headers: Instrument Serif ~26px, weight 400, `#13101A`. No uppercase label bars.
- Primary headings: Instrument Serif 36px, `#13101A`.
- Chat bubbles: `text-[14px] leading-relaxed`.

### Z-index layers
| Layer | Z value | Element |
|-------|---------|---------|
| Bottom nav | 50 | `BottomNav` |
| Announcement detail | 50 | `AnnouncementDetail` |
| Member sheet | 60 | `MemberSheet` |
| Announcements modal | 60 | `CreateAnnouncementModal` |
| Chat screen | 100 | `ChatScreen` |
| Chat settings | 110 | `ChatSettings` |
| Emoji dismiss overlay | 150 | Dismiss overlay |
| Emoji picker | 160 | Picker pill |

---

## 5. Database Schema

### `ministries`
The core multi-tenant table. Each ministry is a fully isolated workspace.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `name` | text | e.g. "Central Church Student Fellowship" |
| `university` | text | e.g. "University of Pittsburgh" |
| `size` | text | `"small"`, `"medium"`, `"large"` |
| `invite_code` | text | Unique short code members use to join |
| `created_by` | UUID | FK → auth.users (the Ministry Admin) |
| `created_at` | timestamptz | |

### `profiles`
Stores all user profile data. Created on signup.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Matches `auth.users.id` |
| `ministry_id` | UUID | FK → ministries(id) |
| `name` | text | |
| `email` | text | |
| `graduation_year` | int | |
| `role` | text | `"admin"`, `"leader"`, `"member"` — always lowercase |
| `about_me` | text? | |
| `bible_verse` | text? | |
| `prayer_request` | text? | |
| `pray_for_me` | text? | |

### `teams`
Flexible teams within a ministry. Created and named by the ministry admin.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `ministry_id` | UUID | FK → ministries(id) |
| `name` | text | e.g. "Praise Team", "CCSF Board" |
| `description` | text? | |
| `icon` | text? | Emoji icon |
| `created_by` | UUID | FK → profiles(id) |
| `created_at` | timestamptz | |

### `team_roles`
Custom roles within each team with granular permissions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `team_id` | UUID | FK → teams(id) |
| `name` | text | e.g. "President", "Worship Leader", "Member" |
| `permissions` | JSONB | Array of permission flags |
| `created_at` | timestamptz | |

**Permission flags:**
- `can_manage_worship_set`
- `can_view_worship_set`
- `can_generate_slides`
- `can_create_dgs`
- `can_view_dgs`
- `can_generate_bible_study`
- `can_track_attendance`
- `can_plan_events`
- `can_view_finances`
- `can_manage_members`
- `can_manage_team`

### `team_members`
Join table linking users to teams with their assigned role.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `team_id` | UUID | FK → teams(id) |
| `user_id` | UUID | FK → profiles(id) |
| `role_id` | UUID | FK → team_roles(id) |
| `added_by` | UUID | FK → profiles(id) |
| `joined_at` | timestamptz | |

**Rule:** Any existing team member can add new members to their team.  
**Constraint:** `UNIQUE(team_id, user_id)`

### `groups`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | |
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
**Config:** REPLICA IDENTITY FULL + Realtime enabled.

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

### `announcement_views`
| Column | Type | Notes |
|--------|------|-------|
| `announcement_id` | UUID | |
| `user_id` | UUID | |

### `rsvps`
| Column | Type | Notes |
|--------|------|-------|
| `announcement_id` | UUID | |
| `user_id` | UUID | |

### Storage Buckets
- `announcement-images` — Public bucket.

---

## 6. Row Level Security (RLS) Summary

All data is scoped by `ministry_id`. Users can only see data belonging to their ministry.

### `ministries`
- **SELECT:** Any authenticated user (for ministry search/discovery)
- **INSERT:** Any authenticated user (to register a new ministry)
- **UPDATE:** Ministry Admin only

### `profiles`
- **SELECT:** Members of the same ministry
- **UPDATE:** Own row only

### `groups`
- **SELECT:** User must be in `group_members` for that group
- **INSERT:** Any ministry member
- **UPDATE:** Admin/leader for church type; any member for my/dm type

### `group_members`
- **SELECT:** Any ministry member
- **INSERT:** Any ministry member
- **UPDATE:** Own row only (for `last_read_at`)
- **DELETE:** Self-remove always; admin/leader can remove others from church chats

### `messages`
- **SELECT:** User must be a group member
- **INSERT:** User must be a group member, `sender_id` must equal `auth.uid()`

### `message_reactions`
- **SELECT:** Via group membership
- **INSERT/DELETE:** Own rows only

### `teams`
- **SELECT:** Ministry members
- **INSERT/UPDATE:** Ministry Admin or Admin

### `team_roles`
- **SELECT:** Ministry members
- **INSERT/UPDATE:** Team members with `can_manage_team` permission

### `team_members`
- **SELECT:** Ministry members
- **INSERT:** Any existing member of that team
- **DELETE:** Self-remove or `can_manage_team` permission

---

## 7. Application Structure

### Routing
Got it — here's the fully updated PRD:

markdown
# CENTRAL — Product Requirements Document

> **Version:** 2.0  
> **Last updated:** April 2026  
> **Purpose:** Comprehensive product context for AI agents, engineers, and contributors working on this codebase.

---

## 1. Product Overview

**CENTRAL** is a mobile-first church communication and ministry management platform built for college ministries. It is a multi-tenant platform — any college ministry can sign up, create their own workspace, and invite their members.

The name "CENTRAL" is intentional: it is meant to be the single place where all ministry communication and planning happens, replacing group texts, emails, scattered messaging apps, and disconnected planning tools.

**The core problem it solves:** College ministries are highly relational but logistically fragmented. Leaders blast announcements via text, members use different apps to chat, praise teams coordinate over iMessage, discipleship group leaders have no tools, and no one has a single place to find who someone is, how to pray for them, or what events are coming up.

**The platform vision:** Like Slack for churches — every ministry gets their own isolated workspace with their own members, chats, announcements, teams, and planning tools. A pastor registers their ministry in 5 minutes and invites their congregation.

---

## 2. Target Users

| Role | Description | Access Level |
|------|-------------|--------------|
| **Ministry Admin** | Pastor, deacon, or founding leader who registers the ministry. | Full control over workspace — members, teams, all features |
| **Admin** | Trusted leader assigned by Ministry Admin. | All features + destructive actions within the ministry |
| **Team Member** | Member assigned to a team (PT, DGL, CCSF, etc). | Access to their team's Plan tab tools only |
| **Member** | Regular church attendee. | Chats, directory, announcements, RSVP, profile |
| **Visitor** | Not yet implemented. Intended for first-time guests. | Limited read access (planned) |

> **Note:** A person can be a Member AND be on multiple teams simultaneously. Team membership grants additional access to the Plan tab — it does not replace their base member access.

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router, v16) |
| Database + Auth | Supabase (Postgres + Row Level Security + Realtime) |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui (Radix primitives) |
| Language | TypeScript (strict) |
| Font | Instrument Serif (display) / Inter (UI) |
| Hosting | Vercel |

### Key conventions
- All components use Tailwind utility classes — no CSS modules, no styled-components.
- The app renders in a **max-width 390px centered column** to simulate a native mobile app in the browser.
- All database reads/writes go through the Supabase JS client (`lib/supabase.ts` for client, `lib/supabase-server.ts` for server components).
- Server actions live in `app/actions/`.
- The entire app shell lives in `app/home/home-app.tsx` — a single large client component file organized into tab components.

---

## 4. Design System

> **Direction: Quiet Modern** — regal plum palette, warm ivory surfaces, Instrument Serif for display text.

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| Primary (regal plum) | `#3E1540` | Buttons, active nav, hero card bg, chat avatars (alternating) |
| Primary hover | `#2D0F2E` | Hover states on plum elements |
| Ink | `#13101A` | Primary headings, message content, second avatar color |
| Gold accent | `#C9A34B` | Unread badges only — sparingly |
| Surface | `#FBF8F2` | Page background, card bg, input fills |
| Border | `#ECE8DE` | Card borders, inputs, dividers |
| Body text | `#5A5466` | Announcement body, chat previews |
| Muted text | `#8A8497` | Timestamps, secondary labels |
| Faint text | `#C4C4C4` | Placeholders |
| Ivory | `#F6F4EF` | Text/icons on plum backgrounds |

> **Rules:** Max 2–3 plum elements per screen. Gold only for unread badges. No colored shadows — neutral only (`rgba(19,16,26,0.08)`).

### Layout
- Outer wrapper: `max-w-[390px] mx-auto` — always centered, never full-width.
- Full-screen overlays: `fixed inset-0 z-[N]` with `max-w-[390px] mx-auto w-full h-full flex flex-col`.
- Bottom nav height: accounted for with `pb-28` on scrollable content.
- Safe area: `pt-12` on full-screen overlay headers (accounts for iOS status bar).

### Typography
- **Display / headings:** Instrument Serif via `var(--font-instrument-serif)`
- **UI / body:** Inter via `var(--font-inter)`
- Section headers: Instrument Serif ~26px, weight 400, `#13101A`. No uppercase label bars.
- Primary headings: Instrument Serif 36px, `#13101A`.
- Chat bubbles: `text-[14px] leading-relaxed`.

### Z-index layers
| Layer | Z value | Element |
|-------|---------|---------|
| Bottom nav | 50 | `BottomNav` |
| Announcement detail | 50 | `AnnouncementDetail` |
| Member sheet | 60 | `MemberSheet` |
| Announcements modal | 60 | `CreateAnnouncementModal` |
| Chat screen | 100 | `ChatScreen` |
| Chat settings | 110 | `ChatSettings` |
| Emoji dismiss overlay | 150 | Dismiss overlay |
| Emoji picker | 160 | Picker pill |

---

## 5. Database Schema

### `ministries`
The core multi-tenant table. Each ministry is a fully isolated workspace.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `name` | text | e.g. "Central Church Student Fellowship" |
| `university` | text | e.g. "University of Pittsburgh" |
| `size` | text | `"small"`, `"medium"`, `"large"` |
| `invite_code` | text | Unique short code members use to join |
| `created_by` | UUID | FK → auth.users (the Ministry Admin) |
| `created_at` | timestamptz | |

### `profiles`
Stores all user profile data. Created on signup.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Matches `auth.users.id` |
| `ministry_id` | UUID | FK → ministries(id) |
| `name` | text | |
| `email` | text | |
| `graduation_year` | int | |
| `role` | text | `"admin"`, `"leader"`, `"member"` — always lowercase |
| `about_me` | text? | |
| `bible_verse` | text? | |
| `prayer_request` | text? | |
| `pray_for_me` | text? | |

### `teams`
Flexible teams within a ministry. Created and named by the ministry admin.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `ministry_id` | UUID | FK → ministries(id) |
| `name` | text | e.g. "Praise Team", "CCSF Board" |
| `description` | text? | |
| `icon` | text? | Emoji icon |
| `created_by` | UUID | FK → profiles(id) |
| `created_at` | timestamptz | |

### `team_roles`
Custom roles within each team with granular permissions.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `team_id` | UUID | FK → teams(id) |
| `name` | text | e.g. "President", "Worship Leader", "Member" |
| `permissions` | JSONB | Array of permission flags |
| `created_at` | timestamptz | |

**Permission flags:**
- `can_manage_worship_set`
- `can_view_worship_set`
- `can_generate_slides`
- `can_create_dgs`
- `can_view_dgs`
- `can_generate_bible_study`
- `can_track_attendance`
- `can_plan_events`
- `can_view_finances`
- `can_manage_members`
- `can_manage_team`

### `team_members`
Join table linking users to teams with their assigned role.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `team_id` | UUID | FK → teams(id) |
| `user_id` | UUID | FK → profiles(id) |
| `role_id` | UUID | FK → team_roles(id) |
| `added_by` | UUID | FK → profiles(id) |
| `joined_at` | timestamptz | |

**Rule:** Any existing team member can add new members to their team.  
**Constraint:** `UNIQUE(team_id, user_id)`

### `groups`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | |
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
**Config:** REPLICA IDENTITY FULL + Realtime enabled.

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

### `announcement_views`
| Column | Type | Notes |
|--------|------|-------|
| `announcement_id` | UUID | |
| `user_id` | UUID | |

### `rsvps`
| Column | Type | Notes |
|--------|------|-------|
| `announcement_id` | UUID | |
| `user_id` | UUID | |

### Storage Buckets
- `announcement-images` — Public bucket.

---

## 6. Row Level Security (RLS) Summary

All data is scoped by `ministry_id`. Users can only see data belonging to their ministry.

### `ministries`
- **SELECT:** Any authenticated user (for ministry search/discovery)
- **INSERT:** Any authenticated user (to register a new ministry)
- **UPDATE:** Ministry Admin only

### `profiles`
- **SELECT:** Members of the same ministry
- **UPDATE:** Own row only

### `groups`
- **SELECT:** User must be in `group_members` for that group
- **INSERT:** Any ministry member
- **UPDATE:** Admin/leader for church type; any member for my/dm type

### `group_members`
- **SELECT:** Any ministry member
- **INSERT:** Any ministry member
- **UPDATE:** Own row only (for `last_read_at`)
- **DELETE:** Self-remove always; admin/leader can remove others from church chats

### `messages`
- **SELECT:** User must be a group member
- **INSERT:** User must be a group member, `sender_id` must equal `auth.uid()`

### `message_reactions`
- **SELECT:** Via group membership
- **INSERT/DELETE:** Own rows only

### `teams`
- **SELECT:** Ministry members
- **INSERT/UPDATE:** Ministry Admin or Admin

### `team_roles`
- **SELECT:** Ministry members
- **INSERT/UPDATE:** Team members with `can_manage_team` permission

### `team_members`
- **SELECT:** Ministry members
- **INSERT:** Any existing member of that team
- **DELETE:** Self-remove or `can_manage_team` permission

---

## 7. Application Structure

### Routing
/                    → redirect based on auth state
/landing             → three entry paths (new)
/login               → email + password login
/signup              → create account
/onboarding          → ministry registration wizard (new)
/join                → find and join a ministry (new)
/home                → main app shell


### Entry Paths (Landing)
Landing
├── I have an account → /login → /home
├── Find my ministry → /join → search → request → pending
└── Register my ministry → /onboarding → wizard → /home


### Tab Structure
BottomNav
├── Home          → HomeTab
├── Announcements → AnnouncementsTab
├── Chats         → ChatsTab
├── Directory     → DirectoryTab
├── Plan          → PlanTab (only visible to team members + admins)
└── Profile       → ProfileTab


### Global State (HomeApp)
- `activeTab`
- `globalOpenChat`
- `totalChatsUnread`
- `chatRefreshKey`
- `recentChats`
- `currentMinistry` — the ministry the user belongs to (new)
- `userTeams` — teams the current user is on (new)

---

## 8. Feature Specifications

### 8.1 Authentication
- Email + password via `supabase.auth.signUp()` / `signInWithPassword()`.
- On signup, a Postgres trigger (`handle_new_user`, SECURITY DEFINER) fires `AFTER INSERT ON auth.users` and auto-creates the `profiles` row from `raw_user_meta_data` (name, email, graduation_year, role defaults to `"member"`).
- **`profiles.ministry_id` is `NULL` immediately after signup.** Middleware detects this and redirects to `/join` before allowing access to `/home`.
- At `/join`, the user either enters an invite code (`joinMinistryByCode`) or registers a new ministry (`registerMinistry`). Both server actions update `profiles.ministry_id` and redirect to `/home`.
- Middleware uses `supabase.auth.getUser()` exclusively — never `getSession()`.

### 8.2 Home Tab
*(unchanged)*

### 8.3 Announcements Tab
*(unchanged)*

### 8.4 Chats Tab
*(unchanged)*

### 8.5 ChatScreen
*(unchanged)*

### 8.6 ChatSettings
*(unchanged)*

### 8.7 Directory Tab
*(unchanged)*

### 8.8 Profile Tab
*(unchanged)*

---

### 8.9 Onboarding Flow (Ministry Registration)

**Purpose:** Guide a pastor or ministry leader through setting up their ministry workspace in under 5 minutes.

**Route:** `/onboarding` — full screen wizard, no bottom nav.

**Step 1 — Basic Info**
- Ministry name
- University name
- Approximate size: Under 50 / 50–100 / 100+

**Step 2 — Structure Questions**
- "Does your ministry have a praise or worship team?" YES / NO
- "Do you have small groups or bible studies?" YES / NO
- "Are you a registered student organization at your university?" YES / NO
- "Do you have a tech team?" YES / NO

**Step 3 — Preset Recommendations**
Based on answers, show recommended team cards:
- YES to praise team → Praise Team preset (Worship Leader + Member roles, worship/slides tools)
- YES to small groups → Small Group Leaders preset (DGL President + Leader roles, DG + bible study tools)
- YES to student org → Student Org Board preset (President, Secretary, Treasurer, Event Coordinator roles, events/finances/attendance tools)
- YES to tech team → Tech Team preset (Member role, slides/set view tools)

Each preset shown as a card with name, roles, and tools listed. Admin can accept, edit, or remove each.

**Step 4 — Customize**
For each accepted preset the admin can:
- Rename the team
- Add, rename, or remove roles
- Toggle permissions on/off per role

**Step 5 — Invite First Members**
- Search existing CENTRAL users by name/email
- Assign them to teams with a role
- Or share the ministry invite code for members to join themselves

On completion: ministry created in DB, admin's profile linked to ministry, redirect to `/home`.

---

### 8.10 Teams & Roles System

**Purpose:** Flexible org management that adapts to any ministry structure.

**Key rules:**
- Ministry Admin creates teams during onboarding or later via settings
- Any existing team member can add new members to their team
- Roles are defined per team — not global
- Permissions are a JSONB array of feature flags on each role
- A user can be on multiple teams with different roles in each

**Preset templates** (applied during onboarding, fully editable after):

| Preset | Default Roles | Default Permissions |
|--------|--------------|---------------------|
| Praise Team | Worship Leader, Member | `can_manage_worship_set`, `can_view_worship_set`, `can_generate_slides` |
| Small Group Leaders | DGL President, Leader | `can_create_dgs`, `can_view_dgs`, `can_generate_bible_study`, `can_track_attendance` |
| Student Org Board | President, Secretary, Treasurer, Event Coordinator | `can_plan_events`, `can_view_finances`, `can_manage_members`, `can_track_attendance` |
| Tech Team | Member | `can_view_worship_set`, `can_generate_slides` |

---

### 8.11 Plan Tab

**Purpose:** Leader-facing planning hub. Only visible to users on at least one team or with admin role.

**Sections (shown only if user has access):**

**Worship** (PT + TT members)
- This Week's Set — song list, keys, who's leading each song
- Set Builder — search/add songs, reorder, assign keys and roles
- Slide Generator — generate lyric slides from the set
- Team Schedule — who's playing what this Sunday

**Discipleship** (DGL members)
- My Group — members of the user's assigned discipleship group
- Bible Study Generator — AI-generated study guide from a passage or topic
- Attendance — track who showed up each week

**Ministry** (Student Org Board + Admin)
- Events — plan and manage upcoming events (links to Announcements)
- Attendance Overview — ministry-wide attendance trends
- Member Pipeline — new visitors, follow-up status, conversion to members
- Finances — budget tracking, income/expenses (Treasurer + President only)

---

### 8.12 Praise Team Plan Tab

**Purpose:** Replace Planning Center, Google Drive, and Messenger for praise team coordination. The President sets up the monthly schedule, Leaders fill out their assigned weeks, and Members only see what's relevant to them.

**UI location:** Praise Team tab inside the Plan tab. Four sub-tabs: **Schedule** (default), **Set Builder**, **Slides**, **Charts**.

---

#### Roles & Visibility

| Role | What They See | What They Can Edit |
|------|--------------|-------------------|
| **President** | Full monthly schedule — all weeks, all assignments, all members | Create weeks, assign leaders, assign members to roles, edit any week's set list and roster |
| **Leader** | All weeks for the team | Only weeks they are assigned to lead — set list, key assignments, role roster |
| **Member** | Only weeks they are personally assigned to | Cannot edit — read-only view of their role, the song list, and their week's roster |

---

#### Weekly Set Card

Each week in the month is a card displaying:
- **Date** of the Sunday service
- **Assigned leader** for that week
- **Set list** — ordered songs, each with a title, key, and assigned song leader
- **Role roster** — each member with their instrument or vocal part
- **Status badge** — `Draft` → `Filled Out` → `Confirmed`

---

#### President Flow
1. Creates weeks for the month (one card per Sunday).
2. Assigns a leader to each week.
3. Assigns members to roles for each week.
4. Can view and edit any week at any time.
5. Can move members between weeks to handle conflicts or availability.

#### Leader Flow
1. Assigned weeks are highlighted in the schedule.
2. Fills out the set list — adds songs, sets keys, assigns who leads each song.
3. Fills out the role roster — confirms who is playing what instrument/part.
4. Sends in-app notifications to members for their assigned week.
5. Can rearrange roles without touching Google Drive.

#### Member Flow
1. Receives an in-app notification when assigned to a week.
2. Sees only their assigned weeks, their specific role, the full song list, and the roster for that week.
3. Can mark availability for upcoming weeks using the availability system.

---

#### Availability System
- Members mark which Sundays they are available on a simple monthly calendar view.
- Leaders and the President see each member's availability when building the roster for a week.
- Unavailable members are visually flagged when being assigned to a week.

---

#### Song Set List
- Each week has an ordered set list of songs.
- Each song has: **title**, **key** (e.g. G, A♭), **assigned song leader**.
- Songs are reorderable by drag-and-drop.
- Only the President and the assigned Leader can edit the set list for a given week.

---

#### Lyric Slide Generator
- From any week's set list, the President or Leader can trigger slide generation.
- CENTRAL auto-generates a lyrics slide deck from the ordered song list.
- Slides are viewable in-app and exportable.
- Replaces the manual slide creation process entirely.

---

#### SongSelect / Charts Integration
- Each song in the set list can have a **chord chart** attached.
- Charts are either uploaded as a PDF or pulled from SongSelect (when integration is available).
- Charts are viewable in-app by all members assigned to that week.
- The Leader can add **annotations** to a chart; annotations are visible to all members on the same week.
- This is the key feature that competes with the Charts app.

---

#### New Database Tables

### `worship_weeks`
One row per Sunday service week for a praise team.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `team_id` | UUID | FK → teams(id) |
| `ministry_id` | UUID | FK → ministries(id) |
| `week_date` | date | The Sunday date |
| `leader_id` | UUID? | FK → profiles(id) — assigned leader for this week |
| `status` | text | `"draft"`, `"filled_out"`, `"confirmed"` |
| `created_at` | timestamptz | |

### `worship_songs`
Songs in a week's set list, ordered by `order_index`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `week_id` | UUID | FK → worship_weeks(id) |
| `title` | text | Song name |
| `key` | text | e.g. `"G"`, `"Ab"` |
| `song_leader_id` | UUID? | FK → profiles(id) |
| `order_index` | int | Sort order (drag-and-drop) |
| `created_at` | timestamptz | |

### `worship_roles`
Role roster for a given week — who is playing or singing what.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `week_id` | UUID | FK → worship_weeks(id) |
| `user_id` | UUID | FK → profiles(id) |
| `role_name` | text | e.g. `"keys"`, `"drums"`, `"vocals"`, `"guitar"`, `"bass"` |
| `created_at` | timestamptz | |

### `worship_availability`
Member availability declarations per week date.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `team_id` | UUID | FK → teams(id) |
| `user_id` | UUID | FK → profiles(id) |
| `week_date` | date | The Sunday in question |
| `is_available` | boolean | |
| `created_at` | timestamptz | |

**Constraint:** `UNIQUE(team_id, user_id, week_date)`

### `worship_charts`
Chord chart file attached to a specific song.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `song_id` | UUID | FK → worship_songs(id) |
| `chart_url` | text | PDF URL from Supabase Storage |
| `uploaded_by` | UUID | FK → profiles(id) |
| `created_at` | timestamptz | |

### `worship_annotations`
Leader annotations on a chord chart, visible to all members on that week.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `chart_id` | UUID | FK → worship_charts(id) |
| `user_id` | UUID | FK → profiles(id) |
| `annotation_data` | JSONB | Position, text, color, etc. |
| `created_at` | timestamptz | |

#### RLS for Worship Tables
- **`worship_weeks` / `worship_songs` / `worship_roles` / `worship_charts` / `worship_annotations`**
  - **SELECT:** Any ministry member on the praise team. Members additionally filtered — only see weeks where they have a `worship_roles` row.
  - **INSERT/UPDATE:** President (full access) or the assigned Leader for that week.
- **`worship_availability`**
  - **SELECT:** Team members (leaders/president need to see everyone's).
  - **INSERT/UPDATE/DELETE:** Own rows only.

---

## 9. Realtime Architecture

| Channel | Table | Events | Consumer |
|---------|-------|--------|---------|
| `group-messages-{groupId}` | `messages` | INSERT | `ChatScreen` |
| `reactions-{groupId}` | `message_reactions` | INSERT, DELETE | `ChatScreen` |
| `home-app-recent-chats` | `messages` | INSERT | `HomeApp` |
| `read-receipts-{groupId}` | `group_members` | UPDATE | `ChatScreen` |

---

## 10. Known Gaps and Technical Debt

1. ~~**Role casing**~~ — Resolved.
2. ~~**Announcement audience filtering**~~ — Resolved.
3. ~~**Home tab RSVP**~~ — Resolved.
4. ~~**Unread on home preview**~~ — Resolved.
5. ~~**Unused components**~~ — Resolved.
6. ~~**Debug code in handleReact**~~ — Resolved.
7. ~~**onRead decrement**~~ — Resolved.
8. **`createGroup` misleading parameter** — `createdBy` param is ignored, uses `auth.uid()` server-side. Correct behavior but misleading API.
9. **Single large file** — `home-app.tsx` is ~3300+ lines. Will split per tab in a future refactor.
10. ~~**Multi-tenant migration pending**~~ — Resolved. `ministries`, `teams`, `team_roles`, `team_members` tables exist. `ministry_id` is on `profiles`, `groups`, and `announcements`. RLS policies enforce tenant isolation. Middleware redirects users without `ministry_id` to `/join`.

---

## 11. File Map
central/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── join/
│   │   └── page.tsx              # Post-signup: enter invite code or register ministry
│   ├── landing/
│   │   └── page.tsx              # Public landing page — three entry paths
│   ├── actions/
│   │   ├── create-group.ts
│   │   └── ministry.ts           # joinMinistryByCode, registerMinistry
│   ├── home/
│   │   ├── home-app.tsx          # Main app shell (~3300 lines, will split)
│   │   └── page.tsx
│   ├── globals.css
│   ├── layout.tsx                # Inter + Instrument Serif fonts
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
├── supabase/
│   ├── chat_features_migration.sql
│   ├── chat_settings_migration.sql
│   ├── messages_rls.sql
│   ├── reactions_migration.sql
│   ├── reply_to_migration.sql
│   ├── read_receipts_migration.sql
│   ├── multi_tenant_migration.sql    # Full multi-tenant schema + RLS + helpers
│   └── profile_trigger_migration.sql # handle_new_user trigger
├── middleware.ts
└── PRD.md


---

## 12. Vision and Principles

**What CENTRAL should feel like:** A native iOS app running in the browser. Smooth, fast, personal.

**What it is NOT:**
- Not a general-purpose Slack clone
- Not a social media feed
- Not accessible to the public

**Design principles:**
1. **Quiet Modern.** Regal plum (`#3E1540`) is the brand color — used sparingly. Gold (`#C9A34B`) for unread badges only.
2. **Content over chrome.** Minimal UI decoration. Instrument Serif gives warmth; Inter keeps it legible.
3. **Realtime first.** The app should never feel stale.
4. **Spiritual intentionality.** Prayer requests, Bible verses, and "pray for me this week" are first-class features.
5. **Role-appropriate simplicity.** The UI should feel appropriately minimal for each role.
6. **Platform thinking.** CENTRAL is built for any college ministry, not just one church. Every feature should work for a ministry at Pitt, Penn State, or anywhere else.

---

## 13. Roadmap

### Completed
- Real-time messaging with reply threading
- Emoji reactions
- Read receipts
- Message deletion
- Announcements with RSVP, audience targeting, image uploads
- Member directory with DM creation
- Chat settings (rename, add/remove members, archive)
- Unread badge tracking
- RLS + security across all tables
- **Multi-tenant architecture** — `ministries` table, `ministry_id` on all tenant tables, invite-code join flow (`/join`), ministry registration, middleware tenant routing, SECURITY DEFINER RLS helpers
- **Teams & roles schema** — `teams`, `team_roles`, `team_members` with granular JSONB permissions

### In Progress
- Teams & roles system (schema complete; UI not yet built)
- Plan tab (Worship, Discipleship, Ministry sections)

### Mid-term
- Praise team scheduling
- Song key detection from audio
- Worship slide generation
- Discipleship group tools
- Bible study generator
- Event planning tools
- Attendance tracking
- Finances tracking

### Long-term
- PWA + push notifications
- SongSelect integration
- Visitor onboarding flow
- Multi-ministry discovery and search
- Analytics dashboard for ministry admins