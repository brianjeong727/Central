# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

# CENTRAL — Project Context for Claude

> Multi-tenant church communication platform for college ministries.
> Mobile-first, warm-minimalist design (cream surfaces, editorial serif, plum as a surgical accent), real-time messaging.
> Product vision & roadmap: see `PRD.md`. (PRD.md is vision/roadmap only — not a spec. Implementation facts live here in CLAUDE.md.)

---

## How this file is organized — read this first

This file has four layers. When you learn something new, file it in the right layer (and propose where it goes — see "Capture" under Layer 2). Knowing which layer a thing belongs to is the whole point:

- **Layer 1 — Facts / Reference.** Stable, always-true context about how Central is built: stack, files, architecture, schema, env, permissions. Answers "what is correct here." Changes rarely.
- **Layer 2 — Standing Rules / Guardrails.** Imperatives about HOW to work: workflow, conventions, role-check patterns, migration rules. Answers "how must I behave." True across many tasks.
- **Layer 3 — Lessons.** Things learned from a mistake or a non-obvious surprise, kept in `tasks/lessons.md`. A lesson graduates UP into a Layer 2 rule once it proves general and stable.
- **Layer 4 — Skills.** Multi-step procedures and workflows, kept as SKILL.md files. Invoked, not memorized.

Filing rule of thumb: a **fact** → Layer 1; a **rule about behavior** → Layer 2; a **mistake/surprise not to repeat** → Layer 3 (`lessons.md`); a **procedure with steps** → Layer 4 (a skill).

**Related docs (each owns its domain — don't duplicate them here):**
- `DESIGN_SYSTEM.md` — full design contract: colors, typography, components, layout, the warm-minimalist direction. Design questions go here.
- `permissions.md` — canonical role/access truth; who-can-do-what across every feature.
- `MINISTRY_CONTEXT.md` — real-world ministry workflows and vocabulary (what DG, DGL, CCSF, rotation, etc. actually mean).
- `PRD.md` — product vision, feature intent (the "why" behind features), and roadmap. NOT implementation detail — CLAUDE.md owns the "how."

---

# LAYER 2 — STANDING RULES / GUARDRAILS

> How to work. These apply across tasks. Front-loaded because following them matters more than anything below.

## Workflow

### Before every non-trivial task
1. **Enter plan mode first** — for any task with 3+ steps, architectural decisions, or multiple files touched. Write the full plan before touching any code. Get approval before implementing.
2. **Ask clarifying questions** — if the request is ambiguous about behavior, ownership, UI placement, or access control, use `AskUserQuestion` to resolve it before starting. Don't guess and implement the wrong thing.
3. **Read files before editing** — always re-read a file immediately before editing it. The user may have committed changes since the last read; editing a stale version causes conflicts.

### During implementation
4. **Component-level by default** — when building or changing UI, generalize into a shared component or token so the decision propagates. Never add inline hardcoded hex values or off-scale spacing; consume the tokens in `app/globals.css`. Inline values are tech debt.
5. **One atomic URL param replace** — never call `replaceParam` (or `router.replace`) multiple times in sequence; they race on `window.location.search`. Build the full param set and do one replace.
6. **"use server" files** — only `async` functions can be exported from `"use server"` files. Shared sync helpers (e.g. `currentFiscalYear()`) must be defined locally in each client file that needs them.

### After every task
7. **Run `npm run build`** — required before marking anything done. A passing build is mandatory.
8. **Commit and push** — after every completed task, commit the relevant files and push to the CURRENT branch (never directly to `main`). Never leave completed work uncommitted.

## Capture — propose where new knowledge goes
## Capture & self-maintenance — keep this file current (propose, never silently edit)
This file must stay true to the codebase. You help maintain it, but the user approves every change — never edit CLAUDE.md without explicit approval in that task.

At the END of every task, run this check and proactively raise anything it surfaces:

1. **New knowledge to capture.** Did you learn something from a mistake, hit a non-obvious constraint, or get taught a multi-step workflow? Propose: (a) what was learned, (b) which layer it belongs in (Layer 1 fact / Layer 2 rule / Layer 3 lesson / Layer 4 skill), (c) the exact text to add. Complex repeatable workflow → propose a skill. A lesson that's proven general and stable → propose promoting it from lessons.md into a Layer 2 rule.

2. **Facts your own work just made stale.** Did this task add/rename/move a file, add a route, add or change a DB table/column, add a realtime channel, change a convention, or alter the shell/architecture? If so, the relevant Layer 1 entry (Key Files, Architecture, Schema index, Realtime, Routing, etc.) is now out of date. Propose the specific correction. Do NOT let Layer 1 drift behind the code you just wrote.

3. **Drift you noticed in passing.** If at any point during the task you saw CLAUDE.md contradict the actual code (a wrong path, an outdated rule, a renamed thing), flag it — even if it wasn't what you were working on. Don't silently work around a stale doc; surface it so it can be fixed.

For each item: state it plainly, propose the exact edit, and wait for approval. The user decides what gets written. Keep proposals short — a one-line "FYI, this is now stale: …" is better than skipping it. Err toward surfacing; an ignored proposal costs nothing, an un-surfaced staleness costs a future audit.

When you learn something from a mistake, discover a non-obvious constraint, or are taught a multi-step workflow, do NOT file it silently. At the end of the task, PROACTIVELY propose: (a) what was learned, (b) which layer it belongs in (Layer 1 fact / Layer 2 rule / Layer 3 lesson / Layer 4 skill), and (c) the exact text to add. The user approves before anything is written. If a workflow is complex enough to re-explain more than once, propose making it a skill. If a lesson has proven general and stable, propose promoting it from `lessons.md` into a Layer 2 rule.

## Critical Conventions
1. **Never use `localStorage` or `sessionStorage`** — Supabase session only.
2. **Role checks — three patterns; use the right one for the gate:**
   - `isAdmin = ["admin","deacon","elder","pastor"].includes(role.toLowerCase())` — admin-tier gates (settings, ministry config, giving editor, etc.)
   - `isLeaderOrAdmin = ["leader","admin","deacon","elder","pastor"].includes(role.toLowerCase())` — leader+admin gates (e.g. announcement create/edit)
   - `isAdminOrLeader = ["admin","leader","deacon","elder"].includes(role.toLowerCase())` — chat management, pins; **pastor is intentionally excluded here**
   These must stay consistent with `permissions.md`, which is the canonical source of truth for who can do what. Do not maintain a parallel description here that could drift from it.
3. **Visitor parity:** any check like `role === "member"` must be `["member", "visitor"].includes(role)`. Any check like `["admin", "leader", "member"].includes(role)` must add `"visitor"`.
4. **Optimistic updates** on all user-facing writes (messages, reactions, RSVPs).
5. **All DB writes** go through the browser Supabase client or server actions — no raw fetch.
6. **App shell structure:** `app/home/home-app.tsx` is the tab orchestrator (~713 lines) — it owns global state (`activeTab`, `globalOpenChat`, `totalChatsUnread`, `chatRefreshKey`, `recentChats`, `userTeams`, etc.) and renders the active tab. Each tab is its own file in `app/home/tabs/`. Shared UI components live in `components/central/`. When building new UI inside a tab, add it to that tab's file or extract a component into `components/central/` — do not add tab-level logic back into `home-app.tsx`.
7. **Tap vs long-press in ChatScreen:** < 400ms = emoji picker, ≥ 400ms = reply — never break this.
8. **ministry_id on all writes:** every INSERT/UPDATE must include `.eq("ministry_id", ministryId)` — defense-in-depth on top of RLS.
9. **SECURITY DEFINER helpers:** use `auth_ministry_id()` and `auth_is_admin_or_leader()` in RLS policies — never query `profiles` directly inside other table policies.
10. **RSVP is a toggle:** one row per (user, announcement). Insert on first click, delete on second. Never allow duplicate RSVPs.
11. **Middleware is `proxy.ts`:** never recreate `middleware.ts` — it was intentionally deleted.
12. **URL state for tabs:** Every tabbed view must sync active tab to URL query params. Implement at the same time as building tabs — never skip this. Lazy-init state from `new URLSearchParams(window.location.search).get("key")` and write via `router.replace`. One atomic replace only (see Workflow item 5 above). See `tasks/lessons.md` §URL State Persistence for the full param map and patterns.
13. **Shell migration — pattern must be on the tab component's own root div:** When migrating a tab onto the shell mount pattern, `md:flex md:flex-col md:h-full md:overflow-hidden` must be on the **tab component's own root div**, not only the wrapper in `home-app.tsx`. Without it, `md:flex-1` on the desktop section has no flex parent to resolve against — the root div grows to full content height and gets clipped by the wrapper's `overflow: hidden` instead of scrolling. Match `DirectoryTab`'s root div structure exactly: `<div className="pb-2 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">`. Tabs migrated: Directory, Planning, Chat.

## Database Migrations
Never create migration files in the `supabase/` folder and ask the user to run them manually. The Supabase MCP is connected — always run migrations directly against the database using the MCP. When a schema change is needed, execute it immediately as part of the task. After running, verify the tables and policies were created correctly by querying the database before moving on.

## Build & verify
There are no unit tests. Verify features by running the dev server and testing manually. Always run `npm run build` before considering any task complete — a passing build is required.

```bash
npm run dev      # start dev server at localhost:3000
npm run build    # production build (also type-checks)
npm run lint     # ESLint
```

---

# LAYER 4 — SKILLS

> Multi-step procedures. Invoked, not memorized. (This block is reframed as Layer 4 but not yet re-architected — a separate audit of which global skills still earn their place is pending.)

## Read these first

Before writing any UI code, editing any component, or reviewing any page:

1. **Load `skills/design-system/SKILL.md`** — mandatory before touching any UI file.
2. **Load `skills/design-system/DESIGN_SYSTEM.md`** — the full design contract. 

Before starting any feature, fix, or change:

3. **Load `skills/testing/SKILL.md`** — mandatory on every task, not just when asked.

Before writing any animation, micro-interaction, hover state, or transition:

4. **Load `~/.claude/skills/emil-design-eng/SKILL.md`** — animation decision framework, easing curves, press states, popover origins, performance guardrails. Answers "should this animate?", "what easing?", "how fast?".

Before designing new UI components or doing any visual review/polish pass:

5. **Load `~/.claude/skills/taste/taste-skill/SKILL.md`** — bias-correction rules for layout, typography, interactive states, materiality, and empty states. See project overrides below before applying.

**Additional skills available on demand** (not auto-loaded — invoke explicitly when needed):
- `~/.claude/skills/ui-ux-pro-max/SKILL.md` — pre-delivery UX review checklist; 99 rules across accessibility, touch, performance, navigation, forms, animation (Apple HIG + Material Design). Use §1 Accessibility, §2 Touch & Interaction, §3 Performance, §9 Navigation Patterns most. **Skip** the Python `search.py` CLI (not set up for this project) and **skip** the `--stack react-native` section (Central is Next.js, not React Native).
- `~/.claude/skills/impeccable/SKILL.md` — deep brand+product design system; requires PRODUCT.md/DESIGN.md in project root.
- `~/.claude/skills/taste/redesign-skill/SKILL.md` — full component redesigns.
- `~/.claude/skills/taste/minimalist-skill/SKILL.md` — stripping components to essentials.
- `~/.claude/skills/taste/soft-skill/SKILL.md` — soft/warm aesthetic polish.

This is not optional. Every UI decision must be verified against the design system. Every feature must pass the testing checklist before being marked done.

## Project overrides for global design skills

The global skills have rules that conflict with Central's **intentional** design decisions. These project rules win:

| Global skill rule | Central override |
|---|---|
| `taste-skill` / `ui-ux-pro-max` ban emojis entirely | Emojis **are used** for team icons (🏛️, 🎵, etc.) — ban applies only to decorative prose/button-label use |
| `taste-skill` "Lila Ban" — no purple/AI aesthetics | Plum (`#3E1540`, `#2D0F2E`) is Central's accent, used surgically per DESIGN_SYSTEM.md §0/§1.1 — NOT a surface, background, or brand fill. The blanket anti-purple ban doesn't apply, but plum is scarce by design, not a default. |
| `taste-skill` recommends Geist/Satoshi fonts | Central uses **Bricolage Grotesque** as the sole typeface — do not swap |
| `taste-skill` Tailwind v3 guards | Central runs **Tailwind v4** — ignore v3-specific warnings |

---

# LAYER 3 — LESSONS

> Things learned the hard way. The lessons themselves live in `tasks/lessons.md` — this is the pointer and the boundary definition.

`tasks/lessons.md` holds specifics discovered from a mistake or a non-obvious surprise: things a fresh Claude would plausibly get wrong again. Examples currently captured there include URL state persistence patterns (§URL State Persistence). A lesson stays here while it's narrow or situational; once it proves general and load-bearing, propose promoting it into a Layer 2 Critical Convention (the high-frequency, frequently-violated ones live in Layer 2 even if they originated as lessons — e.g. the atomic-replaceParam rule and the "use server" async-only rule are kept as rules above because following them matters more than taxonomic purity).

---

# LAYER 1 — FACTS / REFERENCE

> Stable, always-true context. Changes rarely.

## Stack
Next.js 16 (App Router), Supabase (Postgres + Realtime + RLS + Storage), Tailwind CSS v4, shadcn/ui, TypeScript, Vercel.

## Key Files

| File | Purpose |
|------|---------|
| `app/home/home-app.tsx` | Tab orchestrator (~713 lines) — owns global state, renders the active tab, mounts global overlays (ChatScreen, AnnouncementDetailView, CommandPalette). Imports all tabs from `app/home/tabs/`. |
| `app/home/tabs/home-tab.tsx` | Home tab — greeting, role badge, up-next event, recent chats, congregation question prompt |
| `app/home/tabs/announcements-tab.tsx` | Announcements tab — full feed, RSVP, admin/leader CRUD, pinning, announcement detail view |
| `app/home/tabs/chats-tab.tsx` | Chats tab — on desktop: `ChatListPanel` (conversation list) renders in `DesktopSidebar` via `chatPanelContent` prop; `ChatScreen inline` renders in the content area. Mobile: `ChatsTab` (full list + overlay chat) wrapped in `md:hidden`. Also exports `ChatScreen`, `ChatSettings`, `CreateChatScreen`. |
| `app/home/tabs/plan-tab.tsx` | Plan tab — team planning. Desktop uses the shared shell pattern: `hidden md:flex` section + `TabPageHeader` (keeps its bottom `InsetHairline` always) + optional cream event sub-header (back-to-calendar, event title, edit pencil; `borderBottom: 1px solid var(--line)`) + `flex-1 overflow-y-auto` body. Strip-bearing teams (PraiseTeamTab, StudentOrgTeamHome, SmallGroupLeadersTab) render with no outer `px-14` wrapper; `PlanSubTabStrip` labels are inset via inner `md:pl-14`; the under-tabs hairline is `md:mx-14` inset matching `InsetHairline`. Non-strip teams (DgPraiseTeam, OneTimeTeam, TechTeam) use `px-14 py-7` wrappers. Mobile (`md:hidden`) is a sibling outside the desktop section, untouched. |
| `app/home/tabs/directory-tab.tsx` | Directory tab — master/detail: member list in shell context panel (DirectoryMemberListPanel), member detail in content area (TabPageHeader + PageTitle); mobile path unchanged |
| `app/home/tabs/giving-tab.tsx` | Finance tab — giving info, reimbursements, budget, fund allocation |
| `app/home/tabs/profile-tab.tsx` | Profile tab — spiritual profile fields, journal (devotionals/prayers/verses sub-tabs), sign out |
| `app/home/tabs/settings-tab.tsx` | Settings tab — admin-only; ministry settings, member management, roles |
| `app/home/tabs/forms-tab.tsx` | Forms tab — announcement-linked forms, responses |
| `app/home/tabs/congregation-tab.tsx` | Congregation tab — pastor-only; congregation polling and pulse questions |
| `app/home/components/command-palette.tsx` | ⌘K command palette — quick nav, person/chat/announcement search |
| `app/home/components/desktop-nav.tsx` | Desktop sidebar navigation |
| `app/home/components/shared.tsx` | Shared UI primitives used across tab files |
| `app/home/types.ts` | All shared TypeScript types for home and tabs |
| `app/home/utils.ts` | Shared utility functions (formatRelativeTime, getInitials, getAvatarColor) |
| `app/home/page.tsx` | Server component — auth check, profile load, renders `<HomeApp>` |
| `app/(auth)/login/page.tsx` | Email + password login |
| `app/(auth)/signup/page.tsx` | Signup with name, email, password, graduation year |
| `app/join/page.tsx` | Post-signup — enter invite code OR register new ministry |
| `app/landing/page.tsx` | Redirects to `/` (landing content now lives at root) |
| `app/page.tsx` | Public landing / marketing page (renders `LandingPage` component) |
| `app/ministries/page.tsx` | Public ministry discovery + My Ministries |
| `app/onboarding/page.tsx` | Ministry registration wizard |
| `app/admin/page.tsx` | Founder-only admin panel (gated by hardcoded email in proxy.ts) |
| `app/announcements/[id]/page.tsx` | Shareable announcement detail route |
| `app/not-admin/page.tsx` | Shown when a non-admin tries to reach an admin route |
| `app/pending/page.tsx` | Shown when user's ministry has `status = 'pending'` |
| `app/pick-ministry/page.tsx` | Multi-ministry switcher |
| `app/actions/create-group.ts` | Server action: create chat group + add members |
| `app/actions/ministry.ts` | Server actions: `joinMinistryByCode`, `registerMinistry`, `selfLeaveMinistry` |
| `proxy.ts` | Auth gate middleware — replaces deleted `middleware.ts` |
| `lib/supabase.ts` | Browser Supabase client (singleton, exports `createClient()`) |
| `lib/supabase-server.ts` | Server Supabase client |
| `lib/supabase-admin.ts` | Admin Supabase client (service role) |
| `lib/audit.ts` | Audit log helpers |
| `lib/group-algorithm.ts` | Small group generation algorithm |
| `components/ui/bottom-nav.tsx` | Bottom tab navigation (mobile only) |
| `components/ui/chats-section.tsx` | Recent chats list used on Home tab |
| `components/central/` | Shared design-system components (Button, Card, PageTitle, SectionHeader, StatCard, UpNextCard, ChatStrip, etc.) |
| `permissions.md` | **Canonical source of truth** for role-based access — who can do what across every feature |

## Architecture

### Middleware
The auth middleware lives in `proxy.ts` — **not** `middleware.ts` (that file was deleted).

Public routes allowed through: `/`, `/landing`, `/ministries`, `/login`, `/signup`, `/forgot-password`, `/update-password`, `/auth/`, `/api/calendar/`, `/not-admin`.

### Multi-tenant model
Every workspace is a **ministry**. All tenant data carries a `ministry_id` FK. RLS policies enforce isolation. Two SECURITY DEFINER helpers bypass profile-table RLS without recursion:
- `auth_ministry_id()` — returns current user's `ministry_id`
- `auth_is_admin_or_leader()` — returns `true` if role is admin or leader

New users with no `ministry_id` are redirected to `/join` by middleware.

### Routing flow
```
/              → public LandingPage (marketing page; logged-in users are NOT auto-redirected)
/landing       → redirects to /
/login, /signup → auth pages (no ministry required)
/join          → invite code or register new ministry
/home          → main app shell (requires auth + ministry_id)
/ministries    → public ministry discovery
/onboarding    → ministry registration wizard
/admin         → founder-only admin panel
/pending       → ministry status = pending
/pick-ministry → multi-ministry switcher
/announcements/[id] → shareable announcement detail
```

**Ministry status routing:** `proxy.ts` checks `ministries.status`. If `pending` → redirect to `/pending`; if `rejected` → redirect to `/landing`. Only `active` ministries reach `/home`.

**Vanity URL tab redirects** (handled in `proxy.ts`): `/announcements`, `/forms`, `/settings`, `/church-settings`, `/profile`, `/messages`, `/events` all redirect to their `?tab=...` equivalents at `/home`.

### Tab structure (orchestrated by `home-app.tsx`, each tab is its own file in `app/home/tabs/`)

Valid tab values (from `app/home/types.ts`):
`"home" | "announcements" | "chats" | "plan" | "directory" | "giving" | "give" | "profile" | "settings" | "forms" | "congregation"`

```
HomeApp (root — owns all global state)
├── home           → HomeTab         — greeting, up-next event, recent chats, congregation prompt
├── announcements  → AnnouncementsTab — feed, RSVP, admin/leader CRUD, pinning
├── chats          → ChatsTab         — Church Chats / My Chats, ChatScreen, ChatSettings
├── plan           → PlanTab          — teams, worship, DGL rotation, event planning (shown when user has teams or is admin; hidden for deacons/elders)
├── directory      → DirectoryTab     — member list + member sheet
├── giving/give    → GivingTab        — 4 sections: give (Zelle info), reimbursements, budget, allocation
├── profile        → ProfileTab       — spiritual profile + journal (devotionals/prayers/verses)
├── settings       → SettingsTab      — admin-only: ministry settings, member roles
├── forms          → FormsTab         — announcement-linked forms and responses
└── congregation   → CongregationTab  — pastor-only: congregation pulse questions
```

### Global state in HomeApp
- `activeTab` — which tab is visible
- `globalOpenChat` — mounts `ChatScreen` overlay when non-null
- `openAnnouncementId` — mounts `AnnouncementDetailView` overlay when non-null
- `totalChatsUnread` — drives BottomNav badge
- `chatRefreshKey` — incremented on chat close to trigger refreshes
- `recentChats` — top chats by latest message, kept live via Realtime
- `userTeams` / `allTeams` — current user's team memberships + all ministry teams
- `activeTeamId` — which team is selected in PlanTab (synced to URL `?team=`)
- `avatarUrl`, `isDesktop`, `paletteOpen`, `ministryIsPublic` — UI state
- `activeQuestion` / `hasResponded` — congregation question state
- `profileSection`, `financeSection`, `activeMemberId` — sub-tab state (all URL-synced)

### Supabase Realtime channels

| Channel | Table | Events | Consumer |
|---------|-------|--------|----------|
| `group-messages-{groupId}` | `messages` | INSERT | `ChatScreen` |
| `reactions-{groupId}` | `message_reactions` | INSERT, DELETE | `ChatScreen` |
| `home-app-recent-chats` | `messages` | INSERT | `HomeApp` |
| `read-receipts-{groupId}` | `group_members` | UPDATE | `ChatScreen` |
| `typing-{groupId}` | — | broadcast | `ChatScreen` (typing indicator) |

### Supabase project
- Project ID: `wgqpnilaokfipocsugqo`
- Storage buckets: `announcement-images` (public), `bible-study` (public), `chat-attachments` (public), `devotionals` (public), `profile-images` (public), `worship-charts` (public)

## Environment Variables (required on Vercel)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (used in auth callback) |
| `ANTHROPIC_API_KEY` | Anthropic API (praise team slideshow generator) |
| `NEXT_PUBLIC_SITE_URL` | `https://joincentral.app` |

## Database Schema

> **Source of truth: the live database.** Query it via Supabase MCP (`mcp__supabase__list_tables`, `mcp__supabase__execute_sql`) rather than trusting any copy here. The tables below are correct as of the last audit (2026-06-20) but schema evolves — always verify before writing migrations.

### Core tables (frequently read in everyday work)

| Table | Key Columns |
|-------|-------------|
| `ministries` | `id`, `name`, `university`, `universities` (jsonb), `invite_code`, `staff_invite_code`, `status` (`active`/`pending`/`rejected`), `is_public`, `location`, `automation_settings` (jsonb), `created_by` |
| `profiles` | `id`, `ministry_id`, `name`, `email`, `role`, `graduation_year`, `grade`, `needs_grad_check`, `gender`, `avatar_url`, `about_me`, `bible_verse`, `prayer_request`, `pray_for_me`, `phone`, `bio`, `testimony`, `favorite_worship_song`, `favorite_verse`, `favorite_book_of_bible`, `show_journal_entries`, `show_journal_streak`, `school_id`, `saved_signature`, `sidebar_note` |
| `groups` | `id`, `ministry_id`, `name`, `type` (`church`/`my`/`dm`), `created_by`, `archived`, `pinned_message_id` |
| `group_members` | `group_id`, `user_id`, `last_read_at` |
| `messages` | `id`, `group_id`, `sender_id`, `content`, `created_at`, `reply_to_id`, `message_type`, `is_edited`, `edited_at`, `attachment_url`, `attachment_type`, `attachment_name`, `attachment_size`, `poll_id` |
| `announcements` | `id`, `ministry_id`, `title`, `body`, `is_pinned`, `is_sub_pinned`, `is_event`, `image_url`, `audience`, `created_by`, `show_attendees`, `status` |
| `announcement_views` | `announcement_id`, `user_id` — UNIQUE |
| `rsvps` | `announcement_id`, `user_id` — UNIQUE(announcement_id, user_id) |
| `teams` | `id`, `ministry_id`, `name`, `icon`, `description`, `team_type` (`standard`/`dg_praise`/`one_time`), `created_by` |
| `team_roles` | `id`, `team_id`, `name`, `permissions` (jsonb array of strings) |
| `team_members` | `id`, `team_id`, `user_id`, `role_id`, `added_by` — UNIQUE(team_id, user_id) |

### Feature-area index (names only — query MCP for columns)

**Messaging**
`polls`, `poll_votes`, `message_reactions`, `group_sessions`

**Announcements & Forms**
`announcement_forms`, `form_fields`, `form_responses`, `form_answers`

**Journal / Devotionals**
`devotionals`, `prayers`, `verses`, `home_verses`

**Events & Calendar**
`calendar_events`, `event_plans`, `event_tasks`, `event_notes`, `event_roles`, `event_new_folks`

**Worship / Praise Team**
`worship_weeks`, `worship_songs`, `worship_charts`, `worship_roles`, `worship_invites`, `worship_availability`, `worship_annotations`

**DGL Rotation**
`dgl_roster`, `dgl_assignments`, `dgl_availability`, `dgl_roster_status`, `ccsf_rotations`

**Small Groups**
`small_groups`, `small_group_members`, `generated_groups`, `generated_group_members`

**Bible Study**
`bible_study_sheets`, `bible_study_progress`, `bible_study_team_progress`, `bible_study_annotations`

**Congregation Pulse**
`congregation_questions`, `congregation_responses`

**Finance**
`budget_categories`, `budget_entries`, `ministry_budgets`, `reimbursement_forms`, `receipts`, `receipt_limits`, `ministry_giving`

**Team management**
`meeting_notes`, `team_role_links`, `team_role_descriptions`

**Ministry admin**
`user_ministries`, `ministry_schools`, `ministry_bans`, `ministry_departures`, `audit_logs`

**Profile trigger:** `handle_new_user()` fires `AFTER INSERT ON auth.users` and auto-creates a `profiles` row. `ministry_id` is NULL until the user completes `/join`.

## Roles & Permissions

**See `permissions.md` for the full canonical breakdown.** The role-check patterns that translate roles to permission tiers are documented in Layer 2 Critical Convention #2.

DB role values in use: `visitor`, `member`, `leader`, `admin`, `deacon`, `elder`, `pastor`.

Permission tiers:
- **Admin-tier** (`admin`, `deacon`, `elder`, `pastor`) — ministry management, settings, full CRUD
- **Leader-tier** (`leader` + admin-tier) — announcement create/edit, church chat management
- **Member-tier** (`member`, `visitor`) — read-only plus personal chats and RSVPs

**Visitor:** People participating before formal membership. Same functional permissions as Member. Badge is white/outlined to distinguish from Member's filled cream badge.

## Z-Index Layers

| Element | Z |
|---------|---|
| Bottom nav | 50 |
| Member sheet | 60 |
| Announcements modal | 60 |
| Announcement detail | 60 |
| Chat screen | 100 |
| Chat settings | 110 |
| Emoji dismiss overlay | 155 |
| Emoji picker | 160 |

## Layout Rules
- **Mobile container:** `max-w-[390px] mx-auto` — always, never full-width on mobile views.
- **Full-screen overlays:** `fixed inset-0 z-[N]` outer wrapper.
- **Overlay inner:** `max-w-[390px] mx-auto w-full h-full flex flex-col`.
- **Safe area:** `pt-12` on all full-screen overlay headers (iOS status bar).
- **Scrollable pages:** `pb-28` to clear the bottom nav.
