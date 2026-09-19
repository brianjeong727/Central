# Design pass · Batch 3 — Church Settings (N6)

Reviewed 2026-09-13 against the seeded E2E Sandbox, both widths, as admin and pastor. 21 captures, 3 reviewers (desktop, mobile, information architecture), design-system claims verified in code. Screenshot evidence in the batch artifact.

---

## The short version

Both halves of your sentence are true and they don't conflict. The micro-control is genuinely good — 19 configuration blocks, about 45 individually settable things, almost no filler, and the explanatory copy under each heading is the best writing in the app. What's broken is the **taxonomy**: the page isn't too big, it's sorted by the wrong key. The eight tabs group things by which table they touch, not by what an admin is trying to do. "Workspace" holds join codes, calendar sync, funding sources and reimbursement caps — while "workspace" means *Plan team* everywhere else in Central, including the rail three inches away. "General" holds the ministry's identity, giving, verses, the onboarding guide, and archiving the whole ministry. Both tabs need a subtitle enumerating their contents to be findable, which is a subtitle doing a label's job.

Three more things make it a nightmare rather than merely untidy:

- **The two things admins open Settings for on a normal Tuesday are filed as if they were switches.** Join requests and reports are inboxes — they have counts, they go to zero — and they sit third-down-the-seventh-tab and sixth-tab. Thirteen of seventeen config blocks are set-once; the four you return to live in four different tabs; the page opens on the ministry name, which changes never.
- **Two save grammars that look identical.** Eight sections stage behind Edit → Save → Confirm (four clicks to flip a toggle); eleven write instantly. The only read-mode cue is a 60%-opacity toggle. On a phone there isn't even that: a locked switch renders full plum, swallows the tap, and the Edit button is three scrolls up. That is the whole of "navigating that is a nightmare" on a phone.
- **The ceremony runs inverse to consequence.** Flipping public discovery: 4 clicks. Regenerating the invite code (kills every shared link and QR): 2. Approving a join request (a real person gains access to everything): 1. And the Audit Log — the tab that exists to answer "what changed?" — records announcements and member roles and not one of the settings this page exists to change.

**The grouping you want already exists — on the phone.** The mobile hub groups the eight into Ministry / Operations / Records with a plain-English subtitle per row; it's scannable in one screen. Desktop gets a flat unlabelled strip. The better IA is shipping to the smaller screen.

**Recommendation:** one scrolling Church Settings page, ordered recurring-work-first — Waiting to join, Reports, People, Audit — then configuration, with a pinned section index (the mobile hub, promoted) and a search that matches control labels, not just section titles. It keeps every switch and every name exactly as they are, so the micro-control is untouched, while removing the only thing that hurts: guessing which of eight nouns holds the switch you want. If it lands, regrouping by admin job becomes a cheap follow-on, because the index — not the tab strip — then defines the groups. Tier the confirm by consequence: reversible toggles commit on tap with an undo toast; identity, discovery, join codes and archive keep the change-summary confirm; and every committed change writes to the Audit Log (the confirm modal already computes the exact old → new pair and discards it).

Two facts worth knowing outside any reframe: **`ministries.timezone` — which drives every event time and every scheduled push in the product — has no editor anywhere**; and offering info has two equal editors (Settings and the Give page) with the setup checklist pointing at the one outside Settings.

---

## 1. The inventory as built

**8 tabs · 20 blocks · ~45 controls · 2 review queues · 1 log.** Per tab: General 7 · People 1 (+banned) · Governance 2 · Automations 1 (+2 coming-soon) · Chat 1 (+1) · Reports 1 · Workspace 6 · Audit 1. Admin-tier only — and the file carries a complete leader-tier variant (reduced tab set, disabled edit controls, read-only join codes) that can never render because the tab is admin-gated at the mount.

**Ministry configuration that lives outside this tab:** the Give page's own "Edit Zelle info" pencil (same row as General → Giving); team settings under each workspace gear (roles + permission checkboxes — a second permissions tree); the Home setup checklist (its visibility is a Settings control, none of its steps route to Settings); Profile's settings hub (same visual grammar as the Church Settings hub, one tab away, no cross-reference); the invite share modal (three mounts); Finance (funds are created in Settings but spent in Plan → Finance; receipt categories never appear in Settings). Onboarding collects `location` and `size` that Settings can never edit, and there are two campus lists — `ministries.universities` (frozen at signup) and `ministry_schools` (the editable "Linked campuses").

## 2. What an admin is actually trying to do

| Job | Blocks | Where they live today |
|---|---|---|
| Who's in, and what can they do | roles · remove · banned · governance roster · team access matrix · team roles + permissions | People · People · People · Governance · Governance · **Plan → team gear** |
| How people get in | discovery · invite code · staff code · custom code · who can invite · join requests · campuses | **General** · Workspace ×5 · **General** |
| What the church looks like from outside | name/school · discovery · offering · verses · home hero | General · General · General **+ Give** · General · **Home** |
| What happens by itself | 5 chat automations · annual class maintenance | Automations |
| Money | funds · receipt caps · offering · allocation · receipt categories | **Workspace** · **Workspace** · General+Give · **Plan → Finance** · **Receipts** |
| Safety | chat filter · reports · banned · excommunicate | Chat · **Reports** · **People** · **People** |
| History | audit log | Audit Log |
| Set it up / hand it over | guide · checklist · presidents · annual maintenance · archive | General · **Home** · **Plan** · **Automations** · **General** |

Every place the current group is the wrong group: Discovery (General) is severed from join codes (Workspace) — the Discovery OFF copy literally says "code required to join", naming a code two tabs away. "Who can invite" is a member permission sitting in Workspace. Join requests (Workspace) and setting the new member's role (People) are consecutive steps of one act — and the shell's badge says "Church Settings · 3" then drops you on General, seven tabs from the queue. Funds and receipt caps are money under a Plan word. Safety is split three ways. The most seasonal job in the ministry (officers graduate, classes roll over) is a "Run now" button at the bottom of Automations, below two disabled coming-soon toggles.

## 3. Design-system findings — by root pattern

- **The eight drilled sections have no mobile form** — *block*. One shared body renders under a swapped chrome row, so every phone sub-screen ships the retired bordered `--cream-panel` card, the 11px desktop kicker (the hub uses 10), desktop filter chips, and 12.5px type. The hub is on-contract; one tap down leaves the design system.
- **A locked switch on a phone looks live and eats the tap** — *block*. `locked` reaches only the desktop branch; the mobile switch renders full plum with a pointer cursor and no-ops.
- **Edit/Save only at the top of 1,600–2,000px bodies, no sticky bar** — *block*. Workspace has three independent Edit scopes on one screen; editing Sharing then scrolling to Funds hits a second Edit with no sign the first is unsaved.
- **Section H2s are all overridden to 20px** (component default 28; contract 28–36) — 17 silent overrides. On a page whose only structure is its sections, they read as card labels. Either snap to 28 or document 20 as the stacked-settings tier and rewrite §7.5, which describes a two-column layout this page abandoned.
- **The accent is inverted.** Creates ("+ Add school", "+ Add verse", "+ Add limit") are ivory; plum solid is spent on repeated per-row queue actions (three "Approve", two "Mark reviewed") and on "Show on Home" — the least consequential control on General.
- **Three fixed-width cards stranded left in a 1256px column** (Offering info, Getting started, Invite code), each with its Edit control 700px away on the full-width header.
- **Governance on a phone:** team names paint on top of the None/View/Write control; the three-option segmented is squeezed into ~110px.
- **Chat scope offers four exclusive options wrapped to two rows** (the mobile rule is ≤3 chips, 4+ becomes a picker); the selected chip is a pale tint against bordered siblings — the weakest selection signal in the app, on a moderation setting.
- **Four badge systems.** People's role pills are an 11px sentence-case set in four treatments where the contract's `PocketTag` has three; Leader and Visitor both read as quiet outlined pills.
- **Small tokens:** hub icon chips filled `--line-2` (stroke token) instead of `--pocket-track`; fractional 12.5 / 13.5 at nine sites; the "Archive ministry" heading at 22/400 — larger yet quieter than the 20/600 sections above it; `ConfirmDialog` stamps "DANGER ZONE" on unlinking a campus, the same label as archiving the ministry; the invite share surface is a desktop modal on the phone; "Share Central" names the product, not the ministry.

## 4. What a person hits

- **Reports can't be resolved, only cleared.** A card shows reason, target type, reporter, reported, free text — and no link to the message, announcement or profile, and no action against the person. "Dismiss" or "Mark reviewed" on the strength of "keeps posting the same joke", never having seen the joke.
- **Three pending joins and two open reports surface no count anywhere** — not the strip, not the title, not Home. A join request nobody sees is a student who tried to join and never got in.
- **The governance matrix's Edit button lives in the previous section's header**, 350px above eight dimmed pickers that do nothing when clicked.
- **People has three stacked filters for one dimension** — five stat tiles, a five-chip role row, and an orphan "All" button — and the tile says REGULAR where the badge says Member. On the phone, 32 members are one flat 39-control card; every email truncates mid-domain.
- **Every section opens with a 2–4 line explanation before the first control**, and most switch cards carry a second one. Good copy; on a phone it turns a control panel into a manual that's read once and scrolled past forever. Governance's first control is 215px down behind two paragraphs and a legend.
- **"Off by default" printed next to a toggle that is ON.**
- **The Audit Log leaks raw keys** (`moderation.flag_threshold`) between plain-English rows, and 100 entries have no search, no actor/type filter, no date range.
- **General has no phone URL** — `general` is missing from the mobile deep-link list, so a shared link to it lands on the hub.

## 5. Rules to add or change

**New rules:** the per-section Edit → Cancel/Save → confirm pattern is the governing interaction of the whole network and neither contract describes it — write it down before it's ported to mobile, including where Save lives on a screen taller than the viewport, and that a control in read mode must be visibly inert with its tap routing to Edit. The mono eyebrow at weight 400 used as a standalone control-group label (eight instances) has no spec. "Pick one of N for a setting" is rendered three ways in one tab (filter chips, a hand-rolled segmented, clickable stat tiles) — name the control.

**Doc changes:** section H2 at 20px on stacked settings pages (17 consistent overrides) — code or doc must move. Mobile §5's "Automations (2-col switch cards)" should move to the code's side: single-column switch cards with a one-line explanation; two columns can't carry the sentence at 390px.

## 6. Decisions that are yours

1. **Time zone.** It drives every event time and scheduled push, and no one can set it. (a) Add it to General. (b) Ask during onboarding and make it editable. (c) Leave it support-only.
2. **Desktop grouping.** Bring Ministry / Operations / Records to desktop as (a) a left settings rail with subtitles and counts, or (b) group dividers inside the existing strip — or (c) go to the single scrolling page with a pinned index and label search (my recommendation).
3. **The confirm ceremony.** (a) Everywhere, for consistency. (b) Tiered by consequence — confirm only what members will feel; toggles commit on tap with undo. (c) Drop the modal, keep Edit/Save + undo toast.
4. **"Workspace".** (a) Rename the Settings tab. (b) Rename Plan's workspaces to "teams" and free the word. (c) Live with it.
5. **Queues.** (a) One admin "Inbox" surface outside Settings. (b) Keep them in Settings but first, with counts. (c) Leave as is.
6. **Finance config** (funds, caps): (a) stays in Settings, (b) moves next to Finance.
7. **Offering info's two editors:** (a) Give owns it, Settings links there. (b) Settings owns it, Give is read-only. (c) Keep both.
8. **Audit every settings change?** Yes makes the log busy and the missing filter a prerequisite; no keeps the confirm modal certifying deltas nobody records.
9. **Mobile Settings: full parity or read-and-drill?** (a) Everything editable on a phone — needs a sticky save bar and a real inert read mode. (b) Show state clearly; edit only the cheap toggles; send structural work to desktop with an honest line.
10. **The annual turnover** — the ministry's biggest recurring admin event is a "Run now" button. (a) A named "New semester / New year" flow. (b) Fold into a repeatable checklist. (c) Leave it.
11. **The dead leader-tier variant:** (a) open Settings to leaders with that reduced surface, or (b) delete the branches.

## 7. How to look yourself

Sign in as the sandbox admin → Home → Church Settings. Read the eight tabs once and try to find where reimbursement caps live before opening anything. Open **Workspace** and scroll it. Open **Governance**, click a None/View/Write picker without pressing Edit. Open **Reports** and try to see the reported message. Then the phone: Church Settings (the hub — this is the good version), tap **Automations**, tap any switch.
