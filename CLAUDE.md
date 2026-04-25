# CENTRAL — Project Context for Claude

> Church communication app for college ministry. Mobile-first, Quiet Modern design (regal plum + warm ivory), real-time messaging.  
> Full spec: see `PRD.md` in this directory.

---

## Stack
Next.js (App Router), Supabase (Postgres + Realtime + RLS + Storage), Tailwind CSS v4, shadcn/ui, TypeScript, Vercel

## Key Files
| File | Purpose |
|------|---------|
| `app/home/home-app.tsx` | **Entire app shell** — all tabs + all components (~3200 lines, intentionally one file) |
| `app/home/page.tsx` | Server component — auth check, profile load, renders `<HomeApp>` |
| `app/(auth)/login/page.tsx` | Email + password login |
| `app/(auth)/signup/page.tsx` | Signup with name, email, password, graduation year |
| `lib/supabase.ts` | Browser Supabase client (singleton) |
| `lib/supabase-server.ts` | Server Supabase client |
| `app/actions/create-group.ts` | Server action: create chat group + add members |
| `middleware.ts` | Auth gate — unauthenticated → `/login`, authenticated on auth pages → `/home` |
| `components/ui/bottom-nav.tsx` | Bottom tab navigation (5 tabs) |
| `components/ui/chats-section.tsx` | Recent chats list used on Home tab |
| `PRD.md` | Complete product spec, schema, feature specs, known gaps |

---

## Design System

### Fonts
- **Display / headings:** Instrument Serif (`var(--font-instrument-serif)`) — page titles, section headers, card titles, logo wordmark
- **UI / body:** Inter (`var(--font-inter)`) — all other text
- Both loaded via `next/font/google` in `app/layout.tsx`

### Colors — Quiet Modern palette
| Token | Hex | Use |
|-------|-----|-----|
| Primary (regal plum) | `#3E1540` | Buttons, active nav, hero card bg, announcement card bg, chat avatars (alternating) |
| Primary hover | `#2D0F2E` | Hover states on plum elements |
| Ink (deep black-purple) | `#13101A` | Primary headings, message content, second avatar color |
| Gold accent | `#C9A34B` | Unread badges only — use sparingly |
| Surface (warm ivory) | `#FBF8F2` | Page bg, card bg, input fills |
| Border | `#ECE8DE` | Cards, inputs, dividers |
| Body text | `#5A5466` | Announcement body, chat previews |
| Muted | `#8A8497` | Timestamps, secondary labels |
| Faint | `#C4C4C4` | Placeholders |
| Ivory (text on dark) | `#F6F4EF` | Text/icons on plum backgrounds |

### Key Design Rules
- **Plum budget:** max 2–3 plum elements per screen. Reserve `#3E1540` for primary interactions only.
- **Gold is for badges only** — unread counts. Not decorative.
- **Shadows:** neutral only — `shadow-[0_2px_8px_rgba(19,16,26,0.08)]`. No colored shadows.
- **No greeting** — "Good afternoon, [name]" is removed and must not return.
- **Logo:** Ring & Cross SVG (circle + cross bars) + "Central" in Instrument Serif, title case. Never "CENTRAL" all-caps, never filled square tile.
- **Hero card (announcements):** dark plum bg `#3E1540`, radial gold glow, Instrument Serif title (ivory), ivory RSVP pill.
- **Chat avatars:** alternate `#3E1540` / `#13101A` by index. Single serif initial. `borderRadius: 16px`. No colored shadows.
- **Section headers:** Instrument Serif, ~26px, weight 400, `#13101A`. No uppercase labels with left accent bars.

### Layout Rules
- **Mobile container:** `max-w-[390px] mx-auto` — always, never full-width
- **Full-screen overlays:** `fixed inset-0 z-[N]` outer — never bottom sheets
- **Overlay inner wrapper:** `max-w-[390px] mx-auto w-full h-full flex flex-col`
- **Safe area:** `pt-12` on all full-screen overlay headers (iOS status bar)
- **Scrollable pages:** `pb-28` to clear the bottom nav

### Z-Index Layers
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

## Architecture

### Tab Structure (all in `home-app.tsx`)
```
HomeApp (root — owns all global state)
├── HomeTab           — latest announcement preview + top 3 recent chats
├── AnnouncementsTab  — full feed, RSVP, admin/leader CRUD
├── ChatsTab          — Church Chats / My Chats sub-tabs, search, unread badges
├── DirectoryTab      — searchable member list, opens MemberSheet
└── ProfileTab        — edit spiritual profile fields, sign out
```

### Global State in HomeApp
- `activeTab` — which tab is visible
- `globalOpenChat` — mounts `ChatScreen` above everything when non-null
- `totalChatsUnread` — drives BottomNav badge
- `chatRefreshKey` — incremented on chat close to trigger data refreshes
- `recentChats` — top 3 chats by latest message, kept live via Realtime

### Supabase Realtime Channels
| Channel | Table | Events | Consumer |
|---------|-------|--------|---------|
| `group-messages-{groupId}` | `messages` | INSERT | `ChatScreen` |
| `reactions-{groupId}` | `message_reactions` | INSERT, DELETE | `ChatScreen` |
| `home-app-recent-chats` | `messages` | INSERT | `HomeApp` |

---

## Critical Conventions

1. **Never use `localStorage` or `sessionStorage`** — Supabase session only
2. **Role checks:** always `["admin", "leader"].includes(userRole.toLowerCase())` — DB stores mixed casing
3. **Optimistic updates** on all user-facing writes (messages, reactions, RSVPs)
4. **All DB writes** go through the browser Supabase client or server actions — no raw fetch
5. **Don't split `home-app.tsx`** — intentionally one file
6. **Tap vs long-press in ChatScreen:** < 400ms = emoji picker, ≥ 400ms = reply — don't break this

---

## Database Schema (quick reference)

| Table | Key Columns |
|-------|-------------|
| `profiles` | `id`, `name`, `email`, `graduation_year`, `role`, `about_me`, `bible_verse`, `prayer_request`, `pray_for_me` |
| `groups` | `id`, `name`, `type` (`church`/`my`/`dm`), `created_by`, `archived` |
| `group_members` | `group_id`, `user_id`, `last_read_at` |
| `messages` | `id`, `group_id`, `sender_id`, `content`, `created_at`, `reply_to_id` |
| `message_reactions` | `id`, `message_id`, `user_id`, `emoji` — UNIQUE(message_id, user_id, emoji) |
| `announcements` | `id`, `title`, `body`, `is_pinned`, `is_event`, `image_url`, `audience`, `created_by` |
| `announcement_views` | `announcement_id`, `user_id` |
| `rsvps` | `announcement_id`, `user_id` |

---

## Roles & Permissions

| Feature | Member | Leader | Admin |
|---------|--------|--------|-------|
| View announcements | ✓ | ✓ | ✓ |
| Create/edit/delete announcements | ✗ | ✓ | ✓ |
| Create church chats | ✗ | ✓ | ✓ |
| Create my/DM chats | ✓ | ✓ | ✓ |
| Archive church chats | ✗ | ✓ | ✓ |
| Rename/manage church chats | ✗ | ✓ | ✓ |
| Rename/manage my chats | ✓ | ✓ | ✓ |

