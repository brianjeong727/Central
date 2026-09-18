# Design pass · Batch 1 — Plan workspaces (N7)

Reviewed 2026-09-13 against the seeded E2E Sandbox, both widths (1440 desktop, 390 mobile), as president/admin, as a plain DGL, and as a volunteer with no workspace. 64 captures, 3 reviewers (desktop, mobile, information architecture), every design-system claim verified in code. Screenshot evidence lives in the batch artifact; IDs (`N7.x`) are from the inventory.

---

## The short version

Plan has two of the best screens in Central and it hides both of them. The **workspace hub on a phone** (N7.2) and the **volunteer's "You're on" list** (N7.0) are genuinely glance-and-act: one plum thing that matters, plain-English rows, one tap to the work. Everything a non-planner needs is already designed. The problem is what happens one tap later — and the fact that the volunteer screen ships only to people who have no workspace.

The structural fault is simple to name: **the tree is organized by team, but the work is the event.** Everything hangs off "which workspace am I in," while a coordinator is thinking about Friday. So an event shows up in seven places with no primary, the money for it lives in a separate tree, the calendar for the whole church is filed under the board, and a DGL's own groups are created in one workspace and read in another (on a phone only).

The second fault is that **no two workspaces are built the same.** The board gets a section sidebar; a plain team gets a team-switcher in the same panel; Receipts gets that switcher again but now it's a filter; SGL gets two sections on desktop and three on phone. Header sizes, create buttons, calendars, section names — all differ per room. None of it is ugly. All of it is unteachable: a leader can't build a mental model that survives moving one room over. That is the real source of "I can't find a clean place to put everything" — there isn't one place, there are four grammars.

**Recommendation:** keep workspaces as the spine (your presidents like their room), but give every workspace the **same four job-named doors** — *What's coming · Our people · Our notes · Our money* — identical on desktop and phone, with team kind changing only what's inside. Then, inside each door, split **doing** from **setting up**: the sophomore lands on this week's stuff; roster confirms, countdown ladders, permissions, categories and fund allocation sit behind one "Set up" row. That removes a whole grammar (the Receipts side-tree), a whole class of bug (sections that exist on one width only), and most of the overwhelm — without a rewrite of the data model. Details and two alternatives in §3.

The single highest-leverage fix, independent of any reframe: **the "Quick social" path should not show the countdown-phase ladder.** A first-time coordinator picks the path labelled "light checklist" and is handed a five-row editable T-minus matrix with day-offset integers before typing a title. That is the exact moment the product stops being for people who are bad at planning.

---

## 1. The map as built

**Five doors into Plan, chosen by membership arithmetic, not by the user:**

| You are… | You get |
|---|---|
| on no team, not leader-tier | Volunteer workspace — events you're staffed on (N7.0) |
| leader-tier, on no team | "Ask a leader to add you to a team" — addressed to the leader; no Receipts tile |
| on exactly one team | dropped straight into it; never see the picker (or that Receipts exists) |
| on no team but receipts-eligible | dropped into Receipts |
| on 2+ teams, or governing one | the picker (N7.1) |

**What each workspace contains, and where the two widths disagree:**

| Workspace | Desktop sections | Phone hub |
|---|---|---|
| Student Org Board | General · Meeting Notes · Events (tree) · Resources · Groups · Rotations | Up-next hero → Events · Meeting notes · **Calendar** / Resources · Groups · Rotations |
| Small Group Leaders | Bible Study · Schedule | **Home** · Schedule · Bible Study |
| Finance | Allocation · Budget · Reimbursements | same |
| Plain team | (none — the panel is a team switcher) | one row: Calendar |
| Receipts | (team list, as a filter) | every team again, as rows |

"General" and "Calendar" are the same section. SGL "Home" — roster, my groups, my assignments, availability — is **phone-only**, and the desktop Schedule screen tells the president to "confirm the roster on the Home tab first," a tab that isn't on his screen.

**Depth:** ticking one task on an event is 5 taps on desktop, 6 on a phone; the last three are inside surfaces called Countdown / Roles / Run of Show that nothing on the way in explained. Submitting a receipt for your team is 5 steps through a *different branch of the tree*.

**Objects with more than one home and no primary:** an event (7 surfaces, 3 card designs), a team (picker tile / switcher / receipts filter / settings), a receipt (Receipts to submit, Finance to approve, Budget to post — none link to each other), a DG group (made in Board → Groups, read in SGL → Home, phone only), a person (six rosters, six editors).

## 2. What is fighting what

1. **Team-first tree, event-shaped work.** Almost nothing a coordinator does is team-shaped; almost everything the tree does is.
2. **Sections named after features on desktop, after jobs on phone.** The phone hub already says "Calendar — month view of everything scheduled", "Meeting notes — agendas & recaps". Desktop says "General". Your team can write the job-shaped labels; desktop never got them.
3. **Four navigation mechanisms in one tab** — picker, context panel (three meanings), sub-tab strips, mobile hub — so "where am I" has a different answer per room.
4. **Ministry-scope things wearing a team's clothes.** The church calendar, the group generator ("split your ministry"), and the lock-up / Sunday-prayer rotations all live under the board; a treasurer or DGL can't see the church's schedule inside Plan at all.
5. **Receipts is a second tree over the same teams,** and money is split across three homes.
6. **The volunteer workspace is a fourth grammar** — event-first, flat, role-annotated — and it's the one a member can actually use. Its isolation means the argument it makes is never made to anyone with a workspace.
7. **Workspace kind is decided by the team's NAME** (a regex on "board", "leadership", "sg", "tech", "praise"). "Exec Team" gets the ministry calendar; "SG Kitchen Crew" gets a Bible-study tab. Nothing tells the admin that the name they type picks the feature set.

## 3. Reframe options

**A — "One calendar, three doors" (event-first).** Plan's top level becomes *Up next · Calendar · Money* for everyone; workspaces demote to a "Teams" list holding roster, roles, notes, guides. Fixes the most; largest refactor; DGL work (roster, availability, Bible study) doesn't fit an event-first frame.

**B — "Same four doors in every workspace" (jobs, not features).** *What's coming* (events + calendar merged, one surface with a view toggle) · *Our people* (roster, roles, availability, groups, rotations — SGL Home lands here and exists on desktop) · *Our notes* (meeting notes + role guides) · *Our money* (that team's receipts in place — the Receipts side-tree goes away). Same four labels, same order, both widths. Bible study needs an honest fifth slot for DGL. Nobody is badly hurt; small teams show two thin sections.

**C — "Run it / Set it up" (a disclosure split, no re-tree).** Every hub shows only the doing plane; one "Set up" row holds roster confirm, roles & permissions, ladders, categories, allocation, group generation, season rollover. Cheapest; fixes overwhelm directly; fixes none of the duplicate homes.

**Recommendation: B, with C applied inside each door.** B is the only option that deletes a grammar and a bug class while leaving your real teams intact; C inside it is the actual answer to "too many features" — not fewer features, fewer on the path a non-planner walks.

## 4. Design-system findings — by root pattern

Each of these is one pattern with many instances; fixing the pattern clears the category.

**4.1 The create sheets are desktop modals on a phone** — *block*. New event, New semester, and the group wizard render `CentralModal` + `CentralButton` + native `mm/dd/yyyy` date inputs at 390px, not `PocketSheet` (N7.3.1, N7.3.2, N7.7.1 mobile). This is the one flow every leader must complete and the least finished screen they'll see. On desktop the same modals use raw browser date/time/select controls inside cream fields (N7.3.2, N7.7.1, N7.4.6).

**4.2 Creates are not one shape** — *warn*, both widths. Desktop: "New Event", "New semester", "Generate groups" are plum; "Add category", "Add member", "Add link", "Group chat" are ghosts in the same slot; the empty Receipts screen's only way forward is a ghost. Phone: the screen's single create takes four shapes — round "+" in the chrome, labelled plum pill in the chrome, labelled plum pill in the body, and on two screens (Groups, Receipts) **two plum creates at once** with two names for one action ("Generate groups" / "Generate group set").

**4.3 Four section-header tiers and two page-title grammars** — *warn*. Board sections are 19/500 with no eyebrow; SGL sections are 22/400 ruled; wizards 28/600; the page H1 is the workspace name on the board but the section name in SGL. The picker's H1 is 36px — the retired tier. The header is the only thing telling a leader what level they're on.

**4.4 Solid plum used for selection** — *block*. Bible-study week chips and the group-naming toggle fill selected items with `--plum` (plus 600-weight 13px text) where the contract says `--plum-tint`; the same job is done right with underline tabs one screen away (Receipts categories).

**4.5 The Google Docs iframe** — *block*, both widths. The Bible-study sheet is a raw white third-party frame, wider than the phone viewport, and when the doc is missing it renders Google's own "file does not exist" page as if it were Central's empty state (N7.4.8, N7.4.9). Only white surface in the app.

**4.6 Team settings writes on toggle** — *block*, needs your call. No Save/Cancel, no staged state, no visible saved indicator; one mis-tap can strip the president's "manage members" (N7.6). Convention #21 says settings stage behind Save. Phone roles are read-only while members are editable one section down.

**4.7 The volunteer workspace at desktop width is a phone design stretched to 1300px** — *block*. Mounted with mobile primitives, no desktop branch: 9.5px labels, 15/600 row titles, a facts grid across the whole column (N7.0 desktop).

**4.8 Two phone calendars** — *block*. Board (N7.2.2) is the ratified grid + agenda; plain team (N7.5.3) is a two-header Month|List with bordered cards and its own "+ Add event" — one teaches you events can be created from the calendar, the other denies it.

**4.9 Type-ramp drift** — *warn*, systemic. Fractional sizes (9.5 / 10.5 / 11.5 / 12.5 / 13.5 / 14.5) on nine screens; sub-10px text on three (volunteer facts labels, rotation monogram initials, availability column headers); weight 700 on today's calendar cell; the mobile mono kicker at 9, 10 and 11px across screens. `plan-tab.tsx` alone holds 40 fractional sizes. One sweep + a lint rule.

**4.10 Mobile chrome and tokens** — *warn*. Receipts hub/category screens open their title at 29px (a wrapper hand-types `paddingTop: 12` on top of the chrome's own pad) — the exact Convention #27 failure, and the rhythm sweep never reaches these screens. `--line-2` used as a fill for date chips and progress tracks where `--pocket-track` is the token. Tap-through row lists still wrapped in cards (Workspaces, Events, Meeting notes, Receipts hub; Rotations gives every Friday its own card).

**4.11 Emoji as iconography** — *block*. The three create-path cards use 🎉 🙏 ✏️, and "Start from scratch" wears the dashed border that means "empty collection" everywhere else, so the most powerful path looks like the broken one (N7.3.1).

**4.12 The group generator escapes the shell** — *note*. Full-viewport takeover with no rail, no crumbs; four return affordances on the phone (← box, ✕ box, step rail, footer Back); "32 people in this pool" printed twice.

## 5. UX findings — what a person hits

- **Quick path → phase ladder** (N7.3.2). Sold as "light checklist"; delivers a 59-control modal ending in an editable T-minus table. Visible `T-1 WEEK = 14` proves label and number can disagree. Direction: quick paths create from title + date + place and land in the plan where the phases are already right; ladder editing lives in the event, behind "Adjust the planning schedule".
- **SGL Schedule is three jobs on one 9,100px screen** (N7.4.6): my availability (four months of dates, past ones still live), the whole team's grid (8 × 30 checkboxes, 9.5px headers, no scroll affordance), and the rotation publisher — the actual answer collapsed at the bottom, the instruction sentence printed twice, "changes save automatically" three times.
- **"General"** is the least searchable word in the workspace and it's where the calendar lives. The helper line "Click any event to open its plan — no modal in between" describes an implementation decision to a sophomore.
- **Mechanism names instead of outcomes:** "Rotation Assigner", "Pick pool", "Configure", "The algorithm will run on this set of people", "Pre-seeded:". Say "Who's on which week", "Who's included", "How to split them", "We'll split this group evenly".
- **The board calendar opens on today, and today is empty** — half the screen says "Nothing scheduled" while three dotted days sit above it. Default to the next day with an event.
- **Rotations can't be scanned for gaps** — "needs someone" is encoded as cream-2 vs cream and dashed vs solid 1px; the reader reads twenty rows word by word to find the holes.
- **The plain-team calendar shows the same three events twice** on one fold (list + an "Upcoming" rail whose only extra is the "View plan" link people actually want).
- **Every event row carries an unlabelled ✓** with no tooltip or state difference; the list mixes "3 / DAYS AWAY" and "in 7 days" grammars.
- **Volunteer list truncates six of nine titles** because "4 open" squeezes the title column; the drilled event prints 7:00 PM in the facts and 18:00 in the run of show.
- **Hubs come in two grammars:** the board hub has a hero and PLANNING/MINISTRY kickers; SGL and plain-team hubs have "SECTIONS" and no status; Campus Outreach is a hub with exactly one row.
- **Receipts hub:** six of eight rows say "0 categories" (dead ends), teams shown as single-letter chips (four say "E") where the workspace list uses their icons; "categories" is internal vocabulary.
- **Meeting notes:** every row starts "Board Meeting — " so the distinguishing half truncates; list isn't in date order; row has avatar stack + chevron + kebab on an already-clickable row; only screen in the network with search.
- **Role guides for the coordinator exist** (Resources → Event Coordinator) and nothing on the event path points at them; they default to the President tab.
- **Getting pizza money back** requires leaving the event, leaving the board, entering the Receipts tile the coordinator dismissed, picking a team, picking a category — five steps in a branch they have no reason to believe exists.

## 6. Candidate rule additions and doc changes

**New rules to write (pattern seen ≥3×, undocumented):**
- The desktop "section content header" tier — 19/500, no eyebrow, hosts the collection's create (Events, Groups, Categories, Members). Real and useful; the contract jumps from 25px title to 28–36 H2 and never names it. Document it (and settle the eyebrow question) or fold it into H2.
- What the desktop context panel contains at each level — today it is a section nav, a workspace switcher, or a scope filter under one "SECTION" label with no cue.
- The phone chrome-row labelled plum pill ("+ Generate", "+ New semester") vs the round "+" — ratify one, or write the rule for when a label is required.
- The phone "kicker + 18/600 headline" section header (`SglSH`) — used five times, undocumented.

**Doc changes (code consistently contradicts the doc, same direction):**
- `mobile_design_system.md` §2's token table is stale — `--muted-text` / `--faint` hexes are the pre-AA values, `--success` is missing; the CSS is right, the doc should move.
- Cards around tap-through rows: the doc's "follow when touched" list has produced no movement in this network. Either commit N7 to the flat-row pass as one task or record it as a deliberate exception.
- Ghost vs plum creates: the doc says plum; the code says "plum for collection creates, ghost for sub-collection adds" consistently enough to be a habit. My read: the doc is right and the ghosts are drift — your call.

## 7. Decisions that are yours

1. **Is a workspace a place or a permission?** Keep the picker as everyone's front door, or land everyone on "what's coming / what's mine" (the volunteer map) with workspaces as a filter?
2. **Who owns the ministry calendar?** Leave it in the board; promote it to ministry level; or every workspace shows the same calendar filtered to its events?
3. **Does Receipts stay a peer workspace,** fold into each team as "Our money", or attach to the event it belongs to?
4. **Is the DGL workspace desktop or phone software?** Build Home on desktop; declare SGL phone-first and stop misdirecting; or move the roster into team settings and drop Home?
5. **Should a Quick-path event ever show the countdown ladder?** Editable at creation; hidden behind "we'll remind you 2 weeks, 1 week, 2 days out — change"; or set once per ministry in settings?
6. **Should team kind keep being decided by the team's name?** Or store the preset on the team at creation?
7. **Team settings: staged behind Save, or ratified immediate-write with a visible saved state?** The silent third way is the one thing it can't be.
8. **Which phone calendar is Central's** — the ruled grid + agenda (add a create), or keep both because a single-purpose team wants a flat list?
9. **Bible study:** frame the Google Docs embed in a Central card with real failure states, or a card + "Open doc" and no white surface?
10. **Rebuild the three create sheets on `PocketSheet`** as one pass, or only New event (the day-one flow)?

## 8. How to look yourself

E2E Sandbox on this slot (localhost:3003), sign in as the sandbox admin. **Workspace** → the picker (N7.1) → **Student Org Board**: the Events list, then **New Event → Quick social** and scroll the modal (the ladder, §5). Sidebar **General** (the calendar named after nothing). **Small Group Leaders** → Schedule (the 61-control screen; note the empty state pointing at a "Home tab"). Pick up your phone on the same URL: Workspace → Student Org Board (the good hub), then → Small Group Leaders → Schedule (9,000px). Sign in as the sandbox member, remove yourself from every team in Team settings, open Workspace: that is the volunteer screen (N7.0), the map the rest of Plan should learn from.
