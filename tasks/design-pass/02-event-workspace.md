# Design pass · Batch 2 — The event workspace (N8)

Reviewed 2026-09-13/14 against the seeded E2E Sandbox, both widths, as a board president and as a member on the board. 43 desktop + 20 phone captures across seven event types incl. a Welcome Week container, 3 reviewers (desktop, mobile, information architecture), design-system claims verified in code. Screenshot evidence in the batch artifact.

---

## The short version

It is not too many features. Count them: tasks, roles, timed blocks, a note field, a turnout number, a budget, and four optional modules. That is a small feature set. What makes it feel enormous is that **one event is modelled three ways at once** — a checklist ladder, a staffing roster, and a schedule — each with its own tab, its own naming, its own completion metric, and none wired to the others. Four parallel spreadsheets sharing a title bar, on one flat plane of peer tabs, where nothing is ever put away.

Three things a first-time lead needs answered, and where the workspace answers them:

- **"What do I do first?"** — nowhere. The one "now" accent is a 3px bar on one task, one tab deep, competing with a red overdue bar above it. The Overview offers seven interactive regions and zero primary actions.
- **"What's optional?"** — nowhere, and actively obscured. Run of Show, Acts, Teams, Transport are all-or-nothing peers: a quarter of events need them and every event shows them. Five empty nights on a container timeline read as five accusations.
- **"Am I done?"** — wrongly. Readiness is computed from tasks only, so **Welcoming Night reads "Ready · 100%" with zero of seven roles assigned**, all seven Welcome Week nights are pilled "Ready" while every role is Unassigned, and a role whose holder **Declined** is filed under "Covered" and counted in 3/3. The system's headline answer is green when nobody has agreed to do anything.

And the finding that reframes everything else: **five of your seven event types cannot be created.** The create modal offers Quick social, Quick gathering, Start from scratch. Welcome Week, Coffeehouse, Turkey Bowl, Retreat and Appreciation Night — ~110 real tasks with real T-minus offsets distilled from CCSF's actual year, plus 32 role descriptions with provenance comments naming the meeting notes they came from — are dead data. The Welcome Week lead who most needs "here is what last year's board did in June" gets a blank checklist and a chip that says "Sub-events". Everything downstream (per-type extras, budget category auto-fill, the container model) is reachable only by guessing which chips to tick.

**Recommendation:** re-cut the four artifact-named tabs by job — *Plan · People · The day · Details* — relabel the T-minus rungs as plain time windows (*This week · Next week · Later · Day of · After*), and put the live counts the phone hub already shows into the tab strip so the desktop Overview and its divergent launchpad can be deleted. Grow that into a *Before / On the day / After* timeline later. It composes with Batch 1's four doors as the same move one altitude down: the ladder editor, the budget category, the extras chips and Compile are **set-up**, not **doing**, and go behind one "Set it up" row. Then two changes worth more than any re-tree: **open the five real presets in the create chooser** (a one-line change plus a chooser — it turns your best asset from dead data into the product's best feature), and **make "Ready" mean tasks done AND roles confirmed**.

One more fact: `linked_announcement_id` is read in four files and written in none. There is no path from an event to telling the ministry it exists, so the Overview's RSVP line can never populate from the app — inviting people, the single most important job of running a game night, has no door in the event workspace.

---

## 1. The event as built

**What one event carries, and who owns it:** facts (title/where/when — the edit-event modal is the only writer) · type (never displayed anywhere) · the countdown ladder (edited at the bottom of the edit-event modal, read as Countdown's section headers, never named on Overview) · tasks + subtasks (Countdown; echoed on the launchpad, the readiness card, the phone hub, Home's deadlines, the container roll-up) · roles + assignees (Roles; echoed thrice) · confirmations (Roles as status words + a ghost button; Countdown as mono chips; a cron that fires anyway) · timed blocks (Run of Show, headed "Timed blocks") · notes, turnout, RSVP-via-announcement, budget draws (Overview) · planning chat (the bottom of Roles) · type extras (one tab each) · template lineage (Compile, post-event only) · new folks (a table with zero UI consumers).

**Section set per type:** every event gets Overview · Countdown · Roles · Run of Show; Welcome Week adds Sub-events (+ three container roll-ups), Coffeehouse adds Acts, Turkey Bowl adds Teams, Retreat adds Transport. Only `social` and `ministry` are creatable.

**The same fact in two places:** on the phone the hub *is* the Overview — the Overview row leads to the same three facts again. Readiness is rendered five ways (hub, mobile Overview, desktop card, launchpad bar, Countdown rail). The desktop launchpad lists Countdown, Roles and the extras and **omits Run of Show**; the mobile hub has all four. "Jump into planning" silently drops a quarter of the planning.

## 2. Three leads, three walks

**Game night, three weeks out, desktop.** Picks "Quick social" (correctly). Scrolls past COUNTDOWN PLANNING without reading it — so the event silently gets the *Long* 4-week ladder for something 3 weeks away, and the first phase header will read "T−4 WEEKS" for a window that has already passed. Lands on Overview: About, two nav rows, a notes box, a budget card with three funds they've never heard of, a dial saying *Needs attention*. Nothing tells them what to do. Clicks Countdown because it has a progress bar; gets 8 tasks under five headers of T-minus notation and a folded vertical rail labelled AT A GLANCE. Never opens Run of Show — it isn't on the launchpad. The night arrives with no timing and nobody assigned to lock up. On the phone it's materially better: the hub gives three facts and four doors with live counts — but the top door, Overview, is a copy of the hub.

**Retreat lead.** Can't create a Retreat. Starts from scratch, ticks Transport, loses all 14 curated retreat tasks and 6 role descriptions. Run of Show day-groups across three days — genuinely good. Transport is a competent spreadsheet, but it sits parallel to the run of show when "arrive + cabin assignments, 17:00" *is* the transport deadline; the seat count and the arrival block can disagree forever.

**Welcome Week lead.** Also can't create the type. The container model is the strongest thinking in the network — the week stops competing with the nights and becomes a lens onto them — and it's where the workspace-per-event grammar collapses: the week has five sections; each of seven nights has four more. A 35-screen surface for one fortnight, entered through a chevron on a card. The staffing page uses two different assignment controls for the same job (ghost "+ Assign someone" for the week's roles, native dropdowns for the nights'). The task roll-up is seven lines of "All 6 done." with no drill. Eight sets of planning notes to maintain.

## 3. What is fighting what

1. **Density vs layering — it's the layering.** Nothing collapses when done (31 struck-through tasks, 3,150px); the decision-useful readouts default to hidden (the At-a-glance rail is a 24px strip of rotated text); the same job is drawn four ways inside one workspace.
2. **Tabs named after tables, while the lead thinks in time.** `eventPhase: pre_event | day_of | post_event` is already on every ladder rung and is used only to stamp a column. Before = pre-event rungs + roles + extras; The day = run of show + day-of rungs + confirmations; After = the after rung + Compile. Nobody drew the mapping.
3. **The ladder vs a due date.** Well-engineered, and it degrades the truth on screen: a task due Aug 8 on a Sep 22 event sits under a header reading "T−1 WEEK" with a row saying "OVERDUE · Aug 8". Keep the model; stop making the rung the primary grouping.
4. **Extras as tabs vs as content.** Acts has free-text sound-check *times* one tab away from the actual schedule. Teams and Transport are rosters attached to moments. Every extra is a detail of a block or a role, promoted to a peer because that was the cheapest place to put it — which is exactly the thing generating a new tab each time a type is added.
5. **The container as a second workspace** — right call, wrong cost. The week should be a console over its nights, not a fifth tab plus seven copies of itself.
6. **Compile / templates on the main path.** A permanent card on every past event for the three people who'll ever run a season handoff, while its payoff ("Run it back") is an invisible lookup at create time.
7. **Confirmations as a hidden lever.** The highest-value mechanic — did the person actually agree — lives in four disconnected places; nowhere does the workspace say "2 of 3 leads have confirmed". Instead the Overview says 3/3 assigned and the dial says green.
8. **The member sees the leader's console verbatim** — Edit event, Reassign, "Nudged 2× — no reply", a redacted Budget card — and has no view that answers "what's mine".

## 4. Design-system findings — by root pattern

- **One-click permanent deletes on every row** of Run of Show, Teams, Transport and Acts — *block*. A bare × with no ConfirmDialog and no undo, while the same pane raises a dialog for the far gentler "shift the later blocks."
- **22 raw `<select>` dropdowns** with hand-rolled styles (task assignee, role assign, act type, commissioner, driver, block owner, budget category) — *warn*. The highest-frequency controls in the workspace, rendering the OS chevron and font metrics; the shared `Select` is imported in the same file.
- **Three create shapes for grouped lists** — *warn*. Countdown and Run of Show put an add row at the foot of each group (correct); Roles offers one "+ Add a role" for a two-group list and leaves the "Needs someone" group with no add control; Sub-events puts a plum button on the section rule so a lead can't tell which day a night lands on — and the component doc currently authorises that exception.
- **Declined is the quietest word on the page** — *warn*. "Declined" in muted text, "Confirmed" in plum; the two status maps disagree (plum on desktop, sage on mobile).
- **Danger and plum used as row fills** (7% tints, an invented strength beside the one sanctioned 12% surface) and **OVERDUE at weight 600** — a fifth 600 role on the pane.
- **Half-pixel font sizes are the norm** — 15.5 / 14.5 / 13.5 / 12.5 / 11.5 / 10.5 as three tiers of one list; 196 instances repo-wide, 40 in this file. Not drift — one person's eye applied 196 times. Either ratify a half-step scale or round once and for all.
- **Two undocumented patterns:** the segmented progress meter (5–6 rounded bars, plum → success at 100%, on Overview, sub-event rows and the hub) sitting 200px from a continuous bar on the same screen; and the launchpad/action row (icon tile + title + readout + chevron) that both navigates and fires actions with identical chrome.
- **Vocabulary is planner-internal throughout:** "T−4 WEEKS", "Auto-DM fires Mon", "Confirm-taps go out T−2 days", "Timed blocks", "Acts Lineup", "Pre-seeded:". Say the outcome.
- Small: Transport has no column headers (Acts does); an "Untitled block" phantom row persists in the run sheet and counts toward the total; the run sheet never shows when the night ends; the "9 confirmed" stat is the one number at weight 600.

## 4b. On a phone

- **The workspace never decided whether the chrome names the event or the section** — *block*. Four spokes put the section name in the chrome and lose the event entirely; the other four keep the event and render a desktop section header in the body — a second 21/600 header 47px under the first, which the mobile contract forbids. Deep-linked from a push, a lead on "Run of Show" can't tell which event they're looking at.
- **Run of Show is an editor, not a run sheet** — *block*. 37 controls above the fold; titles truncated to make room for a pencil and an unlabelled × that deletes a block instantly on a 24px target; the time demoted to an 11px sub-line; no "now" marker on any day but today; no way to jump to today on a three-day retreat. The layout that fixes it — a left time column — already ships one tap away in the container week timeline.
- **Member and admin see byte-identical screens on every spoke, and nothing marks "you"** — *block*. A volunteer gets the planner's dashboard: reassign controls, the auto-DM card, eleven tasks and three roles to scan for their own name, an empty budget card stamped "Treasurer only". Transport is the extreme — 30 live form controls, no read mode, an × beside your own name, and it never says the departure time.
- **The add-task row runs off the right edge at 390px** so Add is unreachable; the container countdown unrolls to 8,884px of mostly struck-through history before the roll-up it exists for; two facts-grid implementations disagree on alignment one tap apart; the hub's top door (Overview) is a copy of the hub.

## 5. Reframe options

**A — Before / On the day / After (timeline-first).** Three tabs named for when; Overview dissolves into a header band with one readiness line and one next-action line. Fixes "what first" and "what's optional" outright; largest refactor; the container needs a fourth "The nights" door.

**B — One plan page, progressive disclosure.** Kill the tab strip on a leaf event: facts → NOW → the ladder → who's on it (with confirmation state) → the day's timing → optional modules collapsed with "Add transport / performances / teams". Desktop stops being a different IA from the phone. Long for a Welcome Week; loses per-section deep links.

**C — Keep tabs, re-cut by job (cheapest).** *Plan* (Countdown, rungs relabelled to plain windows) · *People* (roles + confirmations + planning chat + transport/teams) · *The day* (Run of Show + acts as blocks) · *Details* (facts, turnout, budget, notes, Compile). Overview goes away; the strip carries the live counts. Mostly re-parenting existing branches.

**Recommendation: C now, A as the shape it grows into** — plus the two changes above it (open the presets; make Ready honest).

## 6. Decisions that are yours

1. **The five presets.** (a) All seven types as named cards in the create chooser ("Retreat — 14 tasks, 6 roles pre-filled"). (b) Keep three quick doors; offer the rich presets as a second step ("start from a playbook →"). (c) They were CCSF-specific fixtures and per-ministry templates (Compile / Run it back) are the intended path.
2. **What "Ready" means.** (a) Composite — tasks done and every role *confirmed*; green becomes rare and meaningful. (b) Two readouts, never one word: "22/22 tasks · 0/7 confirmed". (c) Drop the word; show counts.
3. **The countdown ladder as a user-facing concept.** (a) Keep it, relabel rungs to plain windows, move the editor out of the create modal into set-up. (b) Keep it fully, editor on create — the board runs on T-minus language. (c) Retire per-plan editing; two fixed shapes chosen by how far out the event is; leads just set due dates.
4. **Announcing an event.** (a) "Announce this event" in the workspace — creates/links the announcement, RSVPs flow back. (b) Leave announcing in Announcements and remove the RSVP line that can never populate. (c) Auto-create a draft announcement with every event.
5. **The container week.** (a) The week becomes a console — one page, the nights with live state, the merged timeline; a night opens as a light sheet. (b) Keep two levels; fix the roll-ups (one assignment control, drillable tasks, honest counts). (c) Drop containers; Welcome Week is seven events sharing a tag.
6. **Does the event workspace have a member tier?** (a) A "yours" default for non-leads with the full plan one click away; chase copy leader-only; Budget hidden not redacted. (b) One view, hide the chase/finance scaffolding. (c) Leave it — everyone on a planning team is a planner.
7. **One create shape for grouped lists?** (a) Per-group add rows everywhere (§11.13 as written). (b) Amend §11.13 to allow a section-rule create when groups derive from dates, and fix Roles to match.
8. **Half-pixel type.** (a) Ratify a half-step scale in the doc. (b) Round to integers once, with a lint.

## 7. How to look yourself

Sandbox admin → Workspace → Student Org Board → Events → **Fall Kickoff Night**. Read the Overview and ask yourself what to do first. Open **Countdown**, find the rotated AT A GLANCE strip on the right edge. Open **Roles** and find the person who declined. Then Events → season filter → 2025–26 → **Welcome Week** → Sub-events: every night says Ready; open the Roles roll-up. Then Events → New Event and count the doors. On the phone: the same event's hub, then tap Overview.
