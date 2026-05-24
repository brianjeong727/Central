# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

# CENTRAL — Project Context for Claude

> Multi-tenant church communication platform for college ministries.
> Mobile-first, Quiet Modern design (regal plum + warm ivory), real-time messaging.
> Full spec: see `PRD.md` in this directory.

---

## Workflow

### Before every non-trivial task
1. **Enter plan mode first** — for any task with 3+ steps, architectural decisions, or multiple files touched. Write the full plan before touching any code. Get approval before implementing.
2. **Ask clarifying questions** — if the request is ambiguous about behavior, ownership, UI placement, or access control, use `AskUserQuestion` to resolve it before starting. Don't guess and implement the wrong thing.
3. **Read files before editing** — always re-read a file immediately before editing it. The user may have committed changes since the last read; editing a stale version causes conflicts.

### During implementation
4. **One atomic URL param replace** — never call `replaceParam` (or `router.replace`) multiple times in sequence; they race on `window.location.search`. Build the full param set and do one replace.
5. **"use server" files** — only `async` functions can be exported from `"use server"` files. Shared sync helpers (e.g. `currentFiscalYear()`) must be defined locally in each client file that needs them.

### After every task
6. **Run `npm run build`** — required before marking anything done. A passing build is mandatory.
7. **Commit and push** — after every completed task, commit the relevant files and push to `origin/main`. Never leave completed work uncommitted.

---

## Skills — Read These First

Before writing any UI code, editing any component, or reviewing any page:

1. **Load `skills/design-system/SKILL.md`** — mandatory before touching any UI file
2. **Load `skills/design-system/design-system.md`** — the full design contract

Before starting any feature, fix, or change:

3. **Load `skills/testing/SKILL.md`** — mandatory on every task, not just when asked

Before writing any animation, micro-interaction, hover state, or transition:

4. **Load `~/.claude/skills/emil-design-eng/SKILL.md`** — animation decision framework, easing curves, press states, popover origins, performance guardrails. Answers "should this animate?", "what easing?", "how fast?".

Before designing new UI components or doing any visual review/polish pass:

5. **Load `~/.claude/skills/taste/taste-skill/SKILL.md`** — bias-correction rules for layout, typography, interactive states, materiality, and empty states. See project overrides below before applying.

**Additional skills available on demand** (not auto-loaded — invoke explicitly when needed):
- `~/.claude/skills/ui-ux-pro-max/SKILL.md` — pre-delivery UX review checklist; 99 rules across accessibility, touch, performance, navigation, forms, animation (all sourced from Apple HIG + Material Design). Use §1 Accessibility, §2 Touch & Interaction, §3 Performance, and §9 Navigation Patterns most. **Skip** the Python `search.py` CLI (not set up for this project) and **skip** the `--stack react-native` section (Central is Next.js, not React Native).
- `~/.claude/skills/impeccable/SKILL.md` — deep brand+product design system; requires PRODUCT.md/DESIGN.md in project root
- `~/.claude/skills/taste/redesign-skill/SKILL.md` — full component redesigns
- `~/.claude/skills/taste/minimalist-skill/SKILL.md` — stripping components to essentials
- `~/.claude/skills/taste/soft-skill/SKILL.md` — soft/warm aesthetic polish

This is not optional. Every UI decision must be verified against the design system. Every feature must pass the testing checklist before being marked done.

### Project overrides for global design skills

The global skills have rules that conflict with Central's **intentional** design decisions. These project rules win:

| Global skill rule | Central override |
|---|---|
| `taste-skill` / `ui-ux-pro-max` ban emojis entirely | Emojis **are used** for team icons (`🏛️`, `🎵`, etc.) — ban applies only to decorative prose/button-label use |
| `taste-skill` "Lila Ban" — no purple/AI aesthetics | Central's brand **is** regal plum (`#3E1540`, `#2D0F2E`) — the ban does not apply |
| `taste-skill` recommends Geist/Satoshi fonts | Central uses **Inter** (body) + **Instrument Serif** (display) — do not swap |
| `taste-skill` Tailwind v3 guards | Central runs **Tailwind v4** — ignore v3-specific warnings |

---

## Commands

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build (also type-checks)
npm run lint     # ESLint
```

There are no unit tests. Verify features by running the dev server and testing manually.
Always run `npm run build` before considering any task complete — a passing build is required.

---

## Stack
Next.js 16 (App Router), Supabase (Postgres + Realtime + RLS + Storage), Tailwind CSS v4, shadcn/ui, TypeScript, Vercel

---

## Key Files

| File | Purpose |
|------|---------|
| `app/home/home-app.tsx` | **Entire app shell** — all tabs + all components (~9000 lines, intentionally one file) |
| `app/home/page.tsx` | Server component — auth check, profile load, renders `<HomeApp>` |
| `app/(auth)/login/page.tsx` | Email + password login |
| `app/(auth)/signup/page.tsx` | Signup with name, email, password, graduation year |
| `app/join/page.tsx` | Post-signup — enter invite code OR register new ministry |
| `app/landing/page.tsx` | Public landing page |
| `app/ministries/page.tsx` | Public ministry discovery + My Ministries |
| `app/onboarding/page.tsx` | Ministry registration wizard |
| `app/actions/create-group.ts` | Server action: create chat group + add members |
| `app/actions/ministry.ts` | Server actions: `joinMinistryByCode`, `registerMinistry` |
| `proxy.ts` | Auth gate middleware — replaces deleted `middleware.ts` |
| `lib/supabase.ts` | Browser Supabase client (singleton) |
| `lib/supabase-server.ts` | Server Supabase client |
| `components/ui/bottom-nav.tsx` | Bottom tab navigation (5 tabs) |
| `components/ui/chats-section.tsx` | Recent chats list used on Home tab |
| `supabase/multi_tenant_migration.sql` | Full multi-tenant schema + RLS policies |
| `supabase/profile_trigger_migration.sql` | `handle_new_user` trigger |
| `PRD.md` | Complete product spec, schema, feature specs, known gaps |

---

## Architecture

### Middleware
The auth middleware lives in `proxy.ts` — **not** `middleware.ts` (that file was deleted).
Public routes allowed through: `/`, `/landing`, `/login`, `/signup`, `/join`, `/onboarding`, `/ministries`, `/auth/`

### Multi-tenant model
Every workspace is a **ministry**. All tenant data carries a `ministry_id` FK. RLS policies enforce isolation. Two SECURITY DEFINER helpers bypass profile-table RLS without recursion:
- `auth_ministry_id()` — returns current user's `ministry_id`
- `auth_is_admin_or_leader()` — returns `true` if role is admin or leader

New users with no `ministry_id` are redirected to `/join` by middleware.

### Routing flow
/ → /home (root redirect)
/login, /signup → auth pages (no ministry required)
/join → invite code or register new ministry
/home → main app shell (requires auth + ministry_id)
/ministries → public ministry discovery
/onboarding → ministry registration wizard

### Tab structure (all in `home-app.tsx`)
HomeApp (root — owns all global state)
├── HomeTab           — greeting, role badge, up next event, recent chats
├── AnnouncementsTab  — full feed, RSVP, admin/leader CRUD
├── ChatsTab          — Church Chats / My Chats sub-tabs, search, unread badges
├── PlanTab           — team planning (Praise Team, Student Org Board, Small Groups)
├── DirectoryTab      — searchable member list, opens MemberSheet
├── JournalTab        — devotionals, prayers, verses
├── GivingTab         — Zelle info, editable by admins
└── ProfileTab        — spiritual profile fields, sign out

### Global state in HomeApp
- `activeTab` — which tab is visible
- `globalOpenChat` — mounts `ChatScreen` above everything when non-null
- `totalChatsUnread` — drives BottomNav badge
- `chatRefreshKey` — incremented on chat close to trigger refreshes
- `recentChats` — top 3 chats by latest message, kept live via Realtime
- `ministryId` — current user's ministry UUID, passed to all DB-writing components

### Supabase Realtime channels
| Channel | Table | Events | Consumer |
|---------|-------|--------|---------|
| `group-messages-{groupId}` | `messages` | INSERT | `ChatScreen` |
| `reactions-{groupId}` | `message_reactions` | INSERT, DELETE | `ChatScreen` |
| `home-app-recent-chats` | `messages` | INSERT | `HomeApp` |
| `read-receipts-{groupId}` | `group_members` | UPDATE | `ChatScreen` |

### Supabase project
- Project ID: `wgqpnilaokfipocsugqo`
- Storage buckets: `announcement-images` (public), `devotionals` (public), `profile-images` (needs public toggle), `worship-charts` (public)

---

## Environment Variables (required on Vercel)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (used in auth callback) |
| `ANTHROPIC_API_KEY` | Anthropic API (praise team slideshow generator) |
| `NEXT_PUBLIC_SITE_URL` | `https://joincentral.app` |

---

## Database Schema

| Table | Key Columns |
|-------|-------------|
| `ministries` | `id`, `name`, `university`, `size`, `invite_code` (unique), `created_by`, `is_public` |
| `profiles` | `id`, `ministry_id`, `name`, `email`, `graduation_year`, `role`, `about_me`, `bible_verse`, `prayer_request`, `pray_for_me` |
| `groups` | `id`, `ministry_id`, `name`, `type` (`church`/`my`/`dm`), `created_by`, `archived` |
| `group_members` | `group_id`, `user_id`, `last_read_at` |
| `messages` | `id`, `group_id`, `sender_id`, `content`, `created_at`, `reply_to_id` |
| `message_reactions` | `id`, `message_id`, `user_id`, `emoji` — UNIQUE(message_id, user_id, emoji) |
| `announcements` | `id`, `ministry_id`, `title`, `body`, `is_pinned`, `is_event`, `image_url`, `audience`, `created_by`, `show_attendees` |
| `announcement_views` | `announcement_id`, `user_id` — UNIQUE |
| `rsvps` | `announcement_id`, `user_id` — UNIQUE(announcement_id, user_id) |
| `teams` | `id`, `ministry_id`, `name`, `description`, `icon`, `created_by` |
| `team_roles` | `id`, `team_id`, `name`, `permissions` (JSONB) |
| `team_members` | `id`, `team_id`, `user_id`, `role_id`, `added_by` — UNIQUE(team_id, user_id) |
| `worship_charts` | praise team chart uploads, OCR extracted data |
| `meeting_notes` | ministry meeting notes |

**Profile trigger:** `handle_new_user()` fires `AFTER INSERT ON auth.users` and auto-creates `profiles` row. `ministry_id` is NULL until user completes `/join`.

---

## Roles & Permissions

Four tiers — visitor, member, leader, admin. DB stores mixed casing; always check with `.toLowerCase()`.

| Feature | Visitor | Member | Leader | Admin |
|---------|---------|--------|--------|-------|
| View announcements | ✓ | ✓ | ✓ | ✓ |
| Create/edit/delete announcements | ✗ | ✗ | ✓ | ✓ |
| Create church chats | ✗ | ✗ | ✓ | ✓ |
| Create my/DM chats | ✓ | ✓ | ✓ | ✓ |
| Archive/manage church chats | ✗ | ✗ | ✓ | ✓ |
| View RSVP attendee list | ✗ | ✗ | ✓ | ✓ |
| Toggle public attendee visibility | ✗ | ✗ | ✗ | ✓ |
| Access Settings tab | ✗ | ✗ | ✗ | ✓ |
| Change member roles | ✗ | ✗ | ✗ | ✓ |
| Edit giving info | ✗ | ✗ | ✗ | ✓ |
| Edit ministry profile | ✗ | ✗ | ✗ | ✓ |

**Visitor:** People participating before formal membership — identical permissions to Member. Badge is white/outlined to distinguish from Member's filled cream badge.
**Leader subtypes:** DGL, Student Board, Praise Team — all share the leader permission tier.
**Admin subtypes:** Pastors, Deacons, Elders — all share the admin permission tier.

**Role check pattern:** Any check like `role === "member"` must be `["member", "visitor"].includes(role)`. Any check like `["admin", "leader", "member"].includes(role)` must add `"visitor"`.

---

## Critical Conventions

1. **Never use `localStorage` or `sessionStorage`** — Supabase session only
2. **Role checks:** always `["admin", "leader"].includes(userRole.toLowerCase())`
3. **Optimistic updates** on all user-facing writes (messages, reactions, RSVPs)
4. **All DB writes** go through the browser Supabase client or server actions — no raw fetch
5. **Don't split `home-app.tsx`** — intentionally one file
6. **Tap vs long-press in ChatScreen:** < 400ms = emoji picker, ≥ 400ms = reply — never break this
7. **ministry_id on all writes:** every INSERT/UPDATE must include `.eq("ministry_id", ministryId)` — defense-in-depth on top of RLS
8. **SECURITY DEFINER helpers:** use `auth_ministry_id()` and `auth_is_admin_or_leader()` in RLS policies — never query `profiles` directly inside other table policies
9. **RSVP is a toggle:** one row per (user, announcement). Insert on first click, delete on second. Never allow duplicate RSVPs.
10. **Middleware is `proxy.ts`:** never recreate `middleware.ts` — it was intentionally deleted
11. **URL state for tabs:** Every tabbed view must sync active tab to URL query params. Implement at the same time as building tabs — never skip this. Lazy-init state from `new URLSearchParams(window.location.search).get("key")` and write via `router.replace`. Never call `replaceParam` multiple times in sequence — they race on `window.location.search`; do one atomic replace instead. See `tasks/lessons.md` §URL State Persistence for the full param map and patterns.

---

## Z-Index Layers

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

## Layout Rules

- **Mobile container:** `max-w-[390px] mx-auto` — always, never full-width on mobile views
- **Full-screen overlays:** `fixed inset-0 z-[N]` outer wrapper
- **Overlay inner:** `max-w-[390px] mx-auto w-full h-full flex flex-col`
- **Safe area:** `pt-12` on all full-screen overlay headers (iOS status bar)
- **Scrollable pages:** `pb-28` to clear the bottom nav

---

## Database Migrations
Never create migration files in the `supabase/` folder and ask the user to run them manually. The Supabase MCP is connected — always run migrations directly against the database using the MCP. When a schema change is needed, execute it immediately as part of the task. After running, verify the tables and policies were created correctly by querying the database before moving on.