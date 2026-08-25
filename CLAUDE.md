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
- `web_design_system.md` — desktop (≥768px) design contract: colors, typography, components, layout, the warm-minimalist direction. Design questions go here.
- `mobile_design_system.md` — phone-width (`md:hidden`, ≤430px) design contract: mobile shell, floating pill nav, tonal borderless cards, hub-and-spoke navigation. Governs all mobile surfaces.
- `permissions.md` — canonical role/access truth; who-can-do-what across every feature.
- `MINISTRY_CONTEXT.md` — real-world ministry workflows and vocabulary (what DG, DGL, CCSF, rotation, etc. actually mean).
- `PRD.md` — product vision, feature intent (the "why" behind features), and roadmap. NOT implementation detail — CLAUDE.md owns the "how."

---

# LAYER 2 — STANDING RULES / GUARDRAILS

> How to work. These apply across tasks. Front-loaded because following them matters more than anything below.

## How to talk to Brian — read this before every reply

**Brian is the CEO of this project, not its engineer.** He is making large decisions all day; his scarce resource is attention. Write like a person talking to a person — the main session should read as conversation, with zero machinery in it. Full guidance lives in `.claude/skills/orchestration/SKILL.md` §How to talk to Brian; it is repeated here because that skill only loads for BUILD tasks, and this rule governs every reply. Ratified 2026-08-17.

**This outranks any output format a command or skill asks for.** A slash command's report template, a skill's handoff shape, a checklist's "report X" step — those tell you what to FIGURE OUT, never how to say it. When `/catchup` says report the HEAD commit and the port, the answer is still "you're on the latest main and the app's running." Structure is internal scaffolding; the reply is conversation. This is exactly how the rule failed the day it was written (2026-08-17): `/catchup` and `/nextstep` both mandated machinery, and both won.

The short version:
- **Lead with a recommendation, decisively.** He has authority to override and will use it — that is why decisiveness helps him, not a reason to hedge. Guidance and judgment are what he wants from you; a survey of options is not.
- **Never narrate machinery.** Dev servers, ports, builds, `.next`, iCloud, simulator/Capacitor mechanics, e2e flakes, auth/DB outages, file paths, commands, schema columns, other projects or sessions. Handle it. If it changed a real outcome, one sentence — never a diagnosis.
- **Never write an "open items" or "needs follow-up" list.** Something either needs his decision (ask it as a question) or it doesn't (do it, or file it in `tasks/lessons/inbox/`). A note he can't act on is noise.
- **Unfinished work is one plain sentence:** "It's built, but Supabase was flaking so I couldn't fully test it." Never claim verification you don't have — but say it the way a person would.
- **Detail is pull, not push.** Depth belongs in the commit message, the lesson file and the PR body. He'll ask if he wants it.
- **What a finished task sounds like.** Not "19 files removed, 2,155 deletions, commit `0fe5800`, no dangling refs" — that's a changelog read aloud. It's: "Cleared out the stale planning docs. One turned out to still be live work, so I put it back." A number, a hash, a filename or a count is machinery unless he has to act on it.

This governs CONVERSATION. Subagent prompts, commit messages, lesson files and PR bodies stay precise and structured.

## Workflow

### Build-task orchestration — load this first
0. **Load the orchestration skill before dispatching.** For ANY build, fix, design, or implementation task, load `.claude/skills/orchestration/SKILL.md` as the FIRST move, before any subagent dispatch or code edit. It is the conductor: it governs prompt expansion, the request-challenge step, when to spawn the explorer/reconciler, the build loop, the per-doc escalation rules, the `/designchange` flag, and the multiple-choice escalation format. Pure strategic/direction questions are NOT build tasks — they skip the loop and go to the upstream thinking layer, not this skill.

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
9. **Seed + self-test in Brian's Sandbox** — verify every feature in the private prod sandbox ministry "Brian's Sandbox" (`6c68111b-0248-45ba-9ab1-169ee33f62c9`, `is_sandbox=true`): seed real fixtures via Supabase MCP, exercise it end-to-end, leave the fixtures in place, and hand back a **"How to test it yourself"** section (exact seeded rows + IDs + click path). Details in the testing skill and memory `project-personal-sandbox`.

## Capture & self-maintenance — keep this file current (propose, never silently edit)
This file must stay true to the codebase. You help maintain it, but the user approves every change — never edit CLAUDE.md without explicit approval in that task.

At the END of every task, run this check and proactively raise anything it surfaces:

1. **New knowledge to capture.** Did you learn something from a mistake, hit a non-obvious constraint, or get taught a multi-step workflow? Propose: (a) what was learned, (b) which layer it belongs in (Layer 1 fact / Layer 2 rule / Layer 3 lesson / Layer 4 skill), (c) the exact text to add. Complex repeatable workflow → propose a skill. A lesson that's proven general and stable → propose promoting it from lessons.md into a Layer 2 rule.

2. **Facts your own work just made stale.** Did this task add/rename/move a file, add a route, add or change a DB table/column, add a realtime channel, change a convention, or alter the shell/architecture? If so, the relevant Layer 1 entry (Key Files, Architecture, Schema index, Realtime, Routing, etc.) is now out of date. Propose the specific correction. Do NOT let Layer 1 drift behind the code you just wrote.

3. **Drift you noticed in passing.** If at any point during the task you saw CLAUDE.md contradict the actual code (a wrong path, an outdated rule, a renamed thing), flag it — even if it wasn't what you were working on. Don't silently work around a stale doc; surface it so it can be fixed.

For each item: state it plainly, propose the exact edit, and wait for approval. The user decides what gets written. Keep proposals short — a one-line "FYI, this is now stale: …" is better than skipping it. Err toward surfacing; an ignored proposal costs nothing, an un-surfaced staleness costs a future audit.

## Critical Conventions
1. **Never use `localStorage` or `sessionStorage`** — Supabase session only.
2. **Role checks — use `lib/roles.ts`, never inline arrays:** all role gating goes through the canonical predicates — `isAdminRole` (admin-tier: settings, ministry config, giving editor), `isLeaderRole` (leader+admin: announcement create/edit), `isChatManageRole` (**legacy** set: my/DM-chat moderation + cosmetic role pills; **pastor excluded** — note **church-chat management + pins now use `isLeaderRole` (incl. pastor) AND chat membership** — `is_group_member` in RLS / a `members`/`roster` lookup in app code, see `permissions.md`), `isStaffRole` (pastor/deacon/elder: staff invite code, founder role), `isMemberTier` (member+visitor). `lib/roles.ts` is the single code encoding of `permissions.md` (the canonical source of truth) — change roles THERE only. Writing a new inline role array is a violation unless the gate is a genuine nonconformer (document why at the site). Legit nonconformers today: the home-tab honorific subset, group-algorithm visitor heuristics, super-constants' full role enum, and UI role-picker enums.
3. **Visitor parity:** any check like `role === "member"` must be `isMemberTier(role)` (member + visitor). Any bespoke list that includes `"member"` must include `"visitor"`.
4. **Optimistic updates** on all user-facing writes (messages, reactions, RSVPs).
5. **All DB writes** go through the browser Supabase client or server actions — no raw fetch.
6. **App shell structure:** `app/home/home-app.tsx` is the tab orchestrator (~713 lines) — it owns global state (`activeTab`, `globalOpenChat`, `totalChatsUnread`, `chatRefreshKey`, `recentChats`, `userTeams`, etc.) and renders the active tab. Each tab is its own file in `app/home/tabs/`. Shared UI components live in `components/central/`. When building new UI inside a tab, add it to that tab's file or extract a component into `components/central/` — do not add tab-level logic back into `home-app.tsx`.
7. **Tap vs long-press vs swipe in ChatScreen:** on a message bubble, < 400ms = emoji picker, ≥ 400ms = context menu (Reply lives there), and a rightward drag ≥ 56px = reply (`useSwipeToReply`) — never break this. The swipe is the same direction on your own bubble as on anyone else's. The three share one press timer, so the swipe hook fires `onLock` the instant it commits to a horizontal drag and the row wires that to `onPointerCancel`; without it a slow swipe opens the context menu mid-drag. `onPointerLeave`/`onPointerCancel` do **not** reliably fire for a touch dragging *within* the element, which is why the cancel has to be explicit.
8. **ministry_id on all writes:** every INSERT/UPDATE must include `.eq("ministry_id", ministryId)` — defense-in-depth on top of RLS. Exceptions where the column does not exist: `event_tasks` (scope by the ministry-filtered `event_plan_id` — the same path `notification_ledger`'s RLS uses) and **`messages`** (scope by `group_id`). Verify the column exists before assuming; do not invent one — PostgREST rejects the WHOLE statement when a payload names a column that isn't there, so an unchecked insert fails 100% of the time and says nothing (the call-summary line, 2026-08-25: `tasks/lessons/inbox/2026-08-25-messages-has-no-ministry-id.md`).
9. **SECURITY DEFINER helpers:** use `auth_ministry_id()` and `auth_is_admin_or_leader()` in RLS policies — never query `profiles` directly inside other table policies.
10. **RSVP is a toggle:** one row per (user, announcement). Insert on first click, delete on second. Never allow duplicate RSVPs.
11. **Middleware is `proxy.ts`:** never recreate `middleware.ts` — it was intentionally deleted.
12. **URL state for tabs:** Every tabbed view must sync active tab to URL query params. Implement at the same time as building tabs — never skip this. Lazy-init state from `new URLSearchParams(window.location.search).get("key")` and write via `router.replace`. One atomic replace only (see Workflow item 5 above). See `tasks/lessons.md` §URL State Persistence for the full param map and patterns.
15. **Header-right CTAs — object-config only:** The top/object header (`TabPageHeader` right slot) carries only object-level actions — the Settings **gear** (collapse to a kebab at 3+). **Create / add / generate buttons never go there.** Every create is a plum primary in the **body** content header of the collection it fills — use `ContentHeader` (or `SectionHeader`) + `ContentActionButton` (primary), per web_design_system.md §3.2 Zone C. On a multi-section workspace the top shows the workspace name + gear, and each section’s create lives in that section’s own body header; the parent still owns the trigger (the `generateTrigger` / `startNewTrigger` / `newSemesterTrigger` counter pattern) but wires it to the body header’s action, not the page header. Canonical example: the six sections in `StudentOrgTeamHome`. (The single-feed exception is RETIRED — R1/R2, ratified 2026-07-09: the create never sits in the title row, even when the page title directly heads its one collection (Announcements, Congregation) — it lives in that collection's body content header; view toggles/list helpers sit ghost to its LEFT.) The `HeaderActionButton` primitive no longer exists in code — header-hosted creates are retired everywhere.
14. **"Register your ministry" CTAs must route to `/register-ministry`:** Never point these directly to `/signup?intent=register` or `/onboarding` — the middleware bounces logged-in users off `/signup` to `/home`, silently breaking the flow. `/register-ministry` is the canonical entry point that handles routing by auth state and role. Any new "Register" CTA anywhere in the codebase must point here.
13. **Shell migration — pattern must be on the tab component's own root div:** When migrating a tab onto the shell mount pattern, `md:flex md:flex-col md:h-full md:overflow-hidden` must be on the **tab component's own root div**, not only the wrapper in `home-app.tsx`. Without it, `md:flex-1` on the desktop section has no flex parent to resolve against — the root div grows to full content height and gets clipped by the wrapper's `overflow: hidden` instead of scrolling. Match `DirectoryTab`'s root div structure exactly: `<div className="pb-2 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">`. Tabs migrated: Directory, Planning, Chat.
16. **`PlanSubTabStrip` placement — always outside the padded content wrapper:** The strip manages its own horizontal inset via an internal `md:pl-14` label row and `md:mx-14` hairline. It must always be placed as a sibling to `TabPageHeader` at the component root — never inside a `px-5 md:px-14` content div. Placing it inside stacks the paddings → 112px left offset on desktop instead of 56px. Desktop instance: `<div className="hidden md:block"><PlanSubTabStrip .../></div>` outside the content wrapper. Mobile instance (if needed): `<div className="md:hidden">` inside the content wrapper is fine — mobile has no `md:pl-14` applied by the strip. When the strip must instead live **inside** a padded content wrapper (a unified section body that holds the header + content), pass `flush` to drop its internal `md:pl-14`/`md:mx-14` so it aligns to the wrapper’s edge rather than double-insetting to 112px; root-level placement stays the default and `flush` is the in-wrapper escape hatch (used by the Resources sub-strip in `StudentOrgTeamHome`).
17. **Session worktrees — one slot per session:** Every session runs in its own reusable git worktree on its own dev port —
never do feature work or run the dev server in the shared `central` (main) checkout. Slots are a FIXED pool defined in
`.claude/session-slots.json` and REUSED across sessions (never create ad-hoc worktrees):

   | Slot | Dir | Port |
   |---|---|---|
   | main | `central` | 3000 (shared — no feature work) |
   | s1 | `central-s1` | 3001 |
   | s2 | `central-s2` | 3002 |
   | s3 | `central-s3` | 3003 |

   Start a session with `./scripts/session.sh` — it claims a free slot, resets it to a fresh **copy of `origin/main`**
(detached; `feat/<slug>` when a task is named; `--base <ref>` to start from another branch), boots the dev server on the
slot's port, and launches Claude in the slot. A session thus always LANDS as latest integrated `main`; **work propagates
only by merging to `main`** (a fresh session won't see another session's unmerged branch). Inspect with
`./scripts/session-status.sh` (`BUSY`=locked / `held`=unmerged work / `free`); free with `./scripts/session-release.sh`. The
launcher refuses to reclaim a slot holding uncommitted or unmerged work (`--force` overrides). The `SessionStart` hook
announces your slot+port (or warns if you're in the shared checkout); `SessionEnd` frees the slot. Ports are bound to the
directory, not the session. `./scripts/session-grid.sh` (alias `cgrid`) opens a tiled tmux grid over the pool — a control
pane in the shared checkout plus one pane per slot; free slots are claimed via `session.sh`, busy/held slots open a shell
only, never claimed. Full guide: `scripts/SESSIONS.md`.

18. **Read receipts scale by a member-count threshold:** chats with `memberCount < 30` keep live per-member read receipts (reader avatars under each own message); chats with `memberCount >= 30` instead show an on-demand aggregated "Seen by N" affordance (tap to expand the reader list) and do **not** open the `read-receipts-{groupId}` `group_members`-UPDATE subscription — this escapes the O(members²) read-receipt fan-out at scale. The switch lives in `ChatScreen` (`isLargeRoom = memberCount >= 30`), where `memberCount` comes from the single cached roster SWR keyed `["chat-roster", groupId]` (also the source for @mentions and small-room read state — the three duplicate roster joins were collapsed into it).

19. **Nav sections — one source (R7, 2026-07-09):** tab→section membership (the context-panel SECTION label, rail highlight, and bottom-nav highlight) derives from `components/central/nav-sections.ts` (`NAV_SECTIONS` + `sectionForTab()`) — never hand-code `activeTab === "x"` section couplings. Settings is labeled "Church Settings" everywhere (crumb included); Congregation is a Home-section item (pastor-gated).

20. **Action menus — always `ActionMenu`, never hand-rolled:** every dropdown/kebab/context action menu must use the shared `ActionMenu` (`components/central/action-menu.tsx`) — it portals to `document.body`, flips above the trigger when there's no room below, and clamps horizontally, so it can never clip at the viewport bottom or inside an `overflow-hidden` ancestor. Never position a menu `absolute`/`fixed` below a trigger without collision handling (this bug recurred 3×). Sole exception: the chat message context menu in `message-row.tsx` (its own frozen flip logic).

21. **Settings surfaces stage changes behind Save:** on any settings surface (ministry/chat/team settings, moderation, automations), control changes update PENDING local state only; the DB write happens on explicit Save, with Cancel reverting. Optimistic updates (Convention #4) apply to conversational writes, not settings commits. Pattern: settings-tab's `pending*Settings`.

22. **Mobile back = chevron OR left-edge swipe:** on phone-width push surfaces the chrome chevron (the shared `BackChevron` — a muted-ink `ChevronLeft`, NOT plum; `components/central/back-chevron.tsx`) and a left-edge swipe are the SAME one-level-up action (`mobile_design_system.md` §0.3 — the swipe is an ALTERNATE input, never a new visible affordance). A new full-bleed push surface built on `SubpageShell` inherits edge-swipe-back for FREE — it fires the nearest parent crumb's `onClick`, no extra wiring. A standalone full-screen overlay that is NOT a `SubpageShell` (e.g. `ChatScreen`) must wire `useEdgeSwipeBack(onClose)` (`components/central/use-edge-swipe-back.ts`) to its inner panel so gesture and chevron stay in lockstep. Never hand-roll touch/swipe handling for back-nav — always the shared hook (it is coarse-pointer gated, edge-anchored, and guards horizontal scrollers so carousels/chip-rails can't be hijacked, per Convention #7).

23. **Event times go through `lib/tz.ts` — never `toLocale*` on a raw instant, never ISO slicing:** `calendar_events.start_date`/`end_date` are `timestamptz` holding **true instants**. EVERY read and write routes through `lib/tz.ts` (dependency-free, isomorphic, DST-correct — it probes the offset per instant rather than assuming one). Render in the **MINISTRY's** zone (`ministries.timezone`, IANA) — client via `useMinistryTimezone()` (`app/home/ministry-timezone-context.tsx`), server via `lib/ministry-timezone.ts` — never the browser's, never a hardcoded zone. This is not stylistic: two producers once wrote opposite conventions into that one column (a wall clock mislabeled UTC vs a true instant) and the rows were **byte-identical**, so no query could separate them and the whole sandbox had to be re-seeded. One layer is what prevents a second convention appearing.
    - **All-day events are DATES, not instants.** `start_day`/`end_day` are the truth (`end_day` **INCLUSIVE**); the timestamptz pair is derived for sorting/ICS only.
    - **DATE columns are tz-immune — do NOT convert them through a zone.** `event_tasks.due_date`, `worship_weeks.week_date`, `dgl_*.week_date`, `meeting_notes.date`, `receipts.purchase_date`, `budget_entries.entry_date`, `event_plans.plan_start_date`/`crunch_date` hold a calendar day with no instant. Keep them plain `YYYY-MM-DD` strings. The bug is code round-tripping them through a `Date` (`new Date(ymd)` renders the PREVIOUS day west of UTC; `new Date().toISOString()` yields TOMORROW east of ~8pm local). Converting them through a zone creates the same bug in the opposite direction.
    - **Scheduling is per-ministry too** — no hardcoded zone in cron, push dispatch, templates, or rollover. `run_sheet_tick()` loops ministries in their own local window (`supabase/run_sheet_tick_per_ministry_timezone.sql`).
    - **Exception:** chat message timestamps (`formatMessageTime`) stay device-local by design — that is correct for messaging and is not event time.

24. **Lessons are written as inbox files, never appended to `lessons.md`:** a new lesson goes to `tasks/lessons/inbox/<YYYY-MM-DD>-<kebab-slug>.md`, one lesson per file. Appending to `tasks/lessons.md` conflicts with every other parallel session at EOF — guaranteed, not occasional, because the slot model runs sessions concurrently. Only `/lessons-gc` edits `lessons.md`, folding the inbox in as an approved batch.

25. **Mobile chrome-row actions go through `MobileChromeActions` — never a hand-rolled rail:** `mobile_design_system.md` §3 puts a phone-width screen's create (and up to one sibling action) in the chrome row itself — the carve-out from desktop Convention #15. Render `<MobileChromeActions>` (`components/central/mobile-chrome-slot.tsx`) and the buttons land in that row from anywhere in the subpage body; a rail of your own under the chrome reads as a stray floating row AND pushes the content down by the button height. (`SubpageChromeActions` is a DEPRECATED alias re-exported from `subpage-shell.tsx` — existing imports work, new code uses `MobileChromeActions`.) The slot is a module-level registry, not a per-shell context, so it serves EVERY chrome — `SubpageShell`, `PocketChrome`, `PocketHubChrome` — and a screen that isn't a `SubpageShell` can still host actions. A component mounted at BOTH widths renders twice, so the portal is gated on an `offsetParent` visibility marker; without it the desktop copy portals too and you ship two controls into one row (this shipped once — the Allocation year picker doubled and crushed the title to "Al…"). It is a portal slot rather than a prop because the controls sit deep in the body (the event Roles pane is ~7 levels down) and close over live state — a prop means threading a `ReactNode` through every intermediate, and an effect-based hoist means a dep array that silently goes stale. Desktop actions are unaffected: they use `titleAction` (Zone B object-scope, §3.1).

26. **Mobile subpages own exactly ONE 20px gutter:** never wrap a `SubpageShell` in a padded container, and never add horizontal padding inside one. A subpage is FULL-BLEED (`mobile_design_system.md` §3) — its own 20px screen padding is the only horizontal inset, so a drilled-in screen sits at the SAME gutter as the tab root it was opened from. This was convention-only and it failed: the Plan tab's `md:hidden px-5 pb-28` body wrapper stacked with the shell's own `px-5`, rendering the whole event workspace (hub + every spoke, chrome row included) at 40px while the events list beside it sat at 20. The shell now self-corrects — `useDeBleed` (`components/central/subpage-shell.tsx`) measures the SYMMETRIC horizontal padding its ancestors impose and cancels exactly that much, so it lands at 20px from any mount point; correctly mounted, the correction is 0. `e2e/mobile-subpage-gutter.mobile.spec.ts` guards the contract. **If a gutter looks wrong, fix the mount or the shell — never the number.** Desktop is unaffected (the hook returns 0 at ≥768px; desktop inset stays `md:px-14`).

27. **One mobile chrome rhythm — every phone-width screen opens its title at the same height:** the chrome-row box is `POCKET_CHROME_PAD_Y` (12px above the title, 10px below) + `POCKET_CHROME_PAD_X` (20px), exported from `components/central/pocket.tsx`. **Never hand-type a chrome padding and never let a host wrapper supply the top gap** — the row owns it. All four chrome components consume the constant: `PocketChrome`, `PocketHeader`, `PocketHubChrome`, and `SubpageShell`'s mobile row. `PAD_X` is a SEPARATE export because a chrome row nested inside an already-inset wrapper (`PocketHubChrome`, `PocketHeader`) must not re-apply the gutter (Convention #26) — those take `PAD_Y` only. This was four copies that drifted (Home 14, workspace hub 24 via its wrapper, Directory `pt-14`=56), so drilling between screens bounced the title; ratified at the SubpageShell value 2026-08-05. `e2e/mobile-chrome-rhythm.mobile.spec.ts` walks every tab root + the drilled plan screens and asserts the title lands in [12, 19] — that band is vertical CENTERING slack inside a 34px chevron / round-action row (and the chat header's 34px counterpart avatar), not padding budget. **If a header sits too low, fix it to use the constant — never widen the band.** The 34px is load-bearing: the chat header centred against a 40px avatar and its title landed at y=20, one past the band, for as long as the screen has existed (avatar → 34 on mobile, 2026-08-09).
    - **The rhythm has a SECOND half: where the body starts.** A title can sit at a perfect 12px while the content floats 90px below it. `e2e/mobile-screen-sweep.mobile.spec.ts` asserts the first painted thing under the chrome row lands at **≤ 92px** (chrome is 12 + 34 + 10 ≈ 56, plus a kicker or card edge). The two ways it breaks: a control opened a row of its OWN under the header (fix: `MobileChromeActions`, Convention #25), or a wrapper supplied a top margin the chrome already owns (fix: delete it — Church Settings shipped nine hand-typed `marginTop: 40`, a DESKTOP number sized to clear a tab strip phone width doesn't have, putting all 8 sections at 96). **Never raise the ceiling to make a screen pass.**
    - **ONE chrome title TYPE, two grammars.** The type is `POCKET_CHROME_TITLE` (serif 22/600 `--ink`, `components/central/pocket.tsx`) and EVERY chrome row spreads it — back-labels included. Pinning only the rhythm is what let five chromes drift while every assertion passed: tab roots at 22, the Announcements row and `SubpageShell` at 20, `PocketHubChrome` silently dropping 22→20 whenever it carried an action, and the `SubpageShell` back-label at **15 in plum** offset 2px left (ratified 22/600 ink, 2026-08-09). The two GRAMMARS survive — a screen that HEADLINES ITSELF in the body (the announcement article's date-kicker + large headline, the member sheet's avatar + name identity card, receipt/meeting-note details) carries `← Parent`, where the chrome names the SECTION and the body names the PAGE. Deriving a chrome title from the terminal crumb was tried and reverted: it renders the same words twice, stacked. **A back-label is that screen's header, not a lesser thing** — same size, same colour, same x as a tab root's title. Enforced twice, because position-only enforcement is exactly what failed: `scripts/check-chrome-title.sh` (BLOCKING in `verify.sh`) fails any file that builds a chrome row — the structural signal is importing `POCKET_CHROME_PAD_Y` — without consuming the title constant, and the sweep measures the real row's font-size + colour on every screen it discovers. (Grepping for "serif + fontSize 22" instead was tried and is useless: it flags body headlines, modal titles and stat values, none of them chrome.) Consequence for tooling — **measure the chrome ROW, not "the largest text near the top"**: font-size sniffing skips a back-label row entirely and latches onto whatever is big further down (the member sheet's avatar initials), inventing a 90px title on a screen that is fine. Anchor on `.back-chevron` (Convention #22) and measure content from the row's bottom.
    - **The sweep DISCOVERS screens; it is not a list.** `PocketRow` carries `data-pocket-row` and the walk recurses through every row, backing out via `.back-chevron` (Convention #22) — so a new hub-and-spoke screen is covered the day it ships, and no one has to remember to add it. A hand-listed spec cannot fail for a screen it never loads, which is how "enforced everywhere" was claimed three times while ~10 screens were actually checked. Two corollaries the spec enforces on itself: it collects ALL violations and asserts once at the end (dying on screen 3 hides screens 4–44), and an unreached screen prints **SKIPPED** — a silent skip and a pass look identical. Detector rules: read only a STABLE measurement (two identical consecutive reads; Home's row is 24px until the avatar sizes it), and wait for a hub's rows before walking them (an unpainted hub silently drops its whole subtree). When a screen measures wrong, **measure it directly before touching the UI** — fix the detector, never the threshold. Two traps that made the sweep lie (2026-08-09): it measured the flex WRAPPER span, which inherits 16px, instead of the leaf title — reporting eight healthy screens as violations; and it measured the chat AVATAR's initials as a title (leaf text, 13px, in the chrome row) — which is why the chat header's real 20px offset went unseen for months. Require a LEAF node, and skip `[data-monogram]` (MonogramChip carries it for exactly this) rather than guessing from size.

28. **Keyboard-aware layout goes through `--kb-inset` / `[data-kb-open]` — never a raw listener:** a surface that must make room for the software keyboard reads the two values published by `lib/keyboard-inset.ts` (started once from the root layout via `components/keyboard-inset-bridge.tsx`). `--kb-inset` is how much of the layout viewport the keyboard occludes. In the Capacitor shell the module CLAIMS the layout at startup — `setResizeMode({mode:"none"})`, then `getResizeMode()` to **confirm the claim took** — and takes the height from `keyboardWillShow`; on the web it is measured from `visualViewport`. **Never `resize: "native"`, and never trust the claim without confirming it**: the plugin defers its own WebView resize by (animation duration + 200ms) via `performSelector:afterDelay:` (`Keyboard.m`, `onKeyboardWillShow`), so the composer sits behind the keyboard for ~450ms and no web-side work can reach a viewport that arrives late. The claim is what lets an ALREADY-INSTALLED binary that shipped `resize: "native"` hand the layout over and become instant with no new build — the binary, not `capacitor.config.ts`, is the authority on what it does. If the claim is refused, contribute ZERO and accept the delay; correct beats fast. `[data-kb-open]` is whether a keyboard is showing in EITHER container, and is what collapses `env(safe-area-inset-bottom)` (the home indicator is behind the keys) and hides floating chrome; `[data-kb-native]` marks the shell, where the inset arrives as ONE jump so `.kb-lift` animates itself (on the web it streams in already-animated, and a transition would chase a moving target). Consume via the CSS classes `.kb-lift`, `.kb-safe-bottom` (collapsing bottom pad), `.kb-hide` — all unlayered in `globals.css` so they beat Tailwind utilities, and all reset at ≥768px. **`.kb-lift` is `padding-bottom`, not `bottom`** — same composer position, but the surface keeps covering the screen so its cream paints behind the keyboard's transparent rounded corners instead of exposing black. React to the keyboard in JS via `subscribeKeyboard`, never a hook: the web path emits several times per keyboard slide, and re-rendering a large component on each is a self-inflicted stutter. Native config (`resize`, accessory bar) needs `npx cap sync ios` + a new binary — it does NOT ship on a web deploy. A web deploy DOES reach every installed binary at once, so the bundle must be correct in all of them: assuming the newest one put the composer a full keyboard-height too high on every not-yet-updated install. The runtime claim plus the confirm is what makes the bundle version-agnostic. Guarded by `e2e/chat-keyboard-inset.mobile.spec.ts`.

29. **Calling — one call at a time, membership is the boundary, starting ≠ joining:** voice/video calls run on a LiveKit SFU (`lib/livekit.ts`, server-only token minting), never peer-to-peer — group video and screen share make every peer upload to every other peer, which collapses past ~4 people, so the SFU is what keeps phases 2/3 from being a rewrite. Rules that must not drift:
    - **Every write goes through `app/actions/calls.ts`** on the service-role client. `calls`/`call_participants` are SELECT-only for `authenticated` (the `chat_nicknames` pattern). Because service_role bypasses RLS the start gate CANNOT live in a policy — it lives in `can_start_call(group, user)`, which the action asks the DB by RPC. `auth_can_start_call()` is the JWT wrapper and returns **false on a service-role connection** (`auth.uid()` is NULL); never call that one from a server action.
    - **Starting is asymmetric with joining.** Any member may start a call in a `dm`/`my` chat; a `church` chat additionally requires leader tier — a church chat is often the whole ministry, so a member starting one is a broadcast, not a call. JOINING only ever needs membership. Encoded three times on purpose (`chatCapabilities().canStartCall` for rendering, the action because the UI is not trusted, SQL so a future client write path cannot bypass the action) — change all three together.
    - **Membership — not `profiles.ministry_id` — is the read boundary**, mirroring the `messages` SELECT policy. Central has live members of chats outside their own ministry; a ministry clause lets them hear the ring and then fail to join. Tenant integrity comes from COMPOSITE FKs (`call_participants(call_id, group_id, ministry_id)` → `calls`), not from trusting the action to stamp the right column.
    - **Ringing rides the EXISTING `chat:{group_id}` topic** — `calls` fires the same generic `broadcast_chat_change()` trigger as `messages`/`message_reactions`, so no new channel and no new realtime RLS surface. A broadcast is **never replayed**, so `CallProvider` also runs ONE catch-up query on subscribe; without it, opening Central mid-ring is silent.
    - **At most one live call per chat** (`calls_one_live_per_group`, partial unique on `status <> 'ended'`). A concurrent start collides with `23505` and the action joins the existing call instead — which is what both people wanted. The LiveKit webhook (`app/api/livekit/webhook/route.ts`) is what closes a call out when a client dies; without it one stuck row blocks calling in that chat forever.
    - The provider lives at the **shell root**, never in `ChatScreen` — a call has to survive leaving the conversation it started in. The ~200KB SDK is dynamically imported when a call starts.
    - **VIDEO: the surface follows the PICTURE, not `calls.kind`.** `CallOverlay` switches to the stage the moment ANY peer has a video track, so turning your camera on during an audio call moves everyone to video without hanging up and ringing back. Gating on the declared kind instead publishes a track to the whole room and shows the person who pressed it nothing.
    - **Video tracks go through React; audio does NOT.** A `<video>` has to live in the layout, so tiles attach it in an effect keyed on the track. An `<audio>` element's lifetime is the TRACK's, not a component's — it is hand-attached into a detached hidden host so no re-render can detach one mid-sentence. Do not "tidy" these into one path.
    - **The SDK module is captured once** (`let LK` in `call-context.tsx`) on first connect: `readPeers` needs `Track.Source` where it cannot await an import, and a second `import("livekit-client")` would be a second module instance whose enum identities do not match.
    - **Camera flip republishes with the opposite `facingMode`**, never a device-id switch: on a phone the useful axis is which way it points, and `enumerateDevices` labels are empty until a permission has already been granted. A single-camera device restores the original rather than ending with no picture.
    - The stage is the ONE non-cream surface in Central (`--ink`). That is physical, not stylistic — video is somebody else's light and cream around it casts a colour on their face. Controls on it are `color-mix` over tokens, never `rgba`.
    - **SCREEN SHARE is desktop-web only, by FEATURE DETECTION — never a breakpoint.** `getDisplayMedia` does not exist on iOS Safari or Android Chrome, so the control is gated on `typeof navigator.mediaDevices?.getDisplayMedia === "function"`. It looks like a missing `md:` and it is not: a share button on a phone is a button that cannot work, and detection means the day a mobile browser ships the API it simply starts appearing. Phones can WATCH a share fine. The token grants `SCREEN_SHARE` + `SCREEN_SHARE_AUDIO` for EVERY call kind (sharing during a voice call is normal, and a shared clip should not be silent) — the grant is not the gate.
    - **A shared screen outranks whoever is talking** and takes the whole stage, faces demoted to a filmstrip. It renders `object-fit: contain`, NEVER `cover` — a face may be cropped to fill its tile, somebody's slides may not; cropping cuts off the thing they are pointing at.
    - **The sharer does not get their own screen played back** — if what they shared is the window holding the call, a self-view is an infinite corridor of itself. They get a plain "You're sharing your screen" panel; they can already see their screen by looking at it.
    - **Share state is read back off the room**, not tracked optimistically: the browser's own "Stop sharing" bar is the control most people actually press, so `LocalTrackUnpublished` re-reads `isScreenShareEnabled` rather than trusting our button.
    - **A native-dependent feature gates on the BINARY's capability marker, never on `isNativeShell()`.** `callingBlockedInShell()` (`lib/native-auth.ts`) asks whether THIS shell's build carries the microphone/camera usage strings, by looking for the `CentralCalls/<n>` token the binary appends to its own user agent (`capacitor.config.ts`). The reason is Convention #28's asymmetry, and it is expensive to relearn: **one web deploy reaches every installed binary at once, while an Info.plist reaches only builds made after it.** Turning calling on for "native" turns it on for every phone still running the previous version — which has no usage string, and which iOS TERMINATES for asking. Old shells lack the marker and stay blocked forever with no follow-up deploy; browsers are never blocked. **Bump the number** when a future call feature needs native support the current binary lacks — that is the whole mechanism, and it is why the check must not be "simplified" back to `isNativeShell()`.
    - **Ship order is fixed:** the web bundle that UNDERSTANDS a marker must be live BEFORE the binary that carries it reaches users, or the new build arrives still blocked by the old bundle. Merging the web half early is safe — phones on the old binary lack the marker either way. Marker introduced with iOS 1.1.0 (build 9), the first build carrying mic + camera + `UIBackgroundModes: audio`.
    - **Gate the CAPABILITY, not the control.** Hiding the call button is not enough: a ring arrives over realtime whatever the UI renders, and answering one calls `getUserMedia`. The gate lives in `CallProvider` as well as the chat header.
    - Calling **hides itself entirely** when LiveKit is unconfigured (`livekitConfigured()` → `callingAvailable()`), so a missing key reads as "this build has no calling", never a button that fails on press.

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

1. **Load `skills/design-system/SKILL.md`** — mandatory before touching any UI file. It routes to the cheapest sufficient doc: `contract-card.md` (~5KB, the tokens + hard rules — enough for edits to existing desktop surfaces), the full `web_design_system.md` only for the §sections its routing table names (net-new components, specific component families), and `mobile_design_system.md` for `md:hidden`/phone-width surfaces.

Before starting any feature, fix, or change:

2. **Load `skills/testing/SKILL.md`** — mandatory on every task, not just when asked.

Before writing any animation, micro-interaction, hover state, or transition:

3. **Load `~/.claude/skills/emil-design-eng/SKILL.md`** — animation decision framework, easing curves, press states, popover origins, performance guardrails. Answers "should this animate?", "what easing?", "how fast?".

Before designing new UI components or doing any visual review/polish pass:

4. **Load `~/.claude/skills/taste/taste-skill/SKILL.md`** — bias-correction rules for layout, typography, interactive states, materiality, and empty states. See project overrides below before applying.

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
| `taste-skill` / `ui-ux-pro-max` ban emojis entirely | Ban holds — **team icons are NOT emoji.** A team's icon is the `PlanLineIcon` stroked glyph via `teamIconKey(team)` (`app/home/workspace-presets.ts`); never render the raw `teams.icon` value (legacy emoji / stray strings). See web_design_system.md §Iconography. Emoji remain only for **event-type badges** (`evCfg.icon`, e.g. 📅) and the chat emoji picker — not for team/workspace iconography. |
| `taste-skill` "Lila Ban" — no purple/AI aesthetics | Plum (`#3E1540`, `#2D0F2E`) is Central's accent, used surgically per web_design_system.md §0/§1.1 — NOT a surface, background, or brand fill. The blanket anti-purple ban doesn't apply, but plum is scarce by design, not a default. |
| `taste-skill` recommends Geist/Satoshi fonts | Central uses **Bricolage Grotesque** as the sole typeface — do not swap |
| `taste-skill` Tailwind v3 guards | Central runs **Tailwind v4** — ignore v3-specific warnings |

---

# LAYER 3 — LESSONS

> Things learned the hard way. The lessons themselves live in `tasks/lessons.md` (the curated canon) and `tasks/lessons/inbox/` (not yet folded in) — this is the pointer and the boundary definition.

`tasks/lessons.md` holds specifics discovered from a mistake or a non-obvious surprise: things a fresh Claude would plausibly get wrong again. Examples currently captured there include URL state persistence patterns (§URL State Persistence). **Read it AND `tasks/lessons/inbox/` at session start** — the inbox holds entries not yet folded into the canon.

**Never append to `tasks/lessons.md` directly** (Convention #24). Every writer appends at EOF, so two parallel sessions conflict on the same final line every time — a content-free conflict whose resolution is always "keep both." Write a new lesson as its own file: `tasks/lessons/inbox/<YYYY-MM-DD>-<kebab-slug>.md`, one lesson per file, same `## Heading (date)` + body format. Separate files are the only shape git merges without a human. `/lessons-gc` folds the inbox into the canon and clears it — that batch is the ONLY thing that edits `lessons.md`.

A lesson stays here while it's narrow or situational; once it proves general and load-bearing, propose promoting it into a Layer 2 Critical Convention (the high-frequency, frequently-violated ones live in Layer 2 even if they originated as lessons — e.g. the atomic-replaceParam rule and the "use server" async-only rule are kept as rules above because following them matters more than taxonomic purity).

---

# LAYER 1 — FACTS / REFERENCE

> Stable, always-true context. Changes rarely.

## Stack
Next.js 16 (App Router), Supabase (Postgres + Realtime + RLS + Storage), Tailwind CSS v4, shadcn/ui, TypeScript, Vercel.

## Key Files

| File | Purpose |
|------|---------|
| `app/home/home-app.tsx` | Tab orchestrator — owns global state, **code-splits tabs via `next/dynamic`**, renders the active tab, mounts global overlays. Also owns governance (`governance_settings`/`govTeams`), the Receipts-workspace sidebar + `?rteam`/`?fsec` URL state, and the team-agnostic "← All workspaces" back button. **Compact-sidebar toggle:** owns `compactSidebar` state (persisted to `profiles.compact_sidebar`, optimistic write) and `panelHidden = compactSidebar OR hideSidePanel`; applies the `.shell-compact` class (in `app/globals.css`) to the shell root on `panelHidden`, which re-declares BOTH `--sidebar-width` AND `--shell-offset` (a `:root` calc won't recompute via inheritance) so the fixed overlays that align to `--shell-offset` hug the rail while compact. Passes `compact`/`onToggleCompact` to `DesktopSidebar` (rail-bottom `PanelLeftClose/Open` button). |
| `app/home/tabs/home-tab.tsx` | Home tab — mobile: Pocket Daybreak v2 recipe (chrome row + gear, setup card, FEATURED carousel, deadlines, digests, quick grid, verse); desktop unchanged (greeting, role badge, up-next hero, recent chats, congregation prompt). The Up Next slot renders `HomeHeroCarousel` when curated `home_slides` exist, else falls back to the pinned-or-latest announcement (existing behavior). Leader/admin Curate action is a ghost `ContentActionButton` in the hero's `HeroSectionLabel` action slot (desktop only), opening `HomeSlideManager` — never in the `TabPageHeader` (Convention #15). Also mounts `HomeDeadlines` (My Deadlines) between recent chats and "For you" (desktop) / Up Next and the Announcements preview (Pocket). |
| `app/home/tabs/home-deadlines.tsx` | **My Deadlines** Home section (Run Sheet P1), desktop + Pocket — a member's open assigned `event_tasks` (with due dates) + pending `event_confirmations`, urgency-sorted; inline checkbox mark-done + Confirm/Decline. Own SWR key `["my-deadlines", ministryId, profileId]` (NOT `loadHomeData` — independent revalidation on taps). Urgency in plum, never `--danger`/`--gold`. |
| `app/home/tabs/announcements-tab.tsx` | Announcements tab — full feed, RSVP, admin/leader CRUD, pinning, announcement detail view |
| `app/home/tabs/chats-tab.tsx` | Chats tab — on desktop: `ChatListPanel` (conversation list) renders in `DesktopSidebar` via `chatPanelContent` prop; `ChatScreen inline` renders in the content area. Mobile: `ChatsTab` (full list + overlay chat) wrapped in `md:hidden`. Also exports `ChatScreen`, `ChatSettings`, `CreateChatScreen`. |
| `app/home/tabs/plan-tab.tsx` | Plan tab — team planning. Desktop uses the shared shell pattern: `hidden md:flex` section + `TabPageHeader` (keeps its bottom `InsetHairline` always) + optional cream event sub-header (back-to-calendar, event title, edit pencil; `borderBottom: 1px solid var(--line)`) + `flex-1 overflow-y-auto` body. Strip-bearing teams (PraiseTeamTab, StudentOrgTeamHome, SmallGroupLeadersTab) render with no outer `px-14` wrapper; `PlanSubTabStrip` labels are inset via inner `md:pl-14`; the under-tabs hairline is `md:mx-14` inset matching `InsetHairline`. Non-strip teams (DgPraiseTeam, OneTimeTeam, TechTeam) use `px-14 py-7` wrappers. Mobile (`md:hidden`) is a sibling outside the desktop section, untouched. |
| `app/home/tabs/event-container.tsx` | Container-event surfaces — an event whose content is its sub-events (Welcome Week → its nights). Owns `useContainerRollup` (ONE batched fetch: children → plans → roles/tasks/blocks; never N+1) plus the three container sections: read-only merged week timeline (`runsheet`), the editable across-the-nights staffing table (`roles`), and the nights' open-task roll-up (`checklist`). A night's lead is stored on the NIGHT — the week edits that same record, never a copy. `isContainer` is derived in plan-tab from `extraTabs.includes("sub_events")` (and not being a child), fixed at creation so a tab set never rearranges mid-planning. |
| `app/home/tabs/directory-tab.tsx` | Directory tab — master/detail: member list in shell context panel (DirectoryMemberListPanel), member detail in content area (TabPageHeader + PageTitle); mobile path unchanged |
| `app/home/components/give-view.tsx` | Member-facing **Give** (Zelle donation) — the `give` Home tab. Congregation-wide, ungated. |
| `app/home/components/finance-workspace.tsx` | Back-office **Finance** — rendered INSIDE the **Finance Plan-team**, NOT a top-level tab. Section order + landing = **Allocation** (three per-fund cards with progress/over-budget state, collapsed grid with chevron-expanded per-fund editors + TOTAL footer), then Budget (fund-aware ledger, category filter chips), then Reimbursements (nav row carries a pending-count badge). Treasurer **Approve posts the ledger entry in one motion** (inline category confirm pre-matched from event name, Undo toast reverses both; decline of a posted split deletes its entry); quick-Approve only on single-split church receipts — external funds + multi-split keep the detail-page flow (president sign-off, grant Requested branch, reasons). Money inputs snap to cents on blur (`normalizeMoneyInput` in app/home/utils.ts). Exports `FinanceWorkspace`, `SubmitReceiptModal`. |
| `app/home/components/receipts-workspace.tsx` | The **Receipts** workspace (in Plan, sentinel `activeTeamId==='receipts'`): teams sidebar + per-team category subtab strip + submit modal + one-line entries + immersive read-only detail. |
| `app/home/governance.ts` | Governance helpers: `isGovernanceAdmin`, `teamAccessLevel` (roster × per-team none/view/write matrix). |
| `app/home/team-type.ts` | `classifyTeam()` — the single team-type classifier (by `team_type`, then name; **NEVER** by permission). Drives both plan-tab dispatch + home-app sidebar. |
| `app/home/workspace-presets.ts` | Fixed workspace/team presets — single source of truth for onboarding, approval, and in-app "Add workspace". **Worship-team family is BACKLOGGED (indefinite):** Praise Team, Tech Team, DG Praise, One-Time Event are `comingSoon: true` (shown disabled in Add-workspace + onboarding). Their code (`PraiseTeamTab`/`DgPraiseTeamTab`/`OneTimeTeamTab`/`TechTeamTab` in plan-tab.tsx) is FROZEN — do not refactor or invest there (the audit's worship dedup + worship field/chip migrations were deliberately deferred) until the family is actively resumed. |
| `app/actions/finance-auth.ts` | Finance authorization (single source of truth): `getFinanceCapability`/`computeFinanceCapability` — treasurer approve / president sign-off / budget write. |
| `app/actions/receipt-categories.ts` | Per-team receipt category CRUD (team-membership RLS). |
| `app/actions/chat-nicknames.ts` | Shared per-chat nickname write path (`setChatNickname`/`clearChatNickname`) — the ONLY writer of `chat_nicknames`. Service-role; verifies caller+target group membership + `type IN ('my','dm')`, moderates the nickname server-side (`moderateText`), stamps `ministry_id`. Reads happen via the `["chat-roster"]` SWR (RLS SELECT). |
| `app/actions/super.ts` (+ `super-constants.ts`) | Super-account POV switching: `switchMinistryRole` / `switchWorkspaceRole` / `resetToSuper` / `getSandboxTeams` — every action verifies the caller is the ONE super account (`SUPER_UUID` = brianjeong727) before using the service-role client; write-as is confined to sandbox ministries (`ministries.is_sandbox`; Central = true). `roleLabel(role, userId)` (in super-constants) aliases the super's home role to "Super" at display sites only — never in gates. |
| `components/central/super-switcher.tsx` | Super-only floating chip + "Acting as …" banner — gated on the account UUID, never the role (stays reachable while acting as visitor). Ministry-role list + workspace-role picker + Reset to super. |
| `app/actions/setup-checklist.ts` | Getting-started checklist: `getSetupChecklist` (progress fully DERIVED from live tables), `setLeadersInvited` / `dismissSetupChecklist` / `activateSetupChecklist` (merge-update `ministries.setup_checklist` jsonb). Eligible = admin-tier AND not dismissed AND (`created_at >= 2026-07-08` OR `active: true` via Church Settings → "Show on Home"). |
| `components/central/getting-started-card.tsx` | The Home checklist card (LEAF — HomeTab fetches via SWR and passes data/handlers down). |
| `components/central/confirm-dialog.tsx` | `ConfirmDialog` — the standard modal delete-confirm (portaled CentralModal + danger-solid), per web_design_system.md §14. Inline two-step stays for dense rows; never fire a delete directly. |
| `app/home/tabs/profile-tab.tsx` | Profile tab — spiritual profile fields, journal (devotionals/prayers/verses sub-tabs), sign out |
| `app/home/tabs/settings-tab.tsx` | Settings tab — admin-only; ministry settings, member management, roles |
| `app/home/tabs/forms-tab.tsx` | Forms tab — announcement-linked forms, form fill overlay (FormFillView), admin responses view (FormResponsesView) |
| `app/home/tabs/congregation-tab.tsx` | Congregation tab — pastor-only; congregation polling and pulse questions. Lives in the HOME nav section (R7, 2026-07-09), not You; the `isPastor` gate is unchanged. |
| `app/home/components/home-slide-manager.tsx` | Home hero curation overlay — leaders add upcoming events / announcements (published only) as reference slides, reorder, and remove; photo-slide upload is SHELVED behind a "Coming soon" placeholder (the `panel_color` upload pipeline exists but is not exposed); writes to `home_slides` (ministry_id on every write). Photo uploads reuse the `announcement-images` bucket under `home-slides/{ministryId}/`. |
| `app/home/components/command-palette.tsx` | ⌘K command palette — quick nav, person/chat/announcement search |
| `app/home/tabs/network-tab.tsx` | Admin-only Network tab — cross-ministry hub placeholder |
| `app/home/tabs/message-row.tsx` | Memoized chat message row (reactions, polls, receipts) — extracted from ChatScreen |
| `app/home/tabs/composer.tsx` | Chat composer (input, @mentions, GIF picker, attachments) — extracted from ChatScreen |
| `app/home/tabs/note-editors.tsx` | Rich-text note editors (meeting notes etc.) |
| `app/home/nav-state.ts` | Shared URL nav-state module — atomic param writes (Convention #5) |
| `app/home/breadcrumb-context.tsx` | Breadcrumb provider — subpages push crumbs to the shell topbar (§4.18) |
| `app/home/chat-list.ts` | Chat-list data module (SWR fetchers for the conversations panel) |
| `app/actions/auto-chats.ts` | Auto-chat machinery: ministry chat, grade chats, staff chat creation + membership |
| `app/actions/event-confirmations.ts` | Run Sheet P1 confirmation/task actions: `requestConfirmationsAction` (leader manual T-2 trigger — inserts `event_confirmations` for assigned roles), `reRequestConfirmationAction` (round+1 reset), `completeTaskAction` (assignee marks own task done — `event_tasks` UPDATE RLS is leader-only, so this admin-client action gates on assignee-or-leader). Each claims `notification_ledger` then POSTs the dispatch route (mirrors the SQL tick's claim-then-post, so a later tick never double-sends). `authorizePlan()` mirrors the `event_confirmations` INSERT RLS (leader OR `can_plan_events`). |
| `app/actions/governance.ts` | Governance server actions (roster, matrix) |
| `components/central/index.ts` | Barrel for all design-system components (CentralModal, CentralButton, ContentHeader, …) |
| `app/home/components/desktop-nav.tsx` | Desktop sidebar navigation |
| `app/home/components/shared.tsx` | Shared UI primitives used across tab files |
| `app/home/types.ts` | All shared TypeScript types for home and tabs |
| `app/home/utils.ts` | Shared utility functions (formatRelativeTime, getInitials, `normalizeMoneyInput`) **plus the canonical event-date helpers — `eventDaySpan` (calendar-day count, NOT a timestamp walk), `eventDateRangeLabel`, `eventDateRangeShort`, `eventDayHeaderLabel` ("FRI · SEP 12"). Every event-date surface (Overview, mobile facts grid, events list, Run of Show day headers) goes through these — never re-derive a span or range inline.** NOTE: getAvatarColor is NOT exported here — avatar color/shape is owned by `MonogramChip` (plum + cream, circle); do not reintroduce a parallel color util. |
| `app/home/page.tsx` | Server component — auth check, profile load, renders `<HomeApp>` |
| `app/(auth)/shared.tsx` | Canonical shared auth components: `AuthPhotoPanel`, `SplitShell`, `GoogleButton`, `OrDivider`, `EyeButton`. All auth pages must use these — do not reimplement the split layout inline. |
| `app/(auth)/login/page.tsx` | Email + password login |
| `app/(auth)/signup/page.tsx` | Signup with name, email, password, graduation year |
| `app/landing/page.tsx` | Redirects to `/` (landing content now lives at root) |
| `app/page.tsx` | Public landing / marketing page (renders `LandingPage` component) |
| `app/ministries/page.tsx` | Public ministry discovery + My Ministries |
| `app/onboarding/page.tsx` | Ministry registration wizard — 4-step (Basic info, Structure, Teams, Review); cream context rail + scrollable content. Accessed only via `/register-ministry`, never linked directly. |
| `app/register-ministry/page.tsx` | Role-gated ministry registration entry point (server component). Not logged in → `/signup?intent=register`; admin-tier → `/onboarding`; non-admin logged-in → "only admins can register" gate. **All "Register your ministry" CTAs must point here.** |
| `app/admin/page.tsx` | Founder-only admin panel (gated by hardcoded email in proxy.ts) |
| `app/announcements/[id]/page.tsx` | Shareable announcement detail route |
| `app/pending/page.tsx` | Shown when user's ministry has `status = 'pending'` |
| `app/pick-ministry/page.tsx` | Multi-ministry switcher |
| `app/actions/create-group.ts` | Server action: create chat group + add members |
| `app/actions/ministry.ts` | Server actions: `joinMinistryByCode`, `submitMinistryApplication`, `selfLeaveMinistry` |
| `proxy.ts` | Auth gate middleware — replaces deleted `middleware.ts` |
| `lib/supabase.ts` | Browser Supabase client (singleton, exports `createClient()`) |
| `lib/supabase-server.ts` | Server Supabase client |
| `lib/supabase-admin.ts` | Admin Supabase client (service role) |
| `lib/audit.ts` | Audit log helpers |
| `lib/tz.ts` | The ONE event date/time conversion layer. Dependency-free (`Intl` only), isomorphic (client + server + edge), DST-correct by PROBING the offset per instant. Wall-clock↔instant inverse pair, all-day column helpers, IANA validation, and the single sanctioned fallback zone. Has no imports, so LEAF components (`components/central/*`) may consume it. See Convention #23. |
| `lib/ministry-timezone.ts` | Server-side read of `ministries.timezone` (server actions, route handlers). |
| `app/home/ministry-timezone-context.tsx` | Client provider + `useMinistryTimezone()` hook. The zone rides the existing ministry boot select in `app/home/page.tsx` → `HomeApp` → provider — no prop threading, no storage (Convention #1). |
| `lib/keyboard-inset.ts` | The ONE software-keyboard layer. Publishes `--kb-inset` (layout viewport occluded by the keyboard), `[data-kb-open]` (a keyboard is showing in EITHER container) and `[data-kb-native]` (the shell). Shell path dynamic-imports `@capacitor/keyboard`, CLAIMS `resize: "none"` at runtime (`setResizeMode` then `getResizeMode` to confirm — never `"native"`, see Convention #28) and takes the height from `keyboardWillShow` and removes the iOS `^ v Done` accessory bar; web path measures `innerHeight - visualViewport.height`. Exports `startKeyboardInset()`, `subscribeKeyboard()` (NOT a hook — see #28), `useSwipeDownToDismissKeyboard()`, `dismissKeyboard()`. |
| `components/keyboard-inset-bridge.tsx` | Starts the keyboard layer once from the root layout so the vars are live on every route (same shape as `NativeSplashRelease`). Renders nothing. |
| `lib/native-auth.ts` | Native-shell detection. `isNativeShell()` / `useIsNativeShell()` (UA carries `CentralShell`) plus **`callingBlockedInShell()`** — the ONE predicate for "may this shell open a mic/camera", keyed on the binary's `CentralCalls/<n>` marker rather than on being native (Convention #29). |
| `lib/profile-name.ts` | The ONE display-name policy for OAuth accounts. `providerFullName()` / `nameIsEmailDerived()` / `reconcileProfileName()`. Consumed by `/auth/callback`, `verifyNativeOAuthSession`, `proxy.ts`'s completeness gate, and `/complete-profile` — the predicate is shared so the gate and the page can never disagree and loop. Runtime-dependency-free (type-only supabase imports) so middleware can import it. |
| `lib/chat-notification.ts` | The ONE encoding of whether a chat message notifies you, and the two fixed lines it says (WHO / WHERE). Shared by the push dispatch route and the in-app banner — iOS suppresses its own banner while the app is foregrounded, so the two are one feature seen from two places and a second copy of the rule would let muting a chat silence only one of them. Owns `SMART_ROOM_THRESHOLD` (30, Convention #18's number). |
| `components/central/message-banner.tsx` | The in-app notification banner. Ivory `--r-pocket` card + `--shadow-nav`, top-centre at phone width and top-RIGHT on desktop, z 240 (above the modal tier — a banner a modal can bury is silently lost). Dumb: it renders what it is handed; eligibility is `lib/chat-notification.ts` and the mount is `home-app.tsx`'s realtime path. Retires in 5s, swipes up to dismiss, taps through to the chat WITHOUT moving the active tab. |
| `lib/moderation.ts` | Chat profanity filter — tiered word list + `moderateText` (whole-word, leet-aware; scripture/theology terms excluded) + `MODERATION_DEFAULTS`. Pure TS, client+server. |
| `app/actions/moderation.ts` | Chat-moderation server actions: `updateModerationSettings` (admin-gated, enum-validated) + `recordChatOffense` (fire-and-forget; atomic `increment_chat_offense` RPC; audits admins at every 5th offense). |
| `app/actions/authz.ts` | Shared server-action auth guards: `requireMinistryMember` / `requireMinistryAdmin` / `requireSameMinistry` / `requireTeamMemberOrAdmin` — the pattern every service-role action must use. |
| `lib/group-algorithm.ts` | Small group generation algorithm |
| `components/ui/bottom-nav.tsx` | Bottom tab navigation (mobile only) |
| `components/central/` | Shared design-system components: `CentralButton`/`IconButton` (button.tsx), `CentralCard`, `ListRow`, `FilterChip`, `ActionMenu` (action-menu.tsx — flip-aware portal kebab/dropdown; Convention #20), `Input`/`Select`/`Textarea`/`SerifInput`/`AddInlineSelect`/`FormField` (field.tsx), `PageTitle`, `SectionHeader`, `ContentHeader`, `EventSectionHeader`, `PlanSubTabStrip`, `MonogramChip`, `SegmentedControl` (exclusive filters — R4), `FeaturedHeroCard` (the one plum content surface), `ChatStrip` (also owns the `ChatPreview` type — it lives here, not in `app/home/types.ts`, because `components/central` is a LEAF and must not import from `app/`), `InsetHairline`, `Toast` (toast.tsx — shadowless bottom-center action toast with optional Undo; single instance, portaled, z below modals), `nav-sections.ts` (`NAV_SECTIONS`/`sectionForTab` — the single tab→section source), and `EYEBROW_STYLE`/`MONO_STYLE`/`RAIL_LABEL_STYLE` (typography.ts — the canonical mono-label constants; shared.tsx re-exports them; `components/central` is a LEAF and must not import from `app/`). |
| `components/central/home-hero-carousel.tsx` | Curated home hero carousel — one shared `--hero-h` frame (`HeroFrame`, radius `--r-hero`) with a constant "Featured" eyebrow (`HeroSectionLabel`) and tall flanking side-pill arrows + dot row. Renders three slide types: `photo` (full-bleed image; stored `panel_color` fades solid→transparent across the seam via `--hero-panel-fade`, over a left-anchored `--ink` legibility scrim; cream caption), event-with-photo (same + glass date/RSVP chip), and flat-plum featured reference slides (announcement / event-without-photo) via `FeaturedHeroCard` — 60/40 split with the §1.3 date anchor (serif 36/600 cream-on-dark; falls back to date-posted); the retired `UpNextCard` it replaced was deleted 2026-08-04, and this file now owns the `UpNextEventDetail` type it used to export. Static CSS panel — no live blur, SSR-safe. Manual prev/next only (no auto-rotation/motion/swipe). Exports `HeroFrame`/`HeroSectionLabel`/`FeaturedHeroCard` reused by the home-tab fallback. |
| `components/central/use-edge-swipe-back.ts` | Mobile edge-swipe-to-go-back hook (`useEdgeSwipeBack`) — attach the returned ref to the panel that should slide, pass the SAME handler the chrome chevron fires. Coarse-pointer gated (inert on desktop), edge-anchored (~24px), horizontal-scroller guard (carousels/chip-rails never hijacked), direction-locked (vertical scroll wins), multi-touch guarded; transform-only motion with the PocketSheet ease-out curve, reduced-motion suppresses only the snap/slide-off. Wired into `SubpageShell` (covers announcement detail, member sheet, chat settings, meeting notes, receipts/finance detail, plan drills) and `ChatScreen` (`onClose`). See Convention #22. |
| `components/central/swipe-actions.tsx` | `SwipeActionRow` — reveal-on-swipe row actions for a mobile list row (mobile_design_system §4). Generic: the caller supplies the actions, the parent owns which row is open (CONTROLLED, so only one opens at a time and Android back can close it). Inherits every `useEdgeSwipeBack` safety property and IMPORTS its `inHorizontalScroller` guard rather than copying it — coarse-pointer only, direction-locked, multi-touch guarded, and it ignores a touch starting within 24px of the left edge so back-swipe (Convention #22) always wins. `touch-action: pan-y` leaves vertical scroll + pull-to-refresh to the browser. First consumer: the mobile chat list. |
| `app/home/chat-permissions.ts` | `chatCapabilities()` — the ONE encoding of who may manage / leave / archive / delete a chat (church management = leader-tier AND membership of that chat, mirroring the groups/group_members/messages RLS). Consumed by `ChatSettings` AND the chat-list swipe actions, so the two can never offer different things; a disagreement would mean the swipe offering an action the DB then refuses. |
| `app/home/chat-actions.ts` | Conversational chat-row writes fired from the swipe actions: `setChatPinned` / `setChatMuted` / `setChatArchived` / `leaveChat`. Each patches the shared `["chat-list", userId, ministryId]` SWR cache optimistically, writes, and rolls back on failure (Convention #4). Mute writes `notify_mode` and sends `muted` alongside it — `muted` is trigger-derived and a CHECK asserts they match. Deliberately NOT the same path as `ChatSettings`, which stages every control behind Save (Convention #21); they share the gate and the cache key, not the commit semantics. |
| `app/actions/calls.ts` | The ONE write path for `calls`/`call_participants` — start / join / decline / leave / end, plus `getLiveCall` and `callingAvailable`. Service-role after an explicit check; asks the DB for the start gate via the `can_start_call` RPC (Convention #29). |
| `lib/livekit.ts` | SERVER-ONLY LiveKit layer: `mintCallToken` (per-room, per-user, publish granted per SOURCE so an audio call cannot publish camera), `livekitConfigured`, `callRoomName`. The API secret signs join tokens — never import from a client component. Env `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL`; the URL is returned WITH each token rather than exposed as `NEXT_PUBLIC_`. |
| `lib/call-lifecycle.ts` | `finalizeCall()` + `callSummaryLine()` — shared by the server actions and the LiveKit webhook (a `"use server"` file may only export async fns). Idempotent by construction: the `.neq("status","ended")` on the UPDATE claims the row, so the second caller in a hang-up race writes no duplicate system line. |
| `lib/ringtone.ts` | The synthesized ring / ringback (Web Audio, no asset). `primeAudio()` unlocks a context from a real gesture — an INCOMING call is by definition not something the callee did, so autoplay policy can still silence it; the visual ring and `navigator.vibrate` are what carry it when audio is blocked. |
| `app/home/call-context.tsx` | `CallProvider` + `useCall()` — the ONE client-side call state (at most one call, app-wide). Owns the ring feed over `subscribeChatTopic`, the catch-up query, the LiveKit `Room`, mic state and `liveCalls` (which chats have a call up). Mounted at the shell root in `home-app.tsx`. |
| `app/home/components/call-surface.tsx` | The single mount point for calling's UI — in-call panel, incoming ring, call errors. Kept out of the provider so a speaking-indicator change re-renders only this. |
| `app/home/components/call-overlay.tsx` | In-call surface: full-screen cream takeover at phone width, a docked corner panel on desktop parked ABOVE the composer (a call panel that swallows Send is worse than one covering old messages). `.call-panel` owns its own safe areas — it is `fixed inset-0` and escapes the shell's. |
| `app/home/components/video-stage.tsx` | The video layouts. A screen share takes over both of the others (screen full-stage + face filmstrip). 1:1 = the other person full-bleed with you as a corner inset; group = an even grid, active speaker ringed, nobody larger than anyone else. Column count comes from the PARTICIPANT COUNT, not a breakpoint — what makes a face too small is how many share the screen, and that is the same number on any device. A muted camera publication renders the monogram, never a frozen last frame. |
| `app/home/components/incoming-call.tsx` | The ring. One component, two grammars: a DM says Answer/Decline (danger read — declining genuinely hangs up on someone), a group says Join/Not now (neutral — the call carries on without you). z 260, above everything but the pending veil. |
| `app/api/livekit/webhook/route.ts` | LiveKit → Central webhook (`room_finished`, `participant_left`), JWT-signature verified against the same API secret. The authority on when a room is actually empty; clients lie by omission. Configure at LiveKit → Settings → Webhooks. |
| `app/home/chat-thread-cache.ts` | The out-of-React chat transcript store — what makes opening a conversation instant. Reactions are EMBEDDED in the messages select (ONE round trip, not two); an in-memory LRU `Map` holds the last snapshot per room (12 rooms × 100 messages, never persisted — Convention #1). **Invalidation rule (ratified 2026-08-18) — the server wins for the time range it reports on:** keep a cached message only if the server returned it, it was NOT on screen when the query went out (a live arrival or new send), it is your own unsent row, or it is older than the newest page (scrollback); otherwise DROP. "Appeared after the request" is answered by an ID SET captured before the fetch, NEVER by a clock. An empty response is RLS saying *you can see nothing here*, so it clears the room. |
| `components/central/back-chevron.tsx` | The shared stacked-header back control (`BackChevron`) — cdesign "Back chevron" handoff (ratified 2026-07-27). Muted-ink Lucide `ChevronLeft` (19px, 1.7 stroke; color `--body` → `--ink` on hover), flush-left 24×34 box, −3px optical nudge, no bg/radius; 44×44 tap target via a transparent `::after` (`.back-chevron` in `app/globals.css`). Reads as navigation CHROME, not an action — plum stays the one accent per view (replaced the old plum `ArrowLeft` circle). EVERY stacked header routes through it: `SubpageShell`, `PocketChrome`, `PocketHubChrome`, and the chat/directory/announcements chrome rows; the labeled `PocketBackRow` uses the same muted chevron. No per-screen back buttons (a dark full-screen editor toolbar keeps its own muted-text arrow — distinct surface). See `mobile_design_system.md` §0.3 + Convention #22. |
| `components/central/subpage-shell.tsx` | The canonical triggered-subpage container (`SubpageShell`, DESIGN_SYSTEM §4.18) — desktop title/meta/`titleAction` header, the single mobile chrome row (`BackChevron` + serif 20/600 title), scroll reset, edge-swipe-back. Also exports **`SubpageChromeActions`** — a portal slot that renders actions INTO that mobile chrome row from anywhere in the subpage body (Convention #25); the shell publishes the row's `<div>` through context as `useState` (a ref leaves the first portal render null). Consumers: event-plan spokes, team settings, meeting notes, member sheet, receipts/finance detail, announcement detail. |
| `permissions.md` | **Canonical source of truth** for role-based access — who can do what across every feature |

## Architecture

### Middleware
The auth middleware lives in `proxy.ts` — **not** `middleware.ts` (that file was deleted).

Public routes allowed through: `/`, `/landing`, `/ministries`, `/login`, `/signup`, `/forgot-password`, `/update-password`, `/auth/`, `/api/calendar/`, `/register-ministry`.

### Multi-tenant model
Every workspace is a **ministry**. All tenant data carries a `ministry_id` FK. RLS policies enforce isolation. Two SECURITY DEFINER helpers bypass profile-table RLS without recursion:
- `auth_ministry_id()` — returns current user's `ministry_id`
- `auth_is_admin_or_leader()` — returns `true` if role is admin or leader (called by ~104 policies across 44 tables)

⚠️ **Every SECURITY DEFINER policy helper must be `set search_path = public, pg_temp`.** Bare `public` does NOT close the shadowing vector — `pg_temp` is searched FIRST for relations unless listed explicitly, so a planted `pg_temp.profiles` can make a member report as admin, or relocate them into another ministry via `auth_ministry_id()`. And `''` is worse than useless when the helper calls an unpinned one: the empty path propagates INTO the callee and raises `42P01` for every caller. Only pin `''` when the body is fully qualified AND calls nothing (`event_plan_ministry_id`). See `tasks/lessons/inbox/2026-08-06-search-path-pin-does-not-propagate.md`.

Two more scope the event-planning tables (Convention #9):
- `event_plan_ministry_id(plan_id)` — the ministry that owns an `event_plans` row. `event_tasks`/`event_roles`/`event_blocks`/`event_notes` intentionally carry no `ministry_id` (Convention #8), so their INSERT/UPDATE/DELETE policies scope through this.
- `auth_can_plan_events()` — the SINGLE encoding of the event-planning write gate: admin/leader tier, OR a `can_plan_events` team role **in the caller's own ministry**. Change the gate here, never per policy.

A third SECURITY DEFINER helper, `is_group_member(group_id, user_id)`, gates the messaging tables (Convention #9):
- `messages`, `message_reactions`, and `group_members` RLS use `is_group_member()` instead of correlated per-row `EXISTS` subqueries.
- Blanket permissive policies (`auth.uid() IS NOT NULL`) were removed from all three — they had silently OR'd away every scoped policy, exposing every row platform-wide.
- `message_reactions` INSERT requires membership of the target message's group (closed a cross-ministry reaction gap).
- `group_members` INSERT allows admin/leader (a church group only if they belong to it), the group creator, **self ONLY into a group that is explicitly open** (`group_is_open()` — `is_open AND type='my' AND NOT archived`), or any existing member of a `my` group (`group_is_my()`, mirroring the chat UI's `canManage`). Tightened 2026-08-19: the self-join clause was previously unconditional, so anyone holding a group's uuid could insert themselves and read its whole history — reachable because `small_groups.chat_group_id` is readable ministry-wide, putting every DG chat one query away, and because anyone removed from a chat still knows its id. Reproduced live, then proven closed. The final clause was also narrowed from `type <> 'church'` to `type = 'my'`, which stops either participant of a DM adding a third person to it.

New users with no `ministry_id` are redirected to `/ministries` by middleware.

### Routing flow
```
/              → public LandingPage (marketing page; logged-in users are NOT auto-redirected)
/landing       → redirects to /
/login, /signup → auth pages (no ministry required)
/join          → redirects to /ministries?tab=code (page retired 2026-07-12)
/home          → main app shell (requires auth + ministry_id)
/ministries    → public ministry discovery
/register-ministry → role-gated entry point (public); server-side: no auth → /signup?intent=register, admin-tier → /onboarding, non-admin → gate page
/onboarding    → ministry registration wizard (requires auth; reached only via /register-ministry)
/admin         → founder-only admin panel
/pending       → ministry status = pending
/pick-ministry → multi-ministry switcher
/announcements/[id] → shareable announcement detail
```

**Ministry status routing:** `proxy.ts` checks `ministries.status`. If `pending` → redirect to `/pending`; if `rejected` → redirect to `/landing`. Only `active` ministries reach `/home`.

**Vanity URL tab redirects** (handled in `proxy.ts`): `/announcements`, `/forms`, `/settings`, `/church-settings`, `/profile`, `/messages`, `/events` all redirect to their `?tab=...` equivalents at `/home`.

### Tab structure (orchestrated by `home-app.tsx`, each tab is its own file in `app/home/tabs/`)

Valid tab values (from `app/home/types.ts`):
`"home" | "announcements" | "chats" | "plan" | "directory" | "give" | "profile" | "settings" | "forms" | "congregation" | "network"`

```
HomeApp (root — owns all global state)
├── home           → HomeTab         — greeting, up-next event, recent chats, congregation prompt
├── announcements  → AnnouncementsTab — feed, RSVP, admin/leader CRUD, pinning
├── chats          → ChatsTab         — Church Chats / My Chats, ChatScreen, ChatSettings
├── plan           → PlanTab          — teams (incl. the Finance Plan-team) + the Receipts workspace, worship, event planning (shown if on ANY team OR governance admin; deacon/elder NO LONGER excluded)
├── directory      → DirectoryTab     — member list + member sheet
├── give           → GiveView         — member-facing Zelle donation page (back-office Finance is now a Plan team, not a top-level tab)
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
| `chat:{groupId}` (broadcast hub) | `messages` + `message_reactions` | INSERT/UPDATE/DELETE via `broadcast_chat_change()` | `HomeApp` subscribes one per member group (`chat-broadcast.ts`) — drives the chat list's preview, ordering and reaction refresh |
| `read-receipts-{groupId}` | `group_members` | UPDATE — **only subscribed for chats with < 30 members** (≥30 use on-demand "Seen by N") | `ChatScreen` |
| `chat:{groupId}` (same hub) | `calls` | INSERT/UPDATE/DELETE via `broadcast_chat_change()` | `CallProvider` — the ring. NO new channel: `calls` reuses the per-group topic every client is already subscribed to, discriminated by `event.table === "calls"`. Also carried on the `postgres_changes` fallback. |
| `own-memberships-{userId}` | `group_members` | INSERT, UPDATE, DELETE — filtered to `user_id=eq.{userId}` | `HomeApp` — re-subscribes the per-group broadcast hubs when the user creates/joins/leaves a chat |
| `typing-{groupId}` | — | broadcast | `ChatScreen` (typing indicator) |
| `chat-nicknames-{groupId}` | `chat_nicknames` | INSERT, UPDATE, DELETE — filtered to `group_id=eq.{groupId}` (RLS-filtered to group members; requires `replica identity full` so DELETE payloads carry `group_id`) | `ChatScreen` — revalidates the `["chat-roster"]` roster SWR so a nickname set/changed/cleared by anyone updates every member's display names live |

### Push dispatch — Run Sheet events (P1)
The push dispatch route (`app/api/push/dispatch/route.ts`) gained 3 cron/action-driven resolvers: `task_due` (table `event_tasks`), `confirm_request` + `confirm_escalation` (table `event_confirmations`). `task_due`/`confirm_request` gate on the new `NotificationSettings.deadlines` pref (default on); `confirm_escalation` rides the existing `activity` pref. Fired by `run_sheet_tick()` (see Schema → Run Sheet) and the `event-confirmations.ts` actions (immediate delivery on manual request). The driving cron is live: `run-sheet-tick` (job 9, `5 * * * *`, scheduled 2026-07-21) — `run_sheet_tick()` self-gates to the 9–10am PT window.

**Notification taxonomy (ratified 2026-07-12).** Four tiers govern what may push:
- **T1 push, default ON** — DMs, @mentions, replies to you, published announcements (always on, official channel), task/role assignments, DGL week assignment, receipt decision to submitter, role changes, reactions to YOUR message (author only; honors per-chat mute and the `reactions` pref).
- **T2 group chats, SMART default** — all messages under 30 members, mentions-only at ≥30 (same threshold as read receipts, Convention #18). Per-chat mute (`group_members.notify_mode`) is a hard override; user pref can force all/mentions/off. The **IN-APP banner obeys the same resolution as the push** (ratified 2026-08-24) — same mute, same per-chat `notify_mode`, same ≥30 mentions-only default — so one control governs both. It is suppressed only for the chat currently open (`globalOpenChat`, which is the mobile overlay and the desktop inline pane alike) and when the document is hidden, where the OS notification is the one that fires.
- **T3 desk-work, web ON / mobile daily digest** — form responses (leader), receipt submitted (treasurer), sign-off needed (president), new member joined (admins), pulse responses (pastor), moderation threshold (admins).
- **T4 never push** — poll votes, view/RSVP counts, pins, journal/streaks, edits, meeting notes. Pulse QUESTIONS to members are T1 (rare, weighty). No quiet-hours engine.

### Supabase project
- Project ID: `wgqpnilaokfipocsugqo`
- Storage buckets: `announcement-images` (public; also holds reimbursement `receipts/` and home hero `home-slides/{ministryId}/` photos), `bible-study` (public), `chat-attachments` (public), `devotionals` (public), `profile-images` (public), `worship-charts` (public)
- Storage RLS: all three `announcement-images` upload paths have ministry-scoped INSERT policies (`announcement_images_insert` → `announcements/<auth_ministry_id()>/`, `home_slides_photo_insert` → `home-slides/<auth_ministry_id()>/`, `receipts_photo_insert` → `receipts/<auth_ministry_id()>/`) plus `announcement_images_select` (SELECT, `authenticated`, bucket-wide) — the SELECT policy is REQUIRED because storage-API uploads use `INSERT…RETURNING`, and Postgres applies SELECT policies to RETURNING rows; without it every upload in the bucket fails with a misleading RLS-denied error (fixed + verified 2026-07-11: own-ministry allowed on all three paths, cross-ministry denied). `worship-charts` writes are ministry-scoped on BOTH INSERT and DELETE via the SECURITY DEFINER helper `auth_owns_team_folder(text)` — the policy extracts `(storage.foldername(name))[1]` (a `teams.id`, since paths are `teamId/weekId/songId.pdf`) and the helper resolves it to a ministry; it takes the SEGMENT, not the path, because a pinned `search_path` cannot resolve `storage.foldername` (42883). Fixed + verified 2026-08-16: both policies were previously just `bucket_id = 'worship-charts'`, so any authenticated user of any ministry could delete or plant any other ministry's charts — reproduced live (8 objects deleted cross-tenant), then proven closed (0, swept as a member of every ministry). An inline `teams` subquery would have run as the CALLER and worked only by coincidence of matching predicates — hence the helper. `bible-study` writes are ministry-scoped on INSERT AND UPDATE via `auth_owns_bible_study_object(text)` — its uploads are FLAT (`<sheetId>.pdf`, no folder), so the helper resolves the filename against `bible_study_sheets.ministry_id` instead of a path prefix; the pattern is fully anchored (`^<uuid>\.pdf$`) so a prefix, folder, doubled extension or bare extensionless uuid cannot match. Fixed + verified 2026-08-19: the policies previously required only `auth_is_admin_or_leader()`, true for an admin/leader of ANY ministry — reproduced live (a Central leader wrote a Crossroads sheet name), then proven closed while same-tenant upload still works. An upsert of an existing object is checked by INSERT *and* UPDATE, so both must move together. There is deliberately NO DELETE policy (nothing in the app removes from this bucket; service-role is the instrument) — so deleting a sheet strands its PDF. ✅ NOT gaps, contrary to an earlier note here: `chat-attachments` INSERT already requires `is_group_member(<first path segment>, auth.uid())` and `devotionals` INSERT already requires the first folder to equal `auth.uid()` — both probed in both directions 2026-08-19 (foreign group DENIED 42501, other-user folder DENIED 42501, prefix collision DENIED 42501). **Read `pg_policy`, not this file, before changing any policy** — `supabase/*.sql` is a partial historical record and this doc has been wrong in both directions.

## Environment Variables (required on Vercel)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (used in auth callback) |
| `ANTHROPIC_API_KEY` | Anthropic API (praise team slideshow generator) |
| `NEXT_PUBLIC_SITE_URL` | `https://joincentral.app` |
| `LIVEKIT_API_KEY` | LiveKit project API key (calling) |
| `LIVEKIT_API_SECRET` | LiveKit API secret — signs join tokens AND verifies the webhook. Server-only, never `NEXT_PUBLIC_` |
| `LIVEKIT_URL` | `wss://<project>.livekit.cloud` — returned to the client with each token |

## Database Schema

> **Source of truth: the live database.** Query it via Supabase MCP (`mcp__supabase__list_tables`, `mcp__supabase__execute_sql`) rather than trusting any copy here. The tables below are correct as of the last audit (2026-06-20) but schema evolves — always verify before writing migrations.

### Core tables (frequently read in everyday work)

| Table | Key Columns |
|-------|-------------|
| `ministries` | `id`, `name`, `university`, `universities` (jsonb), `invite_code`, `staff_invite_code` (both **column-revoked** from `authenticated`/`anon` — read only via the admin-scoped `getMinistryCodes` action), `status` (`active`/`pending`/`rejected`/`archived`), `is_public`, `location`, `automation_settings` (jsonb), `governance_settings` (jsonb `{all_admins, roster_ids}`), `moderation_settings` (jsonb `{enabled, behavior, strictness, scope, photo_enabled}` — chat filter config), `archive_requested_by`/`archive_requested_at` (two-step archive), `is_sandbox` (super write-as allowed; Central = true), `hidden_from_discovery` (excludes test tenants from `/ministries` public discovery — distinct from `is_sandbox`, which only grants super write-as; Central is sandbox **and** discoverable), `setup_checklist` (jsonb `{leaders_invited, dismissed, active}` — getting-started state; progress itself is derived), `timezone` (IANA, NOT NULL default `America/New_York` — authoritative for rendering AND scheduling every event time; **column-granted** `SELECT` to `authenticated`: this table has no table-level grant, so a new column lands UNGRANTED and PostgREST 403s the *entire* query that names it), `created_by` |
| `profiles` | `id`, `ministry_id`, `name`, `email`, `role`, `graduation_year`, `grade`, `needs_grad_check`, `gender`, `avatar_url`, `about_me`, `bible_verse`, `prayer_request`, `pray_for_me`, `phone`, `bio`, `testimony`, `favorite_worship_song`, `favorite_verse`, `favorite_book_of_bible`, `show_journal_entries`, `show_journal_streak`, `school_id`, `saved_signature`, `sidebar_note`, `compact_sidebar` (desktop UI pref — rail-only shell toggle) |
| `groups` | `id`, `ministry_id`, `name`, `type` (`church`/`my`/`dm`), `created_by`, `archived`, `pinned_message_id` |
| `group_members` | `group_id`, `user_id`, `last_read_at` |
| `messages` | `id`, `group_id`, `sender_id`, `content`, `created_at`, `reply_to_id`, `message_type`, `is_edited`, `edited_at`, `attachment_url`, `attachment_type`, `attachment_name`, `attachment_size`, `poll_id` |
| `announcements` | `id`, `ministry_id`, `title`, `body`, `is_pinned`, `is_sub_pinned`, `is_event`, `image_url`, `audience`, `created_by`, `show_attendees`, `status` |
| `announcement_views` | `announcement_id`, `user_id` — UNIQUE |
| `rsvps` | `announcement_id`, `user_id` — UNIQUE(announcement_id, user_id) |
| `teams` | `id`, `ministry_id`, `name`, `icon`, `description`, `team_type` (`standard`/`dg_praise`/`one_time`/`finance`), `allow_co_presidency`, `allow_admin_members`, `admin_access` (`none`/`view`/`write`), `created_by` |
| `team_roles` | `id`, `team_id`, `name`, `permissions` (jsonb array of strings), `is_president` |
| `team_members` | `id`, `team_id`, `user_id`, `role_id`, `added_by`, `via_super_switch` (switcher-added; stripped by resetToSuper) — UNIQUE(team_id, user_id) |
| `home_slides` | `id`, `ministry_id`, `slide_type` (`announcement`/`event`/`photo`), `announcement_id` FK→`announcements`, `calendar_event_id` FK→`calendar_events`, `image_url`, `caption`, `eyebrow`, `panel_color` (stored clamped dark hex, computed once at upload), `order_index`, `is_active`, `created_by`. Curated home hero slides. CHECK: `announcement` → announcement_id set, image_url null; `event` → calendar_event_id set (image_url optional, its own uploaded photo); `photo` → image_url set, no refs. RLS: select = ministry members; insert/update/delete via `auth_is_admin_or_leader()`. Photo images live in the `announcement-images` bucket under `home-slides/{ministryId}/`. |

### Feature-area index (names only — query MCP for columns)

**Messaging**
`polls`, `poll_votes`, `message_reactions`, `group_sessions`, `chat_offenses` (per-user profanity-filter offense counter; written only via the service-role `recordChatOffense` action + `increment_chat_offense` RPC; admins read), `chat_nicknames` (shared per-chat nicknames — one per `(group_id, target_user_id)` — in personal group chats + DMs only; SELECT = any group member, writes are service-role-only via the `setChatNickname`/`clearChatNickname` action which moderates server-side; the `group_is_personal()` helper (`type IN ('my','dm')`) gates the write RLS; `replica identity full` for realtime)

`message_reactions` fires `notify_new_reaction` (AFTER INSERT → `notify_push_dispatch`), and `get_chat_list`/`get_chat_previews` now return eight `last_rx_*` columns describing the newest reaction in each chat.

`group_members` per-chat prefs: `muted`, `pinned`, `last_read_at`, `notify_mode` (`all`/`mentions`/`off`, NULL = inherit the global `notification_settings.group_mode`). **`muted` is OUTPUT-ONLY** — the `sync_group_member_notify_mode` BEFORE INSERT/UPDATE trigger derives it from `notify_mode`, so express intent via `notify_mode`; a contradicting `muted` is silently discarded. The table has **no table-level UPDATE grant** — clients hold `GRANT UPDATE (last_read_at, muted, pinned, notify_mode)` only, so **a new column is silently non-updatable until it is added to that list** (same trap as `ministries.timezone`).

**Calling**
`calls` (one row per call: `group_id`, `started_by`, `room_name` UNIQUE, `kind` audio|video (the RING's promise; the in-call surface follows the live tracks instead), `status` ringing|active|ended, `end_reason`; composite FK to `groups(id, ministry_id)`; partial unique `calls_one_live_per_group` on `status <> 'ended'`; CHECKs `calls_ended_shape` / `calls_active_shape`), `call_participants` (`state` joined|declined|left, composite FK to `calls(id, group_id, ministry_id)`). Both SELECT-only for `authenticated` — every write is `app/actions/calls.ts` on the service-role client. Helpers: `can_start_call(group, user)` / `auth_can_start_call(group)` / `is_admin_or_leader(user)` (which `auth_is_admin_or_leader()` now delegates to, so the role list exists once in SQL). Triggers: `broadcast_call_change` (realtime ring) + `notify_call_started` (push, `WHEN status='ringing'`). See Convention #29.

**Announcements & Forms**
`announcement_forms`, `form_fields`, `form_responses`, `form_answers`

**Journal / Devotionals**
`devotionals`, `prayers`, `verses`, `home_verses`

**Events & Calendar**
`calendar_events`, `event_plans`, `event_tasks`, `event_notes`, `event_roles`, `event_new_folks`

`calendar_events.start_date`/`end_date` are `timestamptz` holding **true instants** (Convention #23). All-day events additionally carry `start_day`/`end_day` (DATE, NULL when not all-day) — those are the TRUTH for an all-day event, and `end_day` is **INCLUSIVE** (RFC 5545 DTEND is exclusive, so the ICS writer emits `end_day + 1`). `event_tasks.due_date`, `event_plans.plan_start_date`/`crunch_date` are DATE columns and tz-immune.

**Run Sheet (P1 — trigger engine + confirmations)**
`event_confirmations` (tap-to-confirm reliability signal; polymorphic `subject_type` `role`|`block`; RSVP-style own-row respond restricted to `status`∈{confirmed,declined} via column grant; INSERT/DELETE gated by `can_plan_events`; `AFTER DELETE OR UPDATE OF assigned_to ON event_roles` trigger `cleanup_role_confirmations()` drops stale rows on role delete/reassign), `notification_ledger` (per-`(subject,offset)` idempotency for cron-fired pings; RLS-on/**zero-policy** — service/cron only). Scheduled fn `run_sheet_tick()` (pg_cron, hourly `5 * * * *`, self-gated to the 9–10am PT window) fires task-due nudges (`due_tomorrow`/`due_today`), auto-creates + pings T-2 role confirmations, and escalates 24h-silent confirmations to `event_plans.created_by` — all idempotent via `notification_ledger`.

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
`budget_categories`, `budget_entries` (+ `fund` slug and `receipt_allocation_id` — UNIQUE, same-ministry composite FK → `receipt_fund_allocations`; the reimbursed-split→ledger "posted to budget" bridge. Allocation Spent aggregates ledger entries per (category, fund) over the Jun 1–May 31 fiscal window), `ministry_budgets`, `finance_funds` (per-ministry funding sources — Church/Pitt/CMU for Central; drives allocation grid columns AND reimbursement splits), `receipt_categories` (per-team; deletable — `receipts.category_id` is ON DELETE SET NULL), `receipts` (+ `team_id`/`category_id`/`signed_off_*`/`decision_reason`; `status` = bottleneck rollup of its splits: pending → approved → requested; reimbursed/rejected/partial when terminal), `receipt_fund_allocations` (per-fund splits, each with its own lifecycle + `reviewed_at`/`signed_off_at` dates), `receipt_limits`, `ministry_giving`. (`reimbursement_forms` = the **retired** DG-dinner flow — code removed, table orphaned, data kept.)

**Team management**
`meeting_notes`, `team_role_links`, `team_role_descriptions`

**Ministry admin**
`user_ministries`, `ministry_schools`, `ministry_bans`, `ministry_departures`, `audit_logs`

**Profile trigger:** `handle_new_user()` fires `AFTER INSERT ON auth.users` and auto-creates a `profiles` row. `ministry_id` is NULL until the user joins a ministry via `/ministries`.

**Ministry approval:** `approveMinistry` (founder-email-gated, in `app/actions/ministry.ts`) activates the ministry, creates the onboarding workspaces, seeds `ministry_schools`, and seeds starter content — a pinned welcome announcement + a "Leaders" church chat with the founder (idempotent; seeding failure never blocks approval).

**Super-account DB gate:** `is_super()` (SECURITY DEFINER) returns true only for the super account's UUID — used by super-only carve-outs; never role-based.

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
| Member profile overlay (global) | 130 |
| Emoji dismiss overlay | 155 |
| Emoji picker | 160 |
| Action menus (`ActionMenu` portal) | 200 |
| Modals (`CentralModal`) | 200 (override e.g. 210 only to stack above another overlay) |
| In-app message banner (`MessageBanner`) | 240 |
| In-call panel (`CallOverlay`) | 250 |
| Incoming call (`IncomingCall`) | 260 — a ringing phone a modal can bury is a missed call |
| Mobile bottom sheet (`PocketSheet`) | 200 |

## Layout Rules
- **Mobile container:** `max-w-[390px] mx-auto` — always, never full-width on mobile views.
- **Full-screen overlays:** `fixed inset-0 z-[N]` outer wrapper.
- **Overlay inner:** `max-w-[390px] mx-auto w-full h-full flex flex-col`.
- **Safe area:** the app shell root owns `env(safe-area-inset-top)` (`home-app.tsx`), so everything mounted inside it is already inset. A **shell-escaping** overlay (`fixed inset-0` — ChatScreen, chat settings, create-chat) escapes that padding and must add it itself, from `components/central/pocket.tsx`: `POCKET_OVERLAY_PAD_TOP_CLS` (inset + the standard 12px) when the element IS the chrome row, `POCKET_OVERLAY_INSET_CLS` (inset ONLY) when the overlay HOSTS a chrome component that already owns its 12 — applying the full pad at both levels stacks them. **Never a hardcoded floor.** The old rule here was `pt-12`, which became `max(env(safe-area-inset-top), 48px)` in three hand-typed copies: wherever the inset reports 0 (browser, simulator, notchless device) chat opened 36px lower than every other screen — the one place the app visibly broke its own chrome rhythm (Convention #27).
- **Scrollable pages:** never add bottom padding for the nav. The shell's sole scroll region (`.shell-scroll`) owns it via `--nav-clearance`, derived from the pill's own geometry in `bottom-nav.tsx`; a page adding its own double-counts (that bug cost ~190px of dead scroll). Desktop resets it to 0.
