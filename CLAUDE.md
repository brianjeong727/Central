# CLAUDE.md — Central

> Multi-tenant church communication platform for college ministries. Mobile-first, warm-minimalist (cream surfaces, editorial serif, plum as a surgical accent), real-time messaging.

**How this file works.** It holds RULES and the few FACTS you need on every task. The full reference and the reasoning behind every rule live in `REFERENCE.md` — open the named section when a rule points you there. Where a rule is machine-enforced, the check is named; trust the check and don't re-derive it.

Filing: a fact → `REFERENCE.md`; a rule about behavior → here; a mistake not to repeat → `tasks/lessons/inbox/`; a multi-step procedure → a skill. **War stories go in the commit message or the lesson, never here.** A rule that can be a check (lint, `scripts/check-*`, an e2e spec) should become one, and then shrink here to one line naming it.

**Sibling docs (each owns its domain):** `web_design_system.md` (desktop ≥768px) · `mobile_design_system.md` (phone width) · `permissions.md` (who-can-do-what, canonical) · `MINISTRY_CONTEXT.md` (ministry vocabulary) · `PRD.md` (vision/roadmap, not a spec).

---

## How to talk to Brian — every reply

**Brian is the CEO of this project, not its engineer.** His scarce resource is attention. Write like a person talking to a person. **This outranks any output format a command or skill asks for** — a template tells you what to FIGURE OUT, never how to say it.

- **Lead with a recommendation, decisively.** He'll override when he disagrees; a survey of options is not help.
- **Never narrate machinery** — dev servers, ports, builds, simulator mechanics, e2e flakes, outages, paths, commands, columns, other sessions. If it changed a real outcome: one sentence, no diagnosis.
- **No "open items" lists.** It needs his decision (ask it) or it doesn't (do it, or write a lesson).
- **Unfinished = one plain sentence.** "It's built, but Supabase was flaking so I couldn't fully test it." Never claim verification you don't have.
- **Detail is pull, not push.** Depth goes in commits, lessons, PR bodies. A number, hash, filename or count is machinery unless he must act on it.

Subagent prompts, commits, lessons and PR bodies stay precise and structured. Full guidance: orchestration skill §How to talk to Brian.

## Workflow

1. **Build tasks load the orchestration skill first** (`.claude/skills/orchestration/SKILL.md`). It picks the lane (solo by default), and owns escalation, doc-edit gates, and the commit/push decision. Strategy questions skip it.
2. **Plan mode for genuinely large or ambiguous work**; ask with `AskUserQuestion` when behavior, placement or access is ambiguous and the docs don't settle it.
3. **Re-read a file immediately before editing it.**
4. **Verify with `scripts/verify.sh --port <slot port>`** (`--e2e` for anything user-facing). It is the gate — build, lint, lockfile parity, `check-*` scripts, dev-server ready. Don't run a bare `npm run build` against a live slot dev server.
5. **User-facing work gets a click-through and a look.** Run or write the covering `e2e/` spec; if it renders, screenshot it and iterate until nothing looks off. Brian is never the first eyes on a layout bug. Taste sign-off is his.
6. **Seed and self-test in Brian's Sandbox** (`6c68111b-0248-45ba-9ab1-169ee33f62c9`) and leave the fixtures. Procedure: testing skill.
7. **Commit on the current feature branch; the push follows the orchestration skill's push decision.** Never commit or push to `main` (hook-enforced).
8. **Migrations run directly via Supabase MCP**, never as files for Brian. Verify against the live DB afterward — read `pg_policy`, not `supabase/*.sql` or this file.
9. **End of task:** if your work made a fact in `REFERENCE.md` or a rule here stale, propose the exact edit. CLAUDE.md edits are ask-then-write, approved in THAT task.

## Session worktrees (#17)

Never do feature work or run a dev server in the shared `central` checkout (port 3000). Sessions run in the fixed slot pool — `central-s1/s2/s3` on ports 3001/3002/3003 — claimed with `./scripts/session.sh`. Slots start as a fresh copy of `origin/main`, and work propagates only by merging to main. Status: `session-status.sh`; release: `session-release.sh`. Full guide: `scripts/SESSIONS.md`.

## Critical Conventions

> Numbers are stable (code comments cite them) — never renumber. Full text + reasoning: `REFERENCE.md` Part A.

**Data & security**
- **#1 No `localStorage`/`sessionStorage`** — Supabase session only. *Enforced: ESLint.*
- **#2 Role checks go through `lib/roles.ts`** (`isAdminRole`, `isLeaderRole`, `isChatManageRole` (legacy, pastor excluded), `isStaffRole`, `isMemberTier`) — never inline role arrays. `lib/roles.ts` is the code encoding of `permissions.md`; change roles there only. Church-chat management and pins = `isLeaderRole` AND chat membership. Documented nonconformers only.
- **#3 Visitor parity** — `role === "member"` must be `isMemberTier(role)`; any list with `"member"` includes `"visitor"`.
- **#4 Optimistic updates** on conversational writes (messages, reactions, RSVPs) — not settings (see #21).
- **#5 DB writes** go through the browser Supabase client or server actions — no raw fetch.
- **#8 `ministry_id` on every write** (`.eq("ministry_id", …)`) — EXCEPT tables without the column: `event_tasks` (scope via `event_plan_id`), `messages` (scope via `group_id`). Verify the column exists; PostgREST fails the whole statement silently on a nonexistent column.
- **#9 RLS uses the SECURITY DEFINER helpers** (`auth_ministry_id()`, `auth_is_admin_or_leader()`, `is_group_member()`, `auth_can_plan_events()`, `event_plan_ministry_id()`) — never query `profiles` inside another table's policy. Every helper pins `search_path = public, pg_temp` (Part B §Multi-tenant model).
- **#10 RSVP is a toggle** — one row per (user, announcement).
- **#11 Middleware is `proxy.ts`** — never recreate `middleware.ts`.
- **#29 Calling:** every write through `app/actions/calls.ts` (service role; start gate is the `can_start_call` RPC — never `auth_can_start_call` from an action). Membership is the read boundary. Starting ≠ joining (church chats need leader tier to start). Native-shell gating keys on the binary's `CentralCalls/<n>` marker via `callingBlockedInShell()`, never `isNativeShell()`. Read Part A #29 before touching calls.

**App structure & state**
- **#6 Shell:** `app/home/home-app.tsx` orchestrates tabs and global state; each tab is its own file in `app/home/tabs/`; shared UI in `components/central/` (a LEAF — no `app/` imports, *ESLint-enforced*). Don't add tab logic back into `home-app.tsx`.
- **#12 Tabbed views sync to URL params** — lazy-init from `window.location.search`, write with ONE atomic `router.replace` (never sequential replaces — they race). Param map: `tasks/lessons.md` §URL State Persistence.
- **"use server" files export only async functions** — shared sync helpers live elsewhere.
- **#18 Read receipts:** chats < 30 members get live receipts; ≥ 30 get on-demand "Seen by N" and no receipts subscription. Threshold constant: `SMART_ROOM_THRESHOLD` (`lib/chat-notification.ts`).
- **#19 Nav sections derive from `components/central/nav-sections.ts`** — never hand-code tab→section couplings.
- **#21 Settings stage changes behind Save** (pending local state; Cancel reverts).
- **#23 Event time goes through `lib/tz.ts`**, rendered in the MINISTRY's zone (`useMinistryTimezone()` / `lib/ministry-timezone.ts`) — never `toLocale*` on a raw instant, never ISO slicing, never a hardcoded zone. All-day events use `start_day`/`end_day` (end INCLUSIVE). DATE columns (`due_date`, `week_date`, `entry_date`, …) stay plain `YYYY-MM-DD` strings — never through `Date` or a zone. Chat timestamps stay device-local.
- **#24 Lessons are inbox files** (`tasks/lessons/inbox/<YYYY-MM-DD>-<slug>.md`), never appended to `lessons.md`. Only `/lessons-gc` edits the canon.

**UI**
- **Tokens, not literals.** Consume `app/globals.css` tokens; generalize into a shared component so decisions propagate. *Enforced: `check-hex.sh`.*
- **#7 Chat bubble gestures:** < 400ms tap = emoji picker, ≥ 400ms = context menu, rightward drag ≥ 56px = reply. They share one press timer — the swipe must cancel the press explicitly.
- **#13 Shell-migrated tabs** put `md:flex md:flex-col md:h-full md:overflow-hidden` on the tab's OWN root div (match `DirectoryTab`).
- **#14 "Register your ministry" CTAs route to `/register-ministry`** — never `/signup?intent=register` or `/onboarding`.
- **#15 Desktop header-right = object config only** (gear/kebab). Every create is a plum primary in the collection's BODY header (`ContentHeader` + `ContentActionButton`), never the title row. Canonical: `StudentOrgTeamHome`.
- **#16 `PlanSubTabStrip` sits at the component root beside `TabPageHeader`**, never inside a padded wrapper; inside one, pass `flush`.
- **#20 Every dropdown/kebab uses `ActionMenu`.** Sole exception: the chat message menu in `message-row.tsx`.
- **#22 Mobile back = `BackChevron` OR left-edge swipe**, the same action. `SubpageShell` gets swipe for free; a standalone overlay wires `useEdgeSwipeBack(onClose)`. Never hand-roll swipe handling.
- **#25 Mobile chrome-row actions render through `<MobileChromeActions>`** — never a rail of your own under the chrome.
- **#26 Mobile subpages own ONE 20px gutter** — never wrap `SubpageShell` in padding or pad inside it. *Guarded: `e2e/mobile-subpage-gutter.mobile.spec.ts`.*
- **#27 One mobile chrome rhythm:** chrome rows use `POCKET_CHROME_PAD_Y`/`PAD_X` and title type `POCKET_CHROME_TITLE` (serif 22/600 ink, back-labels included) from `components/central/pocket.tsx` — never hand-typed. The title lands at y ∈ [12, 19]; body content starts at ≤ 92px. If a screen fails, fix the screen or the detector — **never widen the band.** *Enforced: `check-chrome-title.sh`, `e2e/mobile-chrome-rhythm.mobile.spec.ts`, `e2e/mobile-screen-sweep.mobile.spec.ts`.* Detector rules: Part A #27.
- **#28 Keyboard layout reads `--kb-inset` / `[data-kb-open]`** from `lib/keyboard-inset.ts` via `.kb-lift` / `.kb-safe-bottom` / `.kb-hide`, and JS via `subscribeKeyboard` (not a hook). Never `resize: "native"`, never a raw listener. Native config needs a new binary; the web bundle must work on every installed binary. *Guarded: `e2e/chat-keyboard-inset.mobile.spec.ts`.* Read Part A #28 before touching it.
- **Layout:** shell-escaping overlays (`fixed inset-0`) add their own top safe area via `POCKET_OVERLAY_PAD_TOP_CLS` / `POCKET_OVERLAY_INSET_CLS` — never a hardcoded floor. Pages never add bottom padding for the nav (`.shell-scroll` owns `--nav-clearance`). Z-index tiers: `REFERENCE.md` Part B §Z-Index.

## Skills to load

- **Any UI file** → `design-system` skill (routes to `contract-card.md` / the full doc section / `mobile_design_system.md`).
- **Every feature/fix** → `testing` skill.
- **Animation, hover, transitions** → `~/.claude/skills/emil-design-eng/SKILL.md`.
- **New components or a visual polish pass** → `~/.claude/skills/taste/taste-skill/SKILL.md`, with these Central overrides:
  - Emoji ban holds, and team icons are NOT emoji: render `PlanLineIcon` via `teamIconKey(team)`, never raw `teams.icon`. Emoji only for event-type badges and the chat picker.
  - Plum (`#3E1540`, `#2D0F2E`) is the accent: surgical, never a surface or fill. The anti-purple ban doesn't apply.
  - Bricolage Grotesque is the sole typeface.
  - Tailwind v4 — ignore v3 guards.
- On demand: `ui-ux-pro-max` (§1, §2, §3, §9; skip `search.py` and the react-native stack), `impeccable`, `taste/redesign-skill`, `taste/minimalist-skill`, `taste/soft-skill`.

## Lessons

`tasks/lessons.md` is the curated canon; `tasks/lessons/inbox/` holds entries not yet folded in. Before working in a subsystem, **grep both for it** (e.g. `rg -il "realtime" tasks/lessons*`) — don't read them end to end. Promote a lesson into a convention here only once it's general AND can't be a check.

## Core facts

- **Stack:** Next.js 16 (App Router), Supabase (Postgres + Realtime + RLS + Storage), Tailwind v4, shadcn/ui, TypeScript, Vercel. Supabase project `wgqpnilaokfipocsugqo`.
- **Tenancy:** every workspace is a `ministry`; tenant data carries `ministry_id`; RLS enforces isolation. New users without a ministry → `/ministries`. Ministry `pending` → `/pending`, `rejected` → `/landing`.
- **Roles:** `visitor`, `member`, `leader`, `admin`, `deacon`, `elder`, `pastor`. Admin-tier = admin/deacon/elder/pastor; leader-tier = leader + admin-tier; member-tier = member/visitor. Canonical: `permissions.md`.
- **Super account:** gated by UUID (`is_super()`, `SUPER_UUID`), never by role; write-as only in `is_sandbox` ministries.
- **Tabs** (`app/home/types.ts`): home, announcements, chats, plan, directory, give, profile, settings, forms, congregation, network.
- **Schema:** the live DB is the source of truth — query via Supabase MCP. Two grant traps: `ministries` and `group_members` use COLUMN grants, so a new column is unreadable or non-updatable until granted.
- **Everything else** — key-file index, routing, realtime channels, push taxonomy, storage policies, schema index, env vars, z-index, layout detail: `REFERENCE.md` Part B.
