# Design pass · Batch 10 — The system, taken apart

The whole app as one thing. Nine networks reviewed, 247 screens at two widths, populated and empty, across five roles; every design-system claim in the earlier batches checked against code (about 300 confirmed, a dozen corrected, none refuted after re-capture). This batch does not add findings — it says what the findings add up to, proposes how the system could be re-cut, and consolidates every rule the pass wants written or rewritten into one list you can ratify.

---

## The short version

You built Central by asking "who owns this?" and your users open it asking "what's happening?". That one mismatch is underneath almost every structural complaint in the nine batches — it is why Plan is a tree of teams when the work is an event, why Messages files rooms by who created them, why Church Settings is sorted by database table, why money has three doors, and why an event has nine homes and no primary. None of the rooms is badly built. They are keyed on the wrong axis for the person walking in, and each room chose the axis independently, so the app has five grammars instead of one.

The second thing the pass found is more hopeful: **your phone already has the better information architecture.** The mobile hubs name sections by job ("Calendar — everything scheduled", "Meeting notes — agendas & recaps"), Church Settings on a phone groups into Ministry / Operations / Records, the Directory and Profile v2 are the calmest screens in the product, and the volunteer's "You're on" list is the only event-first surface you have. Desktop got the features; the phone got the thinking. Most of what B10 recommends is "promote what the phone already does to the whole product."

The third is the one I'd act on first, because it needs no reorganisation: **several of the app's headline readouts are not true.** "Ready · 100%" with nobody confirmed; "Reimbursed" before any money moves; "End-to-end" under every chat; a draft announcement that says POSTED · 18 views; a fund card whose biggest number is the wrong one; a settings confirm modal that computes the exact change and an audit log that never records it. A product for people who are bad at planning has to be a product whose green means green. Those fixes are small and independent, and they should land before any re-tree.

**Recommendation, in order:** (1) the truth fixes; (2) the disclosure split — every hub shows the *doing* plane, set-up goes behind one row, and the five real event presets open in the create chooser; (3) the "same doors in every room" pass, so a leader's mental model survives moving one room over; and only then (4) let time become the spine — Home as what's happening, Plan as Up next / Calendar / Money, events as Before / Day / After. Each step is worth shipping alone; each makes the next cheaper. The amendment package in §5 is written so that steps 1–3 don't create new drift while they land.

---

## 1. The system you built without meaning to

Central has one visible grammar — the map in Batch 0: room → section → sub-tab → drill, creates in the body header, settings behind Save, hub-and-spoke on the phone. Under it there are three organising principles competing for the same screens, and which one wins was decided room by room.

**Ownership-first (the spine).** Things are filed under whoever owns or created them. Plan is a list of teams; inside a team, sections; inside a section, the events. Messages splits by who made the room (Church / Mine / Open) before what it is for. Church Settings groups by which table a control writes to. Receipts is a second tree over the same teams. Finance is a team. This is the structure that was cheapest to build on a multi-tenant, RLS-scoped schema — every object has an owner column, so ownership is always a free key — and it is the structure the desktop carries almost everywhere.

**Object-first (the drills).** Once you're inside, the app is object-centric and consistent: an event workspace, a member sheet, an announcement detail, a receipt detail, a chat. These are the best-built surfaces. The problem is above them — the object rarely has a *primary* home. An event appears in nine places (Batch 0 §4) and none is canonical; a person is rendered by two unrelated components that agree on nothing (B7); a receipt is submitted, approved and posted in three rooms that don't link (B8); a DG group is made in one workspace and read in another, on one width only (B1).

**Job-first (the phone).** When a screen had to fit 390px, it was re-thought as "what does this person come here to do" — and those screens are the good ones: the workspace hub, the Settings hub, the volunteer list, the Directory, Profile v2, the announcement feed. Job-first appears wherever a hub was written; it never made it back up to desktop, where sections still carry table names ("General", "Workspace", "Countdown", "Timed blocks").

The implicit rule, stated plainly: **Central is organised by ownership and used by time.** A sophomore's question is "what's on Friday, am I on it, where do I ask?" — a when/what question. The app answers "which team are you on?" first, every time.

## 2. Where it fights itself

Eleven cross-cutting patterns. Each one shows up in at least three networks; the batch references are where the evidence lives.

1. **Ownership-keyed trees, time-keyed work.** Plan by team (B1), Messages by creator (B6 §3b), Settings by table (B3), money by three doors (B8), Home ordered by build sequence (B4). The user's axis is never the first cut.

2. **Two IAs, one product.** The phone has job-named hubs, grouped settings, a single-column profile; desktop has feature-named strips, an eight-tab settings row, a two-face person. Sections exist on one width only (SGL Home, B1), and desktop tells you to use tabs that aren't on your screen. Announcements and Messages are the two rooms where the widths agree — and they're the two rooms people like.

3. **Doing and setting up were never separated.** The countdown ladder sits inside the create modal (B1/B2); permissions, governance, categories and allocation sit beside the daily work (B1, B3, B8); Curate sits on the hero (B4); Compile is a permanent card on every past event (B2). Overwhelm in Central is not feature count — it's that nothing is ever put away.

4. **Readouts that lie.** Ready = tasks only (B2); Reimbursed = signed off, not paid (B8); "End-to-end" (B6); a draft that reads POSTED (B5); spend at 28px, remaining at 13px (B8); "Off by default" beside an ON toggle, and an audit log that records nothing Settings changes (B3). Each one is small; together they mean the product's summary line can't be trusted, which is fatal for the non-planner it's for.

5. **The member sees the leader's console.** Byte-identical event spokes with Reassign and "Nudged 2×" (B2); views and ack tallies on a member's card (B5); a member's Home opening on 29 backlog rows (B4); a complete leader-tier Settings variant that can never render (B3). There is no "what's mine" tier anywhere except the volunteer workspace — which only ships to people with no workspace.

6. **Objects with many homes and no primary, and the links that were never written.** `linked_announcement_id` is read in four files and written in none (B2), so an event can't announce itself; a receipt can't find its event (B8); the chat modal can't reach the Directory sheet (B7); the setup checklist points outside Settings for a Settings control (B3). The homes multiply because nothing connects them.

7. **Names decide behaviour.** Workspace kind is a regex over the team's name (B1); church-chat creation is a regex over team names in the UI and leader-tier on the server (B6); "Workspace" means a Plan team on the rail and a Settings tab three inches away (B3); the tenant is a "church" on one screen and a "ministry" on the next (B9). Naming is doing structural work that should be a stored field or a permission.

8. **The compact rail deletes the second level.** Church Settings, the Directory list, the conversation list, Journal, Sign out — all live only in the context panel, so one toggle removes them (B4, B6, B7). The palette that should rescue it hard-codes six stale destinations.

9. **Desktop primitives mounted at phone width.** The create sheets (B1), every Settings drill (B3), Curate/Share (B4), the form builder and who-hasn't-acknowledged (B5), five People screens (B7), the split cards and submit sheet (B8), the whole entry network (B9). It is one sweep, not nine fixes — and it's the reason "the phone is better" is only true one tap deep.

10. **A private type ramp per room.** 196 half-pixel sizes (B1 §4.9, B2, B5–B9); four to five section-header tiers per network (B1 §4.3, B3, B4, B7, B8); weight 600 on list rows (B4); the retired 36px tier still in use (B1 picker, B7 member name); the chat panel at 13/11.5/9.5/8.5/6 (B6). The contract exists; the code has a second one.

11. **Token substitutions that became habits.** `--line-2` as a fill (B1, B3, B6); solid plum as a selected state (B1 §4.4, B5 ×6, B6 reaction pill); danger/plum at invented 7% tints (B2); a Material green and a hardcoded panel hex (B5); a toggle-off track with two values and a comment saying no token exists (B9).

Two things the pass did **not** find, worth saying so you don't fix them: the visual language (cream, ink, one plum, serif titles) is intact and recognisable on every screen including the broken ones — nobody strayed from the palette; and the phone shell (pill, chrome rhythm, gutter, chevron/edge-swipe) held on every screen the sweep reached. The system's *look* is coherent. Its *structure* is what drifted.

## 3. Three ways to re-cut it

Each option is whole on its own. They are ordered by how much they move; my recommendation is the sequence at the end, not a single pick.

### R1 — Time is the spine

Re-key the top level of every room on *when*, with ownership demoted to a filter or a badge.

- **Home** opens on what's happening: the next event, the newest announcement, the rooms with unread — with a capped "yours" strip (3–5 deadlines, "See all"). Newcomers get a welcome block that retires itself the way the admin checklist does.
- **Plan** becomes *Up next · Calendar · Money* for everyone; teams become a "Teams" list holding roster, roles, notes and guides — the volunteer's "You're on" map is the default landing for anyone.
- **The event** becomes *Before · On the day · After* — the `eventPhase` field already stamped on every ladder rung is the mapping; Overview dissolves into a header band with one readiness line and one next action.
- **Messages** sections by purpose (Ministry · My groups · Direct · Events) with ownership as a row badge; planning rooms stop being filed under "Teams".
- **Church Settings** opens recurring-work-first (Waiting to join · Reports · People · Audit) then configuration, one scrolling page with a pinned index.

*Fixes:* the ownership/time mismatch at the root, duplicate homes, the member tier (a time-keyed Home is naturally "yours"), and most overwhelm.
*Costs:* the largest refactor in the set — Plan's picker, the event tab strip and the chat scopes all change shape; roster-shaped work (DGL availability, rotations, Bible study) doesn't fit a time frame and needs an honest "Our people" exception; every deep link changes.
*Who it hurts:* presidents who like their room, briefly; nobody structurally.

### R2 — Same doors in every room

Keep ownership as the spine; make every room obey one grammar so the model survives moving one door over.

- **Every workspace has the same four doors, both widths:** *What's coming · Our people · Our notes · Our money*. Team kind changes what's inside, never the doors. SGL Home lands in "Our people" and exists on desktop; each team's receipts live in "Our money" and the Receipts side-tree goes away. Bible study is an honest fifth door for DGL.
- **One event tab set re-cut by job:** *Plan · People · The day · Details* — mostly re-parenting; the strip carries the live counts the phone hub already shows, so the desktop Overview and its divergent launchpad are deleted.
- **One Church Settings page** with the phone's Ministry / Operations / Records index promoted to desktop, and a search over control labels.
- **One member record at two sizes** (the chat modal is the Directory pane in a smaller frame); **one calendar** (the ruled grid + agenda, with a create); **one create shape** per collection; **one settings commit grammar** (staged behind Save, tiered confirm, always audited).
- **Forms folds into the composer**; **Congregation lands results-first**.

*Fixes:* teachability, the two-IA problem, the width-only sections, most of the design-system drift (because it's driven by "each room invented its own"), Receipts as a second tree.
*Costs:* medium — mostly re-parenting existing branches and deleting duplicates; does not fix the ownership/time mismatch or the member tier by itself.
*Who it hurts:* nobody; small teams show two thin doors.

### R3 — Run it / Set it up

Leave the tree alone. Split every surface into a *doing* plane (what's on screen) and a *set-up* plane (behind one row), and fix the readouts.

- Every hub and workspace shows only the doing plane. One "Set it up" row holds: the countdown ladder editor, roles & permissions, categories, fund allocation, group generation, season rollover, Curate, Compile, governance.
- Quick-path event creation is title + date + place; the ladder is already right for the horizon and lives inside the event behind "Adjust the planning schedule".
- **The five real presets open in the create chooser** — the one-line change that turns your best asset from dead data into the product's best feature.
- **Ready means tasks done and roles confirmed.** Confirmation state is the headline on Roles and the hub.
- A "yours" default on event spokes for non-leads; chase copy and Budget leader-only.
- Home caps deadlines; Featured is purely curated.

*Fixes:* overwhelm directly, the non-planner path, most of the "readouts that lie", the member tier on the surfaces that matter most.
*Costs:* cheapest by far — additive, no re-tree, no deep-link changes.
*Who it hurts:* nobody. It fixes none of the duplicate homes and leaves the two IAs in place.

### The sequence I'd run

**R3, then R2, then R1 as the direction the app grows in.** R3 is a month of surface work that makes the product honest and shallow for the person it's for. R2 is the structural pass that makes it teachable and cuts the design-system drift at its source, and it composes with R3 (the set-up row is the fifth thing behind every door). R1 is where the product should end up, and by the time R2 has landed, "time becomes the spine" is a re-labelling of doors that already exist rather than a rewrite. Doing R1 first would be building the right house on the current readouts.

Independent of the sequence, six things should not wait for any of it:

| # | Fix | Batch |
|---|---|---|
| 1 | Ready = tasks done AND roles confirmed; Declined never counts as covered | B2 |
| 2 | Open the five real presets in the create chooser | B2 |
| 3 | "Reimbursed" is a step the submitter (or treasurer) confirms; every ladder node carries a date | B8 |
| 4 | Rewrite the composer footer ("Visible to everyone in Tuesday Night DG"); add Copy; church-chat creation becomes a real permission | B6 |
| 5 | Drafts get a real state (no telemetry, one "Continue editing"); members don't see views/ack tallies | B5 |
| 6 | `ministries.timezone` gets an editor; every committed Settings change writes to the Audit Log | B3 |

## 4. What the phone already knows

Because so much of the recommendation is "promote the phone", here is the list of things the phone does right that desktop doesn't — each is a pattern to lift, not a screen to copy:

- Section rows with a plain-English subtitle (the workspace hub, the Settings hub) → desktop section labels.
- Ministry / Operations / Records grouping → the desktop Settings index.
- The event hub with live counts on each door → the desktop tab strip, replacing Overview.
- The volunteer "You're on" list → everyone's Plan landing.
- Profile v2's tap-to-edit, commit-on-blur, completeness meter → the member sheet.
- The Directory's flat rows and MEMBER-less scanning → the desktop directory pane.
- The ruled grid + agenda calendar → the only calendar.

And three things the phone is missing that desktop has, which the sequence above should close rather than accept: Forms and Congregation have no phone entry point (B4); the eight Settings sections have no mobile form (B3); Allocation is read-only on a phone and doesn't say so (B8).

## 5. The design-system amendment package

Everything the nine batches asked to be written down or changed, deduplicated and grouped so it can be ratified as a block or line by line. "Doc moves" means the code is consistent and the contract should describe it; "code moves" means the contract is right and the code should snap. Where a batch's call was refined by verification, the refinement is noted.

### 5a. New rules — patterns that recur ≥3× with no spec

| # | Rule | Evidence | Where it goes |
|---|---|---|---|
| N1 | **The section content-header tier.** A body section opens with a 19/500 sans title, optional mono eyebrow above, optional 13px meta, and hosts the collection's create at its right. This is the L2 tier between the page title and the H2; today it renders at 21/19/19/15 in Finance and 20 (×17 overrides) in Settings. Ratify 19/500 and snap the others. | B1 §6, B3 §5, B7 §3, B8 §2 | web §3.2 / §7.5 |
| N2 | **What the context panel holds at each level.** It is a *section nav* (Home, Settings), a *workspace switcher* (Plan), a *scope filter* (Receipts) or an *object list* (Messages, People) — under one "SECTION" label with no cue. Name the four and give each a visible difference; and the master/detail row is one component (`PanelRow`), not four implementations. | B1 §6, B4, B6 §3, B7 | web §4 |
| N3 | **Phone chrome creates.** The round "+" is the unlabelled create for a screen with one obvious collection; a labelled plum pill is required when the verb isn't obvious ("+ Generate", "+ New semester"). Never two plum creates in one chrome/body. | B1 §4.2, B8 §1 | mobile §3 |
| N4 | **The mono eyebrow is a section header.** On phone hubs and on identity/settings/form pages, a standalone 10px mono kicker with no H2 under it *is* the L3 section header. A kicker names a section, never the screen; a screen with one section has no kicker. | B3 §5, B7 §3, B1 §6 (SglSH) | mobile §3, web §3 |
| N5 | **The settings commit grammar.** Settings surfaces stage behind Edit → Cancel/Save (Convention #21) — and: Save is sticky on bodies taller than the viewport; a control in read mode is visibly inert and its tap routes to Edit (on both widths); confirm is tiered by consequence (reversible toggles commit with an undo toast; identity, discovery, join codes, archive keep the change-summary confirm); every commit writes to the Audit Log. *Verifier note:* Funds is staged (B3 overstated "instant"); Sharing saves directly, and only five of six staged scopes carry the confirm — so the current state is three grammars, not two. | B3 §3/§5, B1 §4.6 | web §7.5 + CLAUDE #21 |
| N6 | **One selection grammar.** A selected item is `--plum-tint` ground + plum text + plum hairline, never solid plum. "Pick one of N" is a `SegmentedControl` for ≤3 options and a picker for 4+; never filter chips, never clickable stat tiles. | B1 §4.4, B3 §3, B5 §2, B6 §2 | contract-card, mobile §4 |
| N7 | **No section on Home is an unbounded list.** Each shows at most N rows and a "See all" into its owning tab. | B4 §3 | web §7.x Home |
| N8 | **A mobile overlay or sheet hides the pill nav.** The rule exists in prose; bind it to `PocketSheet`/`CentralModal` at phone width. | B4 §2, B5 §2 | mobile §0 |
| N9 | **Status is tonal; plum is role-only.** Status tags (draft, submitted, confirmed, declined, reimbursed) use the tonal default; plum marks *you* / *yours* / participation. Declined is never quieter than Confirmed. | B5 §3, B2 §4, B6 §3 (reaction chip) | contract-card |
| N10 | **The detail aside module.** Kicker → anchor → action → meta, stacked; at most one plum primary per aside, chosen by what is still owed. | B5 §3 | web §4 |
| N11 | **Destructive actions.** Text or outline, sized to the label, never sharing a width class with the primary; no one-click permanent delete on a row — `ConfirmDialog` or undo. | B8 §3, B2 §4, B5 §2 | contract-card §14 |
| N12 | **One `formatMoney()`.** Always grouped, one sign convention, never `$-`, tabular numerals, never truncated. | B8 §3 | web §1.4 |
| N13 | **Disabled primary.** A tokenised 50% plum fill (not opacity) with a one-line reason beneath; one validation grammar per funnel — a danger ring never appears without its own message. | B9 §3 | contract-card |
| N14 | **The split-shell title block** (eyebrow → 44 serif ending in a period → 16 subtitle) becomes `AuthHeader`; pre-shell phone screens use the Pocket ground rules even without a chrome row. | B9 §3 | web §7.8 |
| N15 | **The "choice row" card** (icon tile · title · sub · chevron · whole card tappable) is one component. | B9 §3, B1 §4.11 | components |
| N16 | **The segmented progress meter and the launchpad row** are named components with one instance each per screen — never a segmented meter 200px from a continuous bar. | B2 §4 | web §4 |
| N17 | **The chrome names the object when the section is deep-linkable.** A spoke reached from a push must show which event/receipt/person it belongs to — either in the chrome or as the first body line — never a bare section name. | B2 §4b | mobile §3 |
| N18 | **Editorial fields.** Long-form phone inputs (compose headline/body, form builder labels, option rows) are borderless-on-page with a hairline rule; the ivory input stays for short fields. | B5 §3 | mobile §4 |
| N19 | **Own-profile screens commit on blur** with no edit mode at phone width; staged-Save applies to settings that affect other people. | B7 §3 | mobile §5 |
| N20 | **The plum-dot section label** (hero, pulse eyebrow) is either retired or given a constant — it is currently a third eyebrow grammar. **Text-shadow** on cream-over-photo captions is allowed as a legibility device and nowhere else. | B4 §3 | web §1 |
| N21 | **The lifted-message material** (blur scrim, z 170) gets a line in the Z-index table and the mobile doc. | B6 §3 | CLAUDE Z-index |
| N22 | **Type sizes are integers.** Round the 196 half-pixel sites once and add a lint. (The alternative — ratifying a half-step scale — is on the decisions list; I recommend against it.) | B1 §4.9, B2, B5–B9 | contract-card + lint |

### 5b. Doc changes — code is consistent, contract should move

| # | Change | Evidence |
|---|---|---|
| C1 | Mobile §2 token table: `--muted-text` / `--faint` to the post-AA hexes; add `--success`. | B1, B4, B6, B9 |
| C2 | `PageTitle` defaults to 44 and every tab root uses it; record it, and name the 44px greeting as the front-door exemption or bring it to 25. | B4 §2, B7 §3 |
| C3 | `--ivory` is chat's inset surface (bubble, composer pill, reaction bar, reaction pill, "Seen by", poll) — rewrite web §4.15/4.16. The member-derived avatar cluster replaces "every chat is the same plum monogram" — rewrite §5. | B6 §3 |
| C4 | Profile v2 is the recipe (identity on page, 88px avatar, tap-to-edit, completeness meter, verse band); rewrite mobile §5 Profile and migrate the member sheet to it. Keep the name at 21. | B7 §3 |
| C5 | Landing §7.8 describes a page that no longer exists — rewrite from the shipped landing and declare that it runs its own display scale. | B9 §2 |
| C6 | Mobile §5 Automations: single-column switch cards with a one-line explanation, not two columns. | B3 §5 |
| C7 | The mobile Settings hub's Ministry / Operations / Records grouping is the canonical Settings taxonomy on both widths. | B3 |
| C8 | Cards around tap-through rows: either commit the flat-row pass across Plan/Receipts as one task or record the exception — the "follow when touched" list has produced no movement. | B1 §6 |
| C9 | §11.13 grouped-list creates: decide whether a section-rule create is allowed when groups derive from dates (Sub-events) or every group gets an add row (Countdown, Run of Show do this right). | B2 §6 |

### 5c. Code changes — contract is right, code drifted (one sweep each)

| # | Sweep | Sites |
|---|---|---|
| K1 | **Desktop primitives at phone width** → `PocketSheet`/Pocket pills/`PocketSwitch`: create sheets (B1), Settings drills (B3), Curate/Share (B4), form builder + who-hasn't-ack'd + form fill (B5), five People screens (B7), split cards + submit sheet (B8), the entry network (B9). | ~20 surfaces |
| K2 | **Solid plum as selection/status fill** → tint + text + hairline (N6/N9). | B1 ×2, B5 ×6, B6 ×1 |
| K3 | **`--line-2` as a fill** → `--pocket-track`. | B1, B3, B6 (7) |
| K4 | **Weight 600 on 15px list-row titles** → 500. | B4 (three components) |
| K5 | **Long-form announcement body serif on desktop**, per §1.3. | B5 |
| K6 | **Ghost creates in the collection slot** → plum (the doc is right; "ghost for sub-collection adds" is a habit, and Settings has the accent fully inverted). | B1 §6, B3 §3 |
| K7 | **Retired tiers still in use:** 36px titles (picker, member name), `PocketBackRow` (Congregation — delete the component), the 15/plum back-label, the desktop-only `locked` on switches. | B1, B7, B3 |
| K8 | **Raw browser controls:** 22 `<select>`s in the event workspace, native date/time masks in creates and the composer, browser checkboxes in the form builder. | B2, B1, B5 |
| K9 | **Off-palette values:** `#2E7D32`, `#F8F4EA`, `#D6D0C0` ×2, `rgba()` ×3, 7% danger/plum tints, the Tailwind rainbow in the note editor. | B5, B9, B2, B7 |
| K10 | **Chrome rhythm escapes:** Receipts hub/category and the compose chrome hand-type a top pad (29–30px titles); the sweep never reaches them — extend the sweep, don't widen the band. | B1 §4.10, B8, B5 |

## 6. Empty states — the first day

A second tenant with nothing in it — the ministry, two users, no teams, no events, no announcements — was captured on both widths and reviewed screen by screen (138 captures). The mood is right everywhere: cream, serif, calm, not a dashed box in sight but one. What's wrong is what the empty product *teaches*.

**A pastor's first day.** Home is the one screen that knows it's new — the Getting-started card sits on top — and then the card asks for three things the empty app doesn't need (invite, announce, offering) and omits the two it does (a first team, a first event). Its first item can never tick: it reports "3 members so far" and stays at 0 of 3 forever. Under it, the Featured mat says "No upcoming events — See announcements", and Announcements says "post the first one", so the two biggest empty screens point at each other. Then Plan: on a tenant with no teams, **every destination in the Plan network — fifteen on desktop — renders the same page: "Receipts · No teams yet. Join or govern a team to start tracking receipts."** The admin, the only person who can create a team, is told to *join* one, under a heading about expense receipts, with no create control anywhere in the tab. The biggest room in the product is a wall with the wrong sign on it. Church Settings is where he can actually get somewhere, and there the empty states come in four grammars on one tab (a grey sentence with the action in a greyed header button; a mat with a plum button inside; a mat with a text link *and* a duplicate header button; a bare sentence with no action at all), plus "Drag to reorder" printed above a list with nothing in it.

**A student's first day** is shorter and better. She lands on a mostly-beige Home, an empty deadlines block that says "You're all caught up" (she has never had a deadline), and a Plan tab whose empty state is the best in the product: *"Nothing assigned yet. When a leader puts you on an event, it shows up here with your role, your tasks, and the plan for the day."* Written to her, teaches what the screen becomes, asks nothing of someone who can do nothing. It should be the template.

**One phone-only break worth naming:** the mobile announcements empty state says "post the first announcement with *New announcement* above" — on a phone that control is an unlabelled + circle.

Three things confirmed in code: the Plan fallback is the Receipts workspace's own empty state; the checklist is exactly invite / announcement / offering with the invite item flagged by hand; the two Featured empty copies are two separate strings, and the phone's (no dead-end button) is the better one.

**Rules this adds to §5** (the reviewer counted thirteen distinct empty-state treatments for one product state; the house style — icon tile · title · one teaching line — already covers five screens and works):

| # | Rule |
|---|---|
| N23 | **The empty-state contract.** Icon tile · a title naming what's missing · one sentence that teaches what this screen becomes · one action the *current role* can take, rendered as a button *inside* the state. Never name a control in empty copy; role branches the copy, not just the button; filtered-zero names the filter and offers a reset; "You're all caught up" is only for someone who once had something. |
| N24 | **Zero-valued chrome doesn't render.** Counters, stat tiles, filter chips, sub-tab strips and eyebrows reading 0 / None are suppressed while the collection is empty (six sites; the phone already does this in three of them). |
| C10 | **Settings-section empty states converge on one grammar** — mat + sentence + in-mat plum action — and a section's header "+ Add X" is hidden while the section is empty (the mat owns the first add). |
| K11 | **Plan gets a real zero-team landing** for leader tier (what a workspace is, the three presets, one plum "Create your first team"); no deep Plan URL resolves silently to a different screen. The admin's "No teams yet" moves onto the house empty-state component. |

And two decisions that only you can make, added to §8: whether Plan should self-serve team creation on day one or keep it a governance act; and whether giving belongs on the day-one checklist at all.

## 7. On the phone itself

The iPhone build was pointed at this session's server and launched on the simulator. Two things the browser rig could never have shown:

- **The app has an eleventh front door the audit never inventoried.** The native shell opens on its own welcome screen — the C mark, "Central / One home for your ministry.", a Psalm, then Continue with Apple / Google / email and a "Create an account" link — a screen that exists nowhere on the web. It is quiet and correct and, unlike the web landing (B9), it is *already* the student's door: the two ivory buttons and one plum button are all "sign in", there is no pastor pitch on it. It does not carry the ministry's identity either, but for an installed app that is the right call — the ministry arrives with the invite link. Worth recording in the map and in the doc (§7.8 has no native section); it is also the only screen in the product with a vertically centred hero on a phone, and here it works because there is nothing to scroll to.
- **The safe-area, keyboard and edge-swipe checks need a signed-in phone,** and the simulator can't be driven past the sign-in screen from here without granting the terminal accessibility control of your Mac — which I didn't do on my own. The build is installed and pointed at the audit tenant; the offer is at the end.

Everything the browser rig could measure about the phone shell held: the chrome rhythm, the single gutter, the chevron/edge-swipe pair, the pill nav, on every screen the sweep reached (the exceptions — Receipts, compose, Congregation's two subpages — are in K7/K10 above).

## 8. Decisions that are yours

The batch-level decisions (B1–B9, ~70 of them) stay where they are; these are the ones only the whole picture can settle.

1. **The sequence.** (a) R3 → R2 → R1 as above. (b) R2 first — teachability before disclosure. (c) R1 now — one large redesign rather than three passes. (d) Truth fixes only for now.
2. **The spine, long-term.** Is Central organised by *time* (R1) or by *ownership* with consistent doors (R2 as the end state)? This decides what Plan's landing is for a sophomore in a year.
3. **Ratify §5 as a block, or line by line?** If as a block, the two items I'd pull out for a separate look are N22 (integer type — a 196-site sweep) and C8 (the flat-row pass — it changes how every list in Plan looks).
4. **Does a member tier exist in Central?** Today the answer is "no, except the volunteer workspace." R1 and R3 both assume "yes." If the answer is "everyone on a planning team is a planner," strike the member-tier items from R3 and B2/B5.
5. **Plan on day one.** (a) A "Create your first team" landing for leader tier — Plan becomes self-serve. (b) Team creation stays in onboarding and Settings; Plan says "your leaders will set these up." Today it does neither.
6. **The day-one checklist.** (a) Create a team → add an event → invite leaders → post an announcement; offering moves to Give's own empty state. (b) Keep offering on it. (c) Keep as is.
7. **Which width leads?** The pass's evidence says the phone has the better IA and desktop has the features. Declaring phone-first for IA decisions (and desktop-first for density) would settle a dozen open questions in B1/B3/B7 at once.

## 9. How to look yourself

Nothing new to open — every claim here is a batch finding. The fastest way to feel the whole thing: on your phone as the sandbox member, Home → Workspace → Student Org Board → Fall Kickoff Night, and notice you have been asked "which team" before "what's on". Then as admin on desktop, try to find the church's calendar, the reimbursement cap, and who's in the E2E Sandbox Chat — three questions, three different trees.
