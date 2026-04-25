# CENTRAL — Product Requirements Document

> **Version:** 1.0  
> **Last updated:** April 2026  
> **Purpose:** Comprehensive product context for AI agents, engineers, and contributors working on this codebase.

---

## 1. Product Overview

**CENTRAL** is a mobile-first church communication app built for a college ministry. It is a private, member-facing platform — not a public social network — designed to keep a college-age church community connected through shared announcements, group chats, a member directory, and personal spiritual profiles.

The name "CENTRAL" is intentional: it is meant to be the single place where all ministry communication happens, replacing group texts, emails, and scattered messaging apps.

**The core problem it solves:** College ministries are highly relational but logistically fragmented. Leaders blast announcements via text, members use different apps to chat, and no one has a single place to find who someone is, how to pray for them, or what events are coming up.

---

## 2. Target Users

| Role | Description | Access Level |
|------|-------------|--------------|
| **Admin** | Ministry staff or full leader. Full control over all features. | All features + destructive actions |
| **Leader** | Small group leader or ministry volunteer. | Create/manage church chats, post announcements, view all members |
| **Member** | Regular church attendee. | Create personal chats, view directory, RSVP events, update profile |
| **Visitor** | Not yet implemented. Intended for first-time guests. | Limited read access (planned) |

> **Note:** All current users must be authenticated. Visitor/unauthenticated browsing is not yet implemented.

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
| Hosting | Vercel (implied) |

### Key conventions
- All components use Tailwind utility classes — no CSS modules, no styled-components.
- The app renders in a **max-width 390px centered column** to simulate a native mobile app in the browser.
- All database reads/writes go through the Supabase JS client (`lib/supabase.ts` for client, `lib/supabase-server.ts` for server components).
- Server actions live in `app/actions/`. The only current one is `create-group.ts`.
- The entire app shell lives in `app/home/home-app.tsx` — a single large client component file organized into tab components.

---

## 4. Design System

> **Direction: Quiet Modern** — regal plum palette, warm ivory surfaces, Instrument Serif for display text. Designed with Claude Design critique (April 2025).

### Colors
| Token | Value | Usage |
|-------|-------|-------|
| Primary (regal plum) | `#3E1540` | Buttons, active nav, hero card bg, announcement card bg, chat avatars (alternating) |
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
- **Display / headings:** Instrument Serif via `var(--font-instrument-serif)` — page titles, section headers, card titles, logo.
- **UI / body:** Inter via `var(--font-inter)` — all other text.
- Section headers: Instrument Serif ~26px, weight 400, `#13101A`. No uppercase label bars.
- Primary headings: Instrument Serif 36px, `#13101A`.
- Chat bubbles: `text-[14px] leading-relaxed`.

### Z-index layers
| Layer | Z value | Element |
|-------|---------|---------|
| Bottom nav | 50 | `BottomNav` |
| Chat screen | 100 | `ChatScreen` |
| Chat settings | 110 | `ChatSettings` |
| Member sheet | 60 | `MemberSheet` |
| Announcements modal | 60 | `CreateAnnouncementModal` |
| Announcement detail | 50 | `AnnouncementDetail` |
| Emoji picker overlay | 150 | Dismiss overlay |
| Emoji picker | 160 | Picker pill |

---

## 5. Database Schema

### `profiles`
Stores all user profile data. Created on signup.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Matches `auth.users.id` |
| `name` | text | Full name |
| `email` | text | |
| `graduation_year` | int | e.g., 2026 |
| `role` | text | `"admin"`, `"leader"`, `"Member"` (capitalization inconsistent — see §10) |
| `about_me` | text? | |
| `bible_verse` | text? | Favorite Bible verse |
| `prayer_request` | text? | General prayer request |
| `pray_for_me` | text? | "How to pray for me this week" — updated frequently |

### `groups`
Represents all chat groups.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | |
| `name` | text | Display name |
| `type` | text | `"church"`, `"my"`, `"dm"` |
| `created_by` | UUID | FK → `auth.users` |
| `archived` | boolean | Default false. Only church chats are archived. |

### `group_members`
Join table between users and groups.

| Column | Type | Notes |
|--------|------|-------|
| `group_id` | UUID | FK → `groups` |
| `user_id` | UUID | FK → `profiles` |
| `last_read_at` | timestamptz? | Used for unread badge calculation |

### `messages`
All chat messages.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | |
| `group_id` | UUID | FK → `groups` |
| `sender_id` | UUID | FK → `profiles` |
| `content` | text | |
| `created_at` | timestamptz | |
| `reply_to_id` | UUID? | FK → `messages(id)` ON DELETE SET NULL |

### `message_reactions`
Emoji reactions on messages.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | |
| `message_id` | UUID | FK → `messages` |
| `user_id` | UUID | FK → `profiles` |
| `emoji` | text | One of: 👍 ❤️ 😂 🙏 🔥 😮 |
| `created_at` | timestamptz | |

**Constraint:** `UNIQUE(message_id, user_id, emoji)` — one reaction per emoji per user per message.  
**Config:** REPLICA IDENTITY FULL + Realtime enabled.

### `announcements`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | |
| `title` | text | |
| `body` | text | |
| `created_at` | timestamptz | |
| `is_pinned` | boolean | Pinned announcements sort to top |
| `is_event` | boolean | Shows RSVP button if true |
| `image_url` | text? | Public URL from `announcement-images` storage bucket |
| `audience` | text? | `"all"`, `"2025"`, `"2026"`, `"2027"`, `"2028"`, `"group"` |
| `created_by` | UUID? | FK → `auth.users` |

### `announcement_views`
Tracks who has seen each announcement.

| Column | Type | Notes |
|--------|------|-------|
| `announcement_id` | UUID | |
| `user_id` | UUID | |

**Constraint:** `UNIQUE(announcement_id, user_id)`

### `rsvps`
Tracks event RSVPs.

| Column | Type | Notes |
|--------|------|-------|
| `announcement_id` | UUID | |
| `user_id` | UUID | |

**Constraint:** `UNIQUE(announcement_id, user_id)`

### Storage Buckets
- `announcement-images` — Public bucket. Images uploaded when creating/editing announcements.

---

## 6. Row Level Security (RLS) Summary

### `messages`
- **SELECT:** User must be a member of the message's group.
- **INSERT:** User must be a member, and `sender_id` must equal `auth.uid()`.

### `groups`
- **SELECT:** User must be in `group_members` for that group.
- **INSERT:** Any authenticated user.
- **UPDATE:** Creator always; or member of group if: non-church type (any member), church type (admin/leader only).

### `group_members`
- **SELECT:** Any authenticated user (can see who is in groups).
- **INSERT:** Any authenticated user.
- **UPDATE:** Own row only (for `last_read_at`).
- **DELETE:** Self-remove always; remove others in non-church if member; remove in church if admin/leader.

### `message_reactions`
- **SELECT:** Via message's group membership.
- **INSERT/DELETE:** Own rows only.

---

## 7. Application Structure

### Routing
```
/ → redirect to /home

/login  — Email + password login
/signup — Name, email, password, graduation year signup

/home   — Main app shell (single page, tab-based)
```

### Tab Structure (BottomNav)
All tabs render inside `/home` via conditional rendering. Only one tab is visible at a time. Tab switching does not navigate — it updates `activeTab` state in `HomeApp`.

```
BottomNav
├── home          → HomeTab
├── announcements → AnnouncementsTab
├── chats         → ChatsTab
├── directory     → DirectoryTab
└── profile       → ProfileTab
```

### Global State (HomeApp)
`HomeApp` is the root client component. It owns:
- `activeTab` — which tab is visible
- `globalOpenChat` — when non-null, `ChatScreen` renders above all tabs
- `totalChatsUnread` — drives the chats tab badge
- `chatRefreshKey` — incremented on chat close to trigger refresh
- `recentChats` — the top 3 most recently active chats for the home tab preview, kept fresh via a single Supabase Realtime subscription

---

## 8. Feature Specifications

### 8.1 Authentication

**Login (`/login`)**
- Email + password via `supabase.auth.signInWithPassword`.
- On success: `router.push("/home")` + `router.refresh()`.
- Errors shown inline.

**Signup (`/signup`)**
- Fields: full name, email, password, graduation year (2025–2028).
- Calls `supabase.auth.signUp` then inserts into `profiles` with `role: "Member"`.
- On success: redirect to `/home`.

**Middleware**
- Refreshes session on every request using `@supabase/ssr`.
- Unauthenticated → `/login`.
- Authenticated on auth pages → `/home`.

---

### 8.2 Home Tab

**Purpose:** A personalized at-a-glance overview.

**Layout (top to bottom):**
1. Header — CENTRAL logo + bell icon
2. Latest Announcement — most recent announcement card with "See all" link
3. Recent Chats — top 3 chats sorted by most recent message, with "See all" link

**Latest Announcement card:**
- Date, title, body (2-line truncation)
- RSVP button if `is_event` (currently not wired to API on this tab — known gap)
- "Details" button → navigates to Announcements tab

**Recent Chats:**
- Always top 3 by most recent `messages.created_at` descending
- Shows sender name + message preview, relative timestamp
- Updates in real time via Supabase Realtime on `messages` inserts
- Also refreshes when user closes a chat (`chatRefreshKey`)
- Unread counts not shown here (only in Chats tab and bottom badge)

---

### 8.3 Announcements Tab

**Purpose:** Church-wide communication feed.

**List behavior:**
- Pinned announcements (`is_pinned: true`) sort to top
- Each card shows: date, audience badge, title, body (3-line clamp), RSVP pill if event
- Tap "See more" → opens `AnnouncementDetail` full-screen overlay
- View count tracked: upserts `announcement_views` on load

**AnnouncementCard:**
- Admin/Leader only: three-dot menu (⋯) with Edit and Delete
- Edit: opens `CreateAnnouncementModal` pre-filled
- Delete: confirmation dialog → removes from DB + list

**AnnouncementDetail:**
- Full-screen overlay (z-50)
- Header with back arrow, "Announcement" title
- Date, full title, full body (no truncation), whitespace-preserve
- RSVP bar pinned to bottom if `is_event`; "You're going!" state after RSVP

**CreateAnnouncementModal (Create & Edit):**
- Fields: title, body, audience chips, "This is an event" toggle, image upload
- Audience options: Whole Church, Class of 2025–2028, Specific Group
- Image: uploaded to `announcement-images` bucket, public URL stored
- Edit mode: pre-fills all fields, updates existing row
- Admin/Leader only: FAB `+` button to open

---

### 8.4 Chats Tab

**Purpose:** Team and personal messaging hub.

**Sub-tabs:** Church Chats | My Chats (segmented control)

**Church Chats:**
- Groups with `type = "church"`
- Only Admin/Leader see the `+` button to create
- Can be archived by Admin/Leader (collapsed "Archived" section at bottom)

**My Chats:**
- Groups with `type = "my"` and `type = "dm"` (both appear here)
- Any member can create new My Chats via `+`
- DMs are created automatically from the Directory tab

**Search:**
- Text input below the sub-tab toggle filters by chat name (case-insensitive, frontend only)
- Clears when switching sub-tabs

**Unread badges:**
- Count of messages after `last_read_at` where `sender_id ≠ current user`
- Total shown on BottomNav badge
- Clears on open (marks `last_read_at = now`) and again on close

**Chat creation (`CreateChatScreen`):**
- Searchable member list (excludes self)
- Multi-select members
- Name the group
- Calls `createGroup` server action with `type: "my"` or `"church"`

---

### 8.5 ChatScreen (Message View)

**Purpose:** Real-time group messaging.

**Header:**
- Back arrow, group avatar (initials), group name, Settings gear icon

**Messages area:**
- Last 50 messages, newest at bottom
- Auto-scrolls to bottom on load and new messages
- Groups consecutive messages from same sender (no repeated name)
- Sender name shown above first message in each group

**Message bubbles:**
- Own: plum (`#3E1540`) background, right-aligned, `rounded-tr-sm`, ivory text (`#F6F4EF`)
- Others: white/surface background with border (`#ECE8DE`), left-aligned, `rounded-tl-sm`

**Reply-to block (when message has `reply_to_id`):**
- Appears above message text, inside bubble
- Own bubble: `bg-white/20`, `border-white/40`, sender `text-white/80`, preview `text-white/60`
- Others' bubble: `bg-[#FBF8F2]`, `border-[#3E1540]`, sender plum, preview muted
- Tap to scroll to quoted message

**Interaction model:**
- **Short tap** (< 400ms): opens emoji reaction picker
- **Long press** (≥ 400ms): opens reply-to mode

**Emoji reactions:**
- 6 options: 👍 ❤️ 😂 🙏 🔥 😮
- Picker floats above the tapped bubble
- Tap outside (overlay) to dismiss
- Toggling same emoji removes the reaction
- Pills appear below the bubble: `bg-white border-[#ECE8DE]`; own reaction: `bg-[#F3EDE6] border-[#3E1540]`
- Updated in real time via Supabase Realtime

**Reply bar (when replying):**
- Appears above input bar
- Shows reply target sender + preview text
- X button to cancel

**Input bar:**
- Textarea (auto-height, max 7 lines)
- Enter sends (Shift+Enter for newline)
- Send button disabled when empty

**Read receipts:**
- `last_read_at` stamped on open, on each incoming message, and on close

---

### 8.6 ChatSettings

**Purpose:** Manage group membership and settings.

**Access:** Gear icon in ChatScreen header.

**Chat Info (visible to all):**
- Group name + avatar initials
- Member count
- Scrollable member list: avatar, name, role badge, graduation year

**Manage Chat — by type and role:**

| Action | Church (Admin/Leader) | My Chat (any member) | DM |
|--------|----------------------|---------------------|-----|
| Rename | ✓ | ✓ | ✗ |
| Add Members | ✓ | ✓ | ✗ |
| Remove Member | ✓ | ✓ | ✗ |
| Archive Chat | ✓ | ✗ | ✗ |
| Leave Chat | ✗ | ✓ | ✓ |

**Archived chats** appear in a collapsed "Archived · N" accordion at the bottom of Church Chats.

---

### 8.7 Directory Tab

**Purpose:** Browse and connect with all church members.

**Features:**
- Search bar (filters by name, real-time, frontend only)
- Member cards: avatar, name, graduation year, role badge
- Tap → opens `MemberSheet`

**MemberSheet:**
- Full-screen white overlay (z-60)
- Header: back arrow, member name + avatar
- Scrollable: About Me, Bible Verse, Prayer Request, Pray for me this week
- Pinned "Send Message" button at bottom
  - Checks for existing DM group between current user + member
  - If found: opens it directly
  - If not: creates `type: "dm"` group named after the other person, adds both members, opens it
  - Switches to Chats tab

---

### 8.8 Profile Tab

**Purpose:** Personal profile management and spiritual expression.

**Fields:**
- Name (display only, not editable here)
- About Me
- Bible Verse
- Prayer Request
- Pray for Me This Week

**Behavior:**
- Inline edit, single "Save" button
- Saves to `profiles` table
- Sign Out button → `supabase.auth.signOut()` → redirect to `/login`

---

## 9. Realtime Architecture

CENTRAL uses Supabase Realtime for live updates.

| Channel | Table | Events | Where |
|---------|-------|--------|-------|
| `group-messages-{groupId}` | `messages` | INSERT | `ChatScreen` — adds new messages from others |
| `reactions-{groupId}` | `message_reactions` | INSERT, DELETE | `ChatScreen` — updates reaction pills |
| `home-app-recent-chats` | `messages` | INSERT | `HomeApp` — updates recent chats preview + re-sorts |

**Optimistic updates:**
- Sending a message: inserted into local state with temp ID immediately, replaced with real ID on DB confirm.
- Adding a reaction: inserted with `temp-{timestamp}` ID, replaced when Realtime INSERT confirms.
- Removing a reaction: removed from state immediately, DB delete fires async.

---

## 10. Known Gaps and Technical Debt

1. ~~**Role casing inconsistency**~~ — **Resolved.** Signup now stores `role: "member"` (lowercase). All role checks use `.toLowerCase()` consistently.

2. **Visitor role:** Defined in product vision, not implemented. No unauthenticated browsing exists.

3. ~~**Announcement audience filtering**~~ — **Resolved.** Members now only see announcements where `audience` is `null`, `"all"`, their graduation year, or `"group"`. Admins/leaders see all.

4. ~~**Home tab RSVP**~~ — **Resolved.** The RSVP button on the Home tab latest announcement is wired to the `rsvps` table with the same upsert logic as the Announcements tab.

5. ~~**Unread on home preview**~~ — **Resolved.** `loadRecentChats` now fetches real unread counts using `last_read_at` and message timestamps, matching ChatsTab logic.

6. ~~**Unused components**~~ — **Resolved.** Deleted: `components/ui/announcement-card.tsx`, `header.tsx`, `theme-provider.tsx`, `app/home/logout-button.tsx`.

7. ~~**Debug code in `handleReact`**~~ — **Resolved.** `console.log` and `alert` statements removed.

8. ~~**`ChatScreen` `onRead` callback**~~ — **Resolved.** `onRead` now calls `recountTotalUnread` which queries the DB for a full recount, never goes negative.

9. **`profile.id` used for `createGroup`:** The server action accepts `createdBy` as input but ignores it, using `auth.uid()` from the server session instead. This is correct behavior but the parameter is misleading.

10. **Single large file:** All tab components live in `app/home/home-app.tsx` (~3,300+ lines). Future work should split into per-tab files.

---

## 11. File Map

```
central/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx        # Login page
│   │   └── signup/page.tsx       # Signup page
│   ├── actions/
│   │   └── create-group.ts       # Server action: create chat group
│   ├── home/
│   │   ├── home-app.tsx          # Main app shell (all tabs + components)
│   │   ├── page.tsx              # Server: auth check, profile load
│   │   └── logout-button.tsx     # Unused
│   ├── globals.css               # Tailwind base + CSS variables
│   ├── layout.tsx                # Root layout: Inter + Instrument Serif fonts, metadata
│   └── page.tsx                  # Redirects to /home
├── components/ui/
│   ├── announcement-card.tsx     # Unused presentational card
│   ├── avatar.tsx                # Radix avatar
│   ├── bottom-nav.tsx            # Tab navigation bar
│   ├── button.tsx                # CVA button variants
│   ├── card.tsx                  # Card shell
│   ├── chats-section.tsx         # Recent chats list (home tab)
│   ├── header.tsx                # Unused static header
│   ├── input.tsx                 # Styled input
│   ├── label.tsx                 # Radix label
│   └── theme-provider.tsx        # next-themes (unused)
├── lib/
│   ├── supabase.ts               # Browser Supabase client (singleton)
│   ├── supabase-server.ts        # Server Supabase client
│   └── utils.ts                  # cn() utility
├── supabase/
│   ├── chat_features_migration.sql  # group_members.last_read_at, RLS
│   ├── chat_settings_migration.sql  # groups.archived, update/delete policies
│   ├── messages_rls.sql             # Messages RLS + Realtime
│   ├── reactions_migration.sql      # message_reactions table + RLS
│   └── reply_to_migration.sql       # messages.reply_to_id FK
├── middleware.ts                  # Auth gate (redirect logic)
├── .cursorrules                   # AI agent context
└── PRD.md                         # This document
```

---

## 12. Vision and Principles

**What CENTRAL should feel like:** A native iOS app running in the browser. Smooth, fast, personal. The 390px container enforces a mobile-first mindset — no feature should be designed thinking about desktop.

**What it is NOT:**
- Not a general-purpose Slack clone
- Not a social media feed
- Not accessible to the public

**Design principles:**
1. **Quiet Modern.** Regal plum (`#3E1540`) is the brand color — used sparingly (max 2–3 per screen) for primary interactions only. Warm ivory surfaces and neutral borders carry everything else. Gold accent (`#C9A34B`) is reserved for unread badges only.
2. **Content over chrome.** Minimal UI decoration. The content (messages, names, announcements) should feel prominent. Instrument Serif gives warmth; Inter keeps it legible.
3. **Realtime first.** The app should never feel stale. Messages, reactions, and recent chats all update live.
4. **Spiritual intentionality.** Prayer requests, Bible verses, and "pray for me this week" are first-class features — not an afterthought. They should be prominent and easy to update.
5. **Role-appropriate simplicity.** Members shouldn't see admin controls. Leaders shouldn't see irrelevant options. The UI should feel appropriately minimal for each role.

## 13. Roadmap

### Near-term
- Message deletion
- Read receipts
- Push notifications

### Mid-term  
- Praise team scheduling
- Song key detection from audio
- Worship slide generation

### Long-term
- Multi-church networking
- Offering/finances tracking
- Visitor onboarding flow
- SongSelect integration