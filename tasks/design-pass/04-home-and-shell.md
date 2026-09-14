# Design pass · Batch 4 — Home & shell (N2)

Reviewed 2026-09-13 against the seeded E2E Sandbox, both widths, as pastor, admin, leader, member and visitor. 21 captures, 2 reviewers, design-system claims verified in code.

---

## The short version

Home is handsome and calm, and it is not yet a front door. It never says what Central is or what you do here; it assumes you know. The order of the page is the order the features were built in, not a priority order: for a member it opens on an anonymous survey, then a chat strip, then **every open task you have ever missed** — 29 rows for the test member, 12 of them overdue back to August — then three announcements, then a verse. On a phone the deadline list is 45% of the page; the two things the product is actually about, announcements and chats, get two rows each below the fold, and the least consequential destinations (Open groups / Invite / Give) sit at the bottom wearing the loudest treatment on the screen. An admin has it worse in a different way: the Getting-started checklist owns the entire first phone viewport, permanently, until dismissed.

The strongest thing on the page is that checklist — the only element that teaches, derives its own progress, and can be acted on in one click. It should be the model, not the exception. And the shell around Home is quietly good: six legible rail sections, a real second level in the context panel, crumbs that say where you are.

Three things break it:

- **My deadlines has no cap and no floor.** It renders every open task, interleaves done ones, and makes Home ~3,600px tall and 70% backlog. The more behind you are, the longer your front door. The phone passes a "See all" handler that the component accepts and never uses.
- **The Featured slot isn't controlled by Curate.** A live Pastor Pulse question is injected as the lead slide for every non-pastor, so the one leader control over the most prominent surface visibly does nothing ("3 slides" in Curate; 4 dots on screen; the leader's first choice never first). On a phone the pulse card's "ANONYMOUS" tag physically overprints the eyebrow — the first painted text on Home for four of five roles reads "SCAL**E**ANONYMOUS".
- **Collapsing the rail deletes the second navigation level.** Church Settings (and its pending-count badge) simply becomes unreachable; Directory's member list and Profile's Journal row disappear with it. ⌘K doesn't rescue it — the palette hard-codes six destinations under the old names (Chats, Directory, Plan, Profile), omits Settings, Forms, Congregation, Give and Network, and picking a person or announcement lands on the unfiltered tab root rather than the thing you searched for.

And one plain gap: **Forms and Congregation have no phone entry point at all.** They exist only in the desktop rail. A pastor can ask the pulse question from a laptop — it becomes the hero of everyone else's Home — and has no way to read the answers on the device he carries.

**Recommendation:** make Home open on what's happening, not what you owe. Cap deadlines at the next three to five with a real "See all" into the Workspace tab and floor the overdue window; decide who owns Featured (my vote: the pulse gets its own quieter home and Featured is purely curated); collapse the admin checklist to its remaining steps below the hero; give members and visitors a first-week welcome block that retires itself, the way the checklist does for admins. In the shell, keep the second level reachable when the rail is compact (a flyout off the active item, badges carried onto the icon) and derive ⌘K from the same nav-sections source the rail uses.

---

## 1. What a person hits

- **The visitor and the member see the byte-identical screen** — a survey, a chat strip, a backlog, three announcements — with nothing that says what this ministry is, who to talk to, or what to do first. The person with the least context gets the same operational dashboard as a three-year member.
- **Deadline rows lead with the task and demote the event**, so the list repeats "Post it / Get it approved / Reserve the church space" three and four times with the distinguishing word in the quietest position. On the phone the row isn't tappable — only its checkbox is — and OVERDUE is the same grey as IN 12D.
- **The scale question opens looking disabled:** thumb parked mid-track, no value, the only CTA at 35% opacity, no instruction.
- **"Good evening, Leader E2E"** — the honorific allowlist includes leader, deacon and elder. "Pastor Kevin" is how people speak; "Leader Kevin" is a database field.
- **A photo hero slide sizes itself to the image**, so paging the carousel changes the width of the thing you're looking at; the caption column is a fixed 44% and breaks "Fall Retreat" onto two lines at 46px.
- **Curate spends the middle of its modal on a dashed "PHOTO SLIDES · Coming soon" box** — the shape Central uses for "add one here", inviting a click that goes nowhere. On the phone it's 26 controls above the fold (an ↑ ↓ × triplet per slide).
- **"See all ›" on the phone digests is the same muted 13/600 as the static "22 open · 7 done" count** above it — the only two navigational affordances on the lower half of Home look like metrics.
- **Deadline urgency is computed from the device's day, not the ministry's zone** — a student home in California sees a task go overdue a day early.

## 2. Design-system findings — by root pattern

- **Desktop primitives mounted at phone width** — *warn*: both overlays (Curate, Share) are centred `CentralModal`s with the pill nav floating over their veils; the grad banner is a bordered cream card with desktop buttons (and it renders on desktop too, unstyled, above the page title at the phone inset — a 36px misalignment and two 510px buttons); Curate is a desktop outlined chip on a page whose whole grammar is borderless.
- **The pill nav renders over every modal and sheet** — the hide condition is composer-or-chat only; the contract says sheets too.
- **Weight 600 on non-heading text throughout** — 15px checklist rows, deadline titles, 13px chat names, "Submit anonymously", "Dismiss", rail initials, badges: thirteen 600 nodes across seven roles on one pane. Three components agree against the contract — decide once whether list-row titles get a 15/500 tier or all drop.
- **Four section-header grammars on one screen** — plum-dot mono + ghost button; card with its own 21px title + mono counter; eyebrow + 28px H2 + 13px meta; eyebrow + H2 + "See all →" — and a chat strip with an eyebrow and no H2.
- **The carousel disagrees with itself:** headlines at 30 / 24 / 21 across slide types; the pulse slide is `--plum-2` with a border beside a borderless `--plum` hero — two purples side by side.
- **A second spacing scale in the shell** (3, 5, 7, 9, 11, 16, 20, 24, 30) — 16 and 7 are structural (rail padding, every panel nav row), so every new surface copies it.
- **The 44px greeting** is a third use of the display tier the card reserves for landing and event detail — either the front door earns a named exemption or it comes down to 25.
- **"FEATURED" is the one phone kicker not at the 10px kicker style** (12px, hardcoded).
- **Doc drift:** the mobile token table lists pre-AA hexes for `--muted-text` / `--faint`; the code is right and reasoned — move the doc.

## 3. Rules to add or change

**New:** a Home section shows at most N rows and a "See all" to its owning tab — no section on Home is an unbounded list (three sections cap; one doesn't). A mobile overlay hides the pill nav — the rule exists in prose and nothing binds to it. The plum-dot section label (hero, pulse eyebrow) is a third eyebrow grammar with no constant. Text-shadow for cream-on-photo captions is a legibility device the "no shadows" rule doesn't anticipate — rule on it before the second instance.

**Change:** weight 600 on 15px list-row titles (three components, same direction) — the doc should hold and the code drop to 500. The mobile §2 token table should move to the CSS values.

## 4. Decisions that are yours

1. **Who owns Featured?** (a) The pulse moves below the hero; Featured is purely curated. (b) The hero is a "what needs you" stack and Curate shows the pulse as a pinned first row so the two agree. (c) Leave it and rename the section so "Featured" doesn't promise curation.
2. **How much of My deadlines belongs on Home?** (a) Next 3–5 + a count + "See all" into Workspace. (b) Next 5 + inline "show all". (c) Everything. And: do items overdue by more than ~2 weeks age out?
3. **Should the admin checklist own the whole first phone screen?** (a) Collapse to remaining steps below the hero. (b) One row at a time, still first. (c) Leave it.
4. **Should a visitor's first week look different?** (a) A newcomer block that retires after a few visits or an RSVP. (b) Same Home for everyone; orientation lives in the welcome announcement.
5. **Forms and Congregation on a phone:** deliberate ("deep planning stays on desktop") or a gap? Either way the pastor needs some way to read pulse answers on a phone.
6. **The three bottom tiles** (Open groups / Invite / Give) each wear a solid-plum circle. Keep them as cards, or demote to one compact row?
7. **The compact rail:** (a) a flyout off the active item + badges on the icon, or (b) accept that compact means one level and put Church Settings somewhere else too.

## 5. How to look yourself

Sign in as the sandbox member → Home, on desktop and on your phone. Count how far you scroll before you reach an announcement. Then as admin: collapse the rail and try to reach Church Settings; press ⌘K and type "sar", press Enter. On the phone as admin, look at the first screen.
