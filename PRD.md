# CENTRAL — Product Requirements Document

> **Version:** 3.0  
> **Last updated:** May 2026  
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
| **Leader** | Trusted leader assigned by Ministry Admin. | All features + destructive actions within the ministry |
| **Team Member** | Member assigned to a team (PT, DGL, CCSF, etc). | Access to their team's Plan tab tools only |
| **Member** | Regular church attendee. | Chats, directory, announcements, RSVP, profile, journal |
| **Visitor** | Not yet implemented. Intended for first-time guests. | Limited read access (planned) |

> **Note:** A person can be a Member AND be on multiple teams simultaneously. Team membership grants additional access to the Plan tab — it does not replace their base member access.

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Database + Auth | Supabase (Postgres + Row Level Security + Realtime + Storage) |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui (Radix primitives) |
| Language | TypeScript (strict) |
| Font | Instrument Serif (display) / Inter (UI) |
| Hosting | Vercel |

### Key conventions
- All components use Tailwind utility classes — no CSS modules, no styled-components.
- On **mobile**: the app renders in a `max-w-[390px] mx-auto` centered column to simulate a native app.
- On **desktop**: a full responsive layout with an icon rail sidebar, a context panel, and a main content area (`md:flex md:h-screen`).
- All database reads/writes go through the Supabase JS client (`lib/supabase.ts` for client, `lib/supabase-server.ts` for server components).
- Server actions live in `app/actions/`.
- The entire app shell lives in `app/home/home-app.tsx` — a single large client component (~9000 lines) organized into tab components.
- Active tab is synced to the URL via `?tab=` query param.

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

### Layout — Mobile
- Outer wrapper: `max-w-[390px] mx-auto` — centered, never full-width.
- Full-screen overlays: `fixed inset-0 z-[N]` with `max-w-[390px] mx-auto w-full h-full flex flex-col`.
- Bottom nav height: accounted for with `pb-28` on scrollable content.
- Safe area: `pt-12` on full-screen overlay headers (accounts for iOS status bar).

### Layout — Desktop (`md:` breakpoint)
- Root: `md:flex md:h-screen md:overflow-hidden` — no `max-w-[390px]`.
- Icon rail: `w-16 h-screen bg-[#13101A]` — leftmost column, always visible.
- Context panel: `w-[232px] bg-[#FBF8F2]` — tab-specific secondary nav, hidden for Chats and Directory tabs (those provide their own left panel).
- Main content: `md:flex-1 md:flex md:flex-col md:overflow-hidden`.
- Chats tab: two-column split — `w-[320px]` chat list + flex-1 inline `ChatScreen`.
- Modal overlays: `fixed inset-0` (full viewport) with `bg-black/20 backdrop-blur-sm`.
- Message feed: `max-w-[680px] mx-auto` centered within the chat panel.

### Typography
- **Display / headings:** Instrument Serif via `var(--font-instrument-serif)`
- **UI / body:** Inter via `var(--font-inter)`
- Section headers: Instrument Serif ~26px, weight 400, `#13101A`. No uppercase label bars.
- Primary headings: Instrument Serif 36px, `#13101A`.
- Chat bubbles: `text-[14px] leading-[1.4]`.

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
| Command palette | 200 | `CommandPalette` |

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
Stores all user profile data. Created on signup via Postgres trigger.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Matches `auth.users.id` |
| `ministry_id` | UUID | FK → ministries(id) — NULL until user joins/registers a ministry |
| `name` | text | |
| `email` | text | |
| `graduation_year` | int | |
| `role` | text | `"admin"`, `"leader"`, `"member"` — always lowercase |
| `about_me` | text? | |
| `bible_verse` | text? | |
| `prayer_request` | text? | Visible to others on the home tab |
| `pray_for_me` | text? | Opt-in community prayer request |
| `avatar_url` | text? | Public URL from Supabase Storage `avatars` bucket |

### `teams`
Flexible teams within a ministry.

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
| `permissions` | JSONB | Array of permission flag strings |
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

**Constraint:** `UNIQUE(team_id, user_id)`

### `team_role_descriptions`
One editable description per `(team_id, role_name)` pair, displayed in the Student Org Board role tab.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `team_id` | UUID | FK → teams(id) |
| `role_name` | text | Matches `team_roles.name` |
| `description` | text | Editable by the role holder or admin |
| `created_by` | UUID | FK → auth.users |
| `updated_by` | UUID? | FK → auth.users |
| `created_at` / `updated_at` | timestamptz | |

**Constraint:** `UNIQUE(team_id, role_name)`

### `team_role_links`
Ordered list of resource links per `(team_id, role_name)`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `team_id` | UUID | FK → teams(id) |
| `role_name` | text | |
| `label` | text | Display text |
| `url` | text | |
| `position` | int | Sort order |
| `created_by` | UUID | FK → auth.users |
| `created_at` | timestamptz | |

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
| `last_read_at` | timestamptz? | Used for unread count calculation |

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

### `calendar_events`
Ministry-wide or team-specific events shown in the Plan tab calendar.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `ministry_id` | UUID | FK → ministries(id) |
| `team_id` | UUID? | FK → teams(id) — NULL means ministry-wide |
| `title` | text | |
| `description` | text? | |
| `location` | text? | |
| `start_date` | timestamptz | |
| `end_date` | timestamptz | |
| `all_day` | boolean | |
| `category` | text | `"welcoming"`, `"retreat"`, `"social"`, `"service"`, `"regular"` |
| `created_by` | UUID | FK → profiles(id) |
| `created_at` | timestamptz | |

### `event_plans`
One planning workspace per calendar event.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `ministry_id` | UUID | FK → ministries(id) |
| `calendar_event_id` | UUID | UNIQUE FK → calendar_events(id) |
| `overview_notes` | text? | |
| `expected_turnout` | int? | |
| `budget_allocated` | numeric(10,2)? | |
| `created_by` | UUID | FK → profiles(id) |
| `created_at` | timestamptz | |

### `event_tasks`
Checklist items linked to an event plan.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `event_plan_id` | UUID | FK → event_plans(id) |
| `title` | text | |
| `assigned_to` | UUID? | FK → profiles(id) |
| `due_date` | date? | |
| `completed` | boolean | |
| `completed_at` | timestamptz? | |
| `created_by` | UUID | FK → profiles(id) |
| `created_at` | timestamptz | |

### `event_roles`
Named role assignments for a specific event (e.g. "Emcee", "Sound").

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `event_plan_id` | UUID | FK → event_plans(id) |
| `role_name` | text | |
| `assigned_to` | UUID? | FK → profiles(id) |
| `notes` | text? | |
| `created_by` | UUID | FK → profiles(id) |
| `created_at` | timestamptz | |

### `event_notes`
Persistent transition notes on an event (never deleted — institutional memory).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `event_plan_id` | UUID | FK → event_plans(id) |
| `content` | text | |
| `created_by` | UUID | FK → profiles(id) |
| `created_at` | timestamptz | |

### `meeting_notes`
Team meeting records, numbered sequentially per team.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `team_id` | UUID | FK → teams(id) |
| `note_number` | int | Sequential per team |
| `date` | date | |
| `title` | text | |
| `body` | text | |
| `created_by` | UUID | FK → auth.users |
| `created_at` / `updated_at` | timestamptz | |

### `devotionals`
Personal devotional journal entries (private per user).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → profiles(id) |
| `ministry_id` | UUID | FK → ministries(id) |
| `title` | text | |
| `passage` | text | Scripture reference |
| `content` | text | Journal body |
| `image_url` | text? | From `devotionals` storage bucket |
| `created_at` | timestamptz | |

### `prayers`
Personal prayer list entries (private per user).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → profiles(id) |
| `ministry_id` | UUID | FK → ministries(id) |
| `title` | text | |
| `content` | text | |
| `status` | text | `"praying"`, `"answered"`, `"ongoing"` |
| `created_at` | timestamptz | |

### `verses`
Personal saved Bible verses (private per user).

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `user_id` | UUID | FK → profiles(id) |
| `ministry_id` | UUID | FK → ministries(id) |
| `reference` | text | e.g. "John 3:16" |
| `verse_text` | text | |
| `note` | text | Personal reflection |
| `created_at` | timestamptz | |

### Storage Buckets
| Bucket | Access | Usage |
|--------|--------|-------|
| `announcement-images` | Public | Announcement header images |
| `avatars` | Public | User profile photos |
| `devotionals` | Public (user-scoped writes) | Devotional entry images |

---

## 6. SECURITY DEFINER Helper Functions

These Postgres functions bypass profile-table RLS to prevent infinite recursion in multi-tenant policies:

| Function | Returns | Purpose |
|----------|---------|---------|
| `auth_ministry_id()` | UUID | Current user's `ministry_id` from `profiles` |
| `auth_is_admin_or_leader()` | boolean | True if current user's role is `admin` or `leader` |
| `is_team_member(team_id, user_id)` | boolean | True if the given user is on the given team |
| `user_team_role_name(team_id, user_id)` | text | Returns the role name for a user on a specific team |

**Rule:** Always use these in RLS policies — never query `profiles` directly inside another table's policy.

---

## 7. Row Level Security (RLS) Summary

All data is scoped by `ministry_id`. Users can only see data belonging to their ministry.

### `profiles`
- **SELECT:** Members of the same ministry
- **UPDATE:** Own row only

### `groups` / `group_members` / `messages` / `message_reactions`
- Standard chat membership scoping — see `multi_tenant_migration.sql`.

### `teams` / `team_roles` / `team_members`
- **SELECT:** Ministry members
- **INSERT/UPDATE teams:** Admin or leader
- **INSERT team_members:** Any existing team member
- **DELETE team_members:** Self-remove or `can_manage_team` permission

### `team_role_descriptions` / `team_role_links`
- **SELECT:** Ministry members
- **INSERT/UPDATE:** Admin/leader OR the user whose role name matches the row's `role_name`

### `calendar_events`
- **SELECT:** Ministry members
- **INSERT/UPDATE:** Admin/leader OR team member with `can_plan_events`
- **DELETE:** Admin/leader OR the creator

### `event_plans` / `event_tasks` / `event_roles` / `event_notes`
- **SELECT:** Ministry members
- **INSERT/UPDATE:** Admin/leader OR team member with `can_plan_events`

### `meeting_notes`
- **SELECT:** Ministry members
- **INSERT/UPDATE:** Admin/leader OR any team member on the note's team

### `devotionals` / `prayers` / `verses`
- **All operations:** Own rows only (`user_id = auth.uid()`)

---

## 8. Application Structure

### Routing
```
/                    → redirect based on auth state
/landing             → three entry paths
/login               → email + password login
/signup              → create account
/join                → enter invite code or register a new ministry
/home                → main app shell (requires auth + ministry_id)
/home?tab=chats      → deep-link to a specific tab
```

### Entry Paths
```
Landing
├── I have an account   → /login → /home
├── Find my ministry    → /join (enter invite code)
└── Register ministry   → /join (register new ministry) → /home
```

### Tab Structure
```
BottomNav (mobile) / DesktopSidebar (desktop)
├── Home          → HomeTab
├── Announcements → AnnouncementsTab
├── Chats         → ChatsTab  (+ inline ChatScreen on desktop)
├── Plan          → PlanTab   (only visible to team members + admins)
├── Directory     → DirectoryTab
└── Profile       → ProfileTab
                       ├── Spiritual Profile section
                       └── Journal section (Devotionals / Prayers / Verses)
```

### Global State (`HomeApp`)
| State | Type | Purpose |
|-------|------|---------|
| `activeTab` | `Tab` | Which tab is visible; synced to `?tab=` URL param |
| `globalOpenChat` | `{ id, name } \| null` | Mounts `ChatScreen`; inline on desktop chats tab, overlay elsewhere |
| `totalChatsUnread` | number | Drives BottomNav badge |
| `chatRefreshKey` | number | Incremented on chat close to refresh data |
| `recentChats` | `ChatPreview[]` | Top chats by recency; kept live via Realtime |
| `userTeams` | `UserTeam[]` | Teams the current user belongs to |
| `allTeams` | `Team[]` | All ministry teams (admin only) |
| `activeTeamId` | `string \| null` | Selected team in Plan tab / sidebar |
| `profileSection` | `"spiritual-profile" \| "journal"` | Active section in Profile tab |
| `paletteOpen` | boolean | Command palette visibility |
| `avatarUrl` | `string \| null` | Current user's avatar URL |
| `isDesktop` | boolean | Tracks `(min-width: 768px)` media query |

---

## 9. Feature Specifications

### 9.1 Authentication
- Email + password via `supabase.auth.signUp()` / `signInWithPassword()`.
- On signup, a Postgres trigger (`handle_new_user`, SECURITY DEFINER) fires `AFTER INSERT ON auth.users` and auto-creates the `profiles` row from `raw_user_meta_data` (name, email, graduation_year; role defaults to `"member"`).
- **`profiles.ministry_id` is `NULL` immediately after signup.** Middleware detects this and redirects to `/join` before allowing access to `/home`.
- At `/join`, the user either enters an invite code (`joinMinistryByCode`) or registers a new ministry (`registerMinistry`). Both server actions update `profiles.ministry_id` and redirect to `/home`.
- Middleware uses `supabase.auth.getUser()` exclusively — never `getSession()`.

### 9.2 Home Tab
- Latest announcement as a hero card (plum bg, radial gold glow, ivory text).
- RSVP button on the hero card if it's an event.
- Up to 3 more recent announcements as compact cards.
- Top 3 recent chats via `ChatsSection` component, with unread counts.
- Featured community prayer (random member who opted into `pray_for_me`).
- Logo + ministry name header (mobile). Quick-access avatar button to Profile.

### 9.3 Announcements Tab
- Full feed sorted by `is_pinned DESC, created_at DESC`.
- Audience targeting: all, class year, or specific group.
- Admin/leader can create, edit, delete, and pin announcements.
- RSVP on event announcements; view counts tracked automatically.
- Image upload via Supabase Storage (`announcement-images` bucket).
- Announcement detail view with view/RSVP counts (admin only).

### 9.4 Chats Tab
- **Church Chats** (sub-tab): ministry-wide group chats managed by leaders.
- **My Chats** (sub-tab): personal group chats and DMs created by any member.
- Search bar filters the active sub-tab.
- Archived church chats collapsible at the bottom.
- Admin/leader can create church chats. Any member can create personal chats or DMs.
- **Desktop:** `ChatsTab` renders as the left 320px column; `ChatScreen` renders inline on the right when a chat is open. Active chat highlighted in the list.

### 9.5 ChatScreen
- Real-time messages via `group-messages-{groupId}` Realtime channel.
- Message bubbles: grouped by sender within 60-second windows; avatar shown only on last in group; sender + time header on first.
- **Tap** (< 400ms): emoji reaction picker (6 options).
- **Long press** (≥ 400ms): context menu (Reply, Delete).
- Reply threading: inline reply preview inside bubble; tap to scroll to original.
- Emoji reactions: grouped pills below the bubble; tap to toggle.
- Read receipts: stacked avatars shown below the last message from each sender.
- Optimistic updates on all sends, reactions, and deletes.
- Message deletion: soft delete shown as italic "Message deleted" placeholder.
- **Inline mode** (desktop): header/messages/input all constrained to `max-w-[680px] mx-auto`.

### 9.6 ChatSettings
- Rename chat (admin/leader for church type; any member for personal).
- Add/remove members.
- Archive chat (admin/leader only for church type).
- Leave chat.

### 9.7 Directory Tab
- Searchable list of all ministry members with name, email, graduation year.
- Tap a member to open `MemberSheet`.
- `MemberSheet`: avatar, name, role badge, bio fields (about_me, bible_verse, prayer_request).
- "Send Message" button creates or opens an existing DM with that person.
- On desktop, the Directory tab has its own left panel (context panel is hidden).

### 9.8 Profile Tab
Has two sections, switchable via tab buttons and synced with the desktop sidebar context panel:

**Spiritual Profile section**
- Avatar upload (camera button; uploads to `avatars` bucket).
- Edit: about_me, bible_verse, prayer_request, pray_for_me.
- Sign out button.

**Journal section**
Three sub-tabs: **Devotionals**, **Prayers**, **Verses**.
- **Devotionals:** Personal devotional journal entries (title, scripture passage, reflection body, optional image). Full CRUD. Private — only visible to the author.
- **Prayers:** Prayer list with status tracking (`praying`, `answered`, `ongoing`). Status badge color-coded. Full CRUD.
- **Verses:** Saved Bible verses with personal notes. Full CRUD.
- All journal data is scoped to the user only via RLS (`user_id = auth.uid()`).

### 9.9 Plan Tab

Only visible to users on at least one team OR with admin/leader role.

The Plan tab is **team-contextual**: the sidebar shows the user's teams, and the main content adapts to whichever team is selected (`activeTeamId`).

**Team types and their available tools:**

| Team Type | Tools Available |
|-----------|----------------|
| Praise Team | Set Builder (coming soon), Slide Generator (coming soon), Schedule (coming soon) |
| Small Group Leaders | Bible Study Generator (coming soon), Discipleship group tools (coming soon) |
| Student Org Board | Calendar, Event Planning, Meeting Notes, Role descriptions & resource links |
| Any team (Admin) | All teams visible; can create/manage teams |

**Student Org Board — General tab (built):**
- Team calendar (`calendar_events`) — month view, category-colored event chips.
- Event planning workspace (`event_plans`, `event_tasks`, `event_roles`, `event_notes`) — per event, shows task checklist, role assignments, and transition notes.
- Meeting notes (`meeting_notes`) — sequentially numbered, editable by team members.
- Role tab — each board role has an editable description and resource link list (`team_role_descriptions`, `team_role_links`).

**Other teams (Praise, DGL, Tech):** Basic shell built with tool cards showing "Coming Soon" for Set Builder, Slide Generator, Schedule, Bible Study.

**Admin view:** Shows all teams with member counts; can create new teams with the `+` button.

### 9.10 Command Palette
- Triggered by `Cmd+K` (keyboard) or clicking the search bar in the desktop topbar.
- Fuzzy search across tabs, recent chats, and directory members.
- Keyboard navigable (↑↓ arrows, Enter to select, Esc to close).
- Z-index 200 — above all other overlays.

### 9.11 Onboarding / Ministry Join Flow
- `/join` — enter a 6-character invite code to join an existing ministry, OR register a new one.
- Registration: ministry name, university, size; creates a `ministries` row and links the user as admin.
- Invite code join: validates the code, sets `profiles.ministry_id`, redirects to `/home`.

### 9.12 Desktop Sidebar (`DesktopSidebar`)
- **Icon rail** (64px, dark `#13101A`): navigation icons for all tabs; active tab has gold left-bar indicator; unread chats dot.
- **Context panel** (232px, ivory): tab-specific secondary nav.
  - Home/Announcements: static section links.
  - Chats: recent chat list with click-to-open and active highlight (hidden when on Chats tab — the ChatsTab provides its own panel).
  - Plan: team list; active team highlighted; `+` to create new team (admin).
  - Directory: member filters (static UI — not yet functional).
  - Profile: "Spiritual Profile" / "Journal" toggle; "Sign out" button (functional).
- **User avatar** at bottom of icon rail.
- Hidden on mobile (`hidden md:flex`).

---

## 10. Realtime Architecture

| Channel | Table | Events | Consumer |
|---------|-------|--------|---------|
| `group-messages-{groupId}` | `messages` | INSERT | `ChatScreen` |
| `reactions-{groupId}` | `message_reactions` | INSERT, DELETE | `ChatScreen` |
| `home-app-recent-chats` | `messages` | INSERT | `HomeApp` (recent chats list) |
| `read-receipts-{groupId}` | `group_members` | UPDATE | `ChatScreen` |

---

## 11. Known Gaps and Technical Debt

1. **Single large file** — `home-app.tsx` is ~9,000 lines. Will split per tab in a future refactor.
2. **`createGroup` misleading parameter** — `createdBy` param is ignored, uses `auth.uid()` server-side. Correct behavior but misleading API.
3. **Directory sidebar filters** — rendered in the desktop context panel but not yet functional (hardcoded static labels).
4. **Plan tab tools** — Set Builder, Slide Generator, Schedule, Bible Study are all "Coming Soon" placeholders for non-SOB teams.
5. **Teams count bug** — `allTeams.length` is used in places where `userTeams.length` is correct; verify display counts use the right source.
6. **No push notifications** — Realtime works in-session only; no background push.
7. **No Visitor role** — Planned but not implemented.

---

## 12. File Map

```
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
│   │   ├── home-app.tsx          # Main app shell (~9000 lines)
│   │   └── page.tsx              # Server component — auth check, profile load
│   ├── globals.css
│   ├── layout.tsx                # Inter + Instrument Serif fonts
│   └── page.tsx                  # Root redirect
├── components/ui/
│   ├── avatar.tsx
│   ├── bottom-nav.tsx
│   ├── button.tsx
│   ├── card.tsx
│   ├── chats-section.tsx
│   ├── input.tsx
│   └── label.tsx
├── lib/
│   ├── supabase.ts               # Browser Supabase client (singleton)
│   ├── supabase-server.ts        # Server Supabase client
│   └── utils.ts
├── supabase/
│   ├── multi_tenant_migration.sql        # Full multi-tenant schema + RLS + SECURITY DEFINER helpers
│   ├── profile_trigger_migration.sql     # handle_new_user trigger
│   ├── chat_features_migration.sql
│   ├── chat_settings_migration.sql
│   ├── messages_rls.sql
│   ├── reactions_migration.sql
│   ├── reply_to_migration.sql
│   ├── read_receipts_migration.sql
│   ├── devotionals_migration.sql         # devotionals table (superseded by journal_migration)
│   ├── journal_migration.sql             # devotionals + prayers + verses tables
│   ├── calendar_migration.sql            # calendar_events table
│   ├── event_planning_migration.sql      # event_plans, event_tasks, event_roles, event_notes
│   ├── meeting_notes_migration.sql       # meeting_notes table
│   └── team_role_content_migration.sql   # team_role_descriptions, team_role_links + helper fn
├── middleware.ts                         # Auth gate + ministry routing
└── PRD.md
```

---

## 13. Vision and Principles

**What CENTRAL should feel like:** A native iOS app running in the browser. Smooth, fast, personal.

**What it is NOT:**
- Not a general-purpose Slack clone
- Not a social media feed
- Not accessible to the public

**Design principles:**
1. **Quiet Modern.** Regal plum (`#3E1540`) is the brand color — used sparingly. Gold (`#C9A34B`) for unread badges only.
2. **Content over chrome.** Minimal UI decoration. Instrument Serif gives warmth; Inter keeps it legible.
3. **Realtime first.** The app should never feel stale.
4. **Spiritual intentionality.** Prayer requests, Bible verses, devotionals, and "pray for me this week" are first-class features.
5. **Role-appropriate simplicity.** The UI should feel appropriately minimal for each role.
6. **Platform thinking.** CENTRAL is built for any college ministry, not just one church.

---

## 14. Roadmap

### Completed
- Real-time messaging with reply threading
- Emoji reactions with optimistic updates
- Read receipts
- Message deletion
- Announcements with RSVP, audience targeting, image uploads
- Member directory with DM creation
- Chat settings (rename, add/remove members, archive)
- Unread badge tracking
- Multi-tenant architecture (ministries, invite-code join, ministry registration, middleware tenant routing, SECURITY DEFINER RLS helpers)
- Teams & roles schema (`teams`, `team_roles`, `team_members`, granular JSONB permissions)
- Plan tab shell with team-contextual views
- Student Org Board: calendar, event planning, meeting notes, role content tabs
- Personal journal (devotionals, prayers, saved verses) in Profile tab
- Full desktop responsive layout (sidebar, context panel, inline chat)
- Command palette (`Cmd+K`)
- Avatar upload
- URL-based tab deep-linking (`?tab=`)

### In Progress / Partial
- Plan tab tools for Praise Team (Set Builder, Slide Generator, Schedule — schema ready, UI placeholders)
- Plan tab tools for DGL (Bible Study Generator, attendance tracking — schema ready, UI placeholders)

### Mid-term
- Praise team scheduling and set builder
- Worship slide generation
- Discipleship group tools
- Bible study AI generator
- Attendance tracking
- Finances tracking (SOB Treasurer view)
- Member pipeline (visitor → member funnel)

### Long-term
- PWA + push notifications
- SongSelect integration
- Visitor onboarding flow
- Multi-ministry discovery and search
- Analytics dashboard for ministry admins
