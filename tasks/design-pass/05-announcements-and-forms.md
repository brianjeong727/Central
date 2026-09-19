# Design pass · Batch 5 — Announcements & Forms (N3)

Reviewed 2026-09-13/14 against the seeded E2E Sandbox, both widths, as a leader and as a member. 36 captures, 2 reviewers, design-system claims verified in code.

---

## The short version

Announcements is the most finished room in Central and the high-water mark for the whole app. A cream editorial feed, one plum "New announcement", a pinned welcome on top like a letter from the front of the room; a student can answer "what's this week, am I going" in two seconds without learning anything. The full-page composer is genuinely good, and "Adds RSVP button + calendar marker" is the kind of plain-language helper the rest of the product should copy. The card-level logic is real product thinking: you're never asked to confirm text you couldn't see.

The breaks are in three places, and none of them is the feed itself.

- **The detail page can't choose.** RSVP, "Fill out form" and "Got it" all render as full-width plum primaries — three "the" actions stacked down one column, on a phone all three at once. The form button already demotes itself when the announcement is an event; the acknowledgment button never got the rule. The member's ack-only detail is the shape the event detail should have: one primary, one progress line, one quiet card. So this isn't a missing pattern — it's the same page failing to pick when it has more than one thing to offer.
- **Members see leadership's dashboard.** "18 views" and "8 of 31 acknowledged" on a member's card and detail; "0 going · 18 views" on a non-event; a POST badge that only means "not an event". A member scanning for "what does this want from me" gets telemetry around the one control that matters.
- **Forms doesn't earn its room.** It's a top-level tab, a breadcrumb and a list — three objects deep — holding things that only exist attached to an announcement, and the composer can only *pick* an existing form, never make one. Shipping "RSVP with dietary needs" means leaving the composer, finding Forms, building the form in a scrolling modal with browser-default checkboxes, and coming back to re-find the draft. Two rooms and two grammars for one job.

Also real: **a draft's detail page reads as published** — "POSTED Sep 13 · 18 views", "0 of 31 acknowledged", "Remind the 31 who haven't", with no draft state anywhere and, on a phone, no Edit or Publish on the screen. On the official channel of a church, "did this go out" must never be ambiguous. And **a leader's phone feed opens on their own unfinished draft** above the filter row, so the tab whose job is "what's happening" opens on "what you haven't finished".

**Recommendation:** one plum per detail, chosen by what is still owed (RSVP if unanswered, else the form, else Got it). Gate views and the ack tally to leader-tier. Retire Forms as a room — form *authoring* moves into the composer's FORM section as "Add questions", and Forms becomes a Responses view reachable from the announcement. Give drafts a real state (eyebrow, no telemetry, one "Continue editing" primary) and put the leader's Edit / Pin / Publish / Delete on the detail's own title row. Default "Ask for acknowledgment" to off.

---

## 1. What a person hits

- **Compact layout overprints text** at 1440: the WHEN column wraps "Fri, Sep 11" to three lines and the wrapped date paints over the "See →" link.
- **Create and Edit are visually identical** — no eyebrow, no title block, the only difference is the footer, and edit has no Cancel. The contract names this surface's eyebrow ("NEW ANNOUNCEMENT · DRAFT") as required.
- **The detail has no Edit / Pin / Delete** — those live only on the feed card's kebab, so the object's own page can't configure the object.
- **The desktop detail body is sans 16 on grey** while the composer writes in serif 19 and the phone reads in serif 17 on ink — the one page everyone reads looks like a helper caption on a laptop and hugs the top-left of a page that's 60% empty cream.
- **Who-hasn't-acknowledged on a phone** is a wrapping cloud of 31 inert chips — no avatars, no per-person message — and the only action is "Remind everyone", already clipping its own label. On desktop, form responses can't answer "who hasn't responded" at all, and there's no export.
- **The form builder:** 31 controls above the fold in a modal, raw browser checkbox for Required, 13px chevrons to reorder, five red trash cans an inch apart on a phone, two different add-affordances. The locked-because-people-answered state is almost indistinguishable from the editable one — same filled chips, same underlined options — with only a quiet banner that doesn't say how many responses or link to them.
- **Forms cards on a phone** carry three 32px bordered icon buttons with a filled-red delete where the thumb rests, while "View responses" — the job — is the faintest text on the card.
- **The compose chrome on a phone hand-types its padding**, so the title opens at 30px and truncates to "New annou…"; both guards structurally can't reach that screen.
- **The event fields, once revealed, are native `datetime-local` masks** ("mm/dd/yyyy, --:-- --") labelled 14.5/600 while every sibling uses the 10px kicker — and nothing says which timezone the leader is typing into, which Convention #23 makes consequential.
- **"Form submitted" is written four ways** — `#2E7D32` (a Material green in no Central palette) on the feed, a hardcoded sage on the desktop aside, the token on the phone.
- **"✓ Going — tap to undo"** is an instruction inside a button; the going-chips wrap to a centred ragged second row.
- **A member hitting a draft or class-targeted link gets "Announcement not found."** — bare text on a blank page, plus a second back button under the chevron.

## 2. Design-system findings — by root pattern

- **Solid plum as selected/status fill** — *block*, six instances: audience chip, attach-a-form row, "📌 Pinned" pill (with an emoji as its icon), question-type chip, "ATTACHED" pill, and the locked chip's desaturated plum. The contract's grammar is plum-tint + plum text + plum border everywhere else. Code moves.
- **Every sheet is the desktop modal at phone width** — who-hasn't-acknowledged, form builder, form fill: no drag pill, footer primary hugging the right edge, a 720px layout squeezed to 390, panel `#F8F4EA` (a value in no token), 22/400 title, 11px desktop kickers.
- **The detail's action buttons are desktop `CentralButton`s** at phone width, not Pocket pills.
- **The detail H1 is a fluid clamp topping out at 46px** — a tier that doesn't exist; three title tiers in one network (44, 46, 25).
- **Long-form body sans on desktop, serif everywhere else** — §1.3 names announcements as serif 17–19; the code should move.
- **Three hand-rolled toggle switches** with `--dashed` as the off-track and an `rgba()` error banner.
- **Three unlabelled icon buttons per form row** with a filled-danger delete — the contract says 3+ actions collapse to a kebab and danger is text + border.
- **The pinned hero is a fourth "featured" grammar** — ivory, 40/400 serif — beside the documented plum `FeaturedHeroCard` that renders the same object on Home.
- **12.5px fractional type** on the segmented labels and every roster row; 20/400 form titles off the phone ramp.

## 3. Rules to add or change

**New:** the detail "aside module" stack (EVENT / FORM / ACKNOWLEDGMENT / POSTED — kicker → anchor → action → meta) is a good, consistent, unnamed pattern; name it and write "at most one plum primary per aside" into it. Status tags on the phone have no variant grammar — five status tags across four treatments; status should always be the tonal default, plum stays role-only.

**Change:** solid plum fills (six instances, code moves). Long-form body serif on desktop (code moves). Mobile form fields — the compose headline/body, the builder's title and labels, the option rows are all borderless-on-page with a hairline rule, consistently, and it reads better than ivory slabs on a long form: name the "editorial field" as the composition grammar and keep the ivory input for short fields (doc moves).

## 4. Decisions that are yours

1. **Does Forms deserve its own room?** (a) Keep the tab and add "Create form" inside the composer. (b) Retire the tab — authoring moves into the composer's FORM section; Forms becomes a Responses view reached from the announcement. (c) Leave it. My recommendation: (b).
2. **Should "Ask for acknowledgment" default on?** It does today, which is why nearly every card carries a "Got it" competing with RSVP. (a) Keep on. (b) Default off. (c) On only for audience = Everyone.
3. **Should members see leader telemetry** (views, ack tally)? (a) Hide both. (b) Hide views, keep the tally as social proof. (c) Leave.
4. **Drafts on the phone feed:** open on drafts (today), or always on the published feed with a "2 drafts ›" row or a fourth chip?
5. **Editing from a phone:** full leader controls on the detail (⋯ with Edit / Pin / Publish / Delete), or "read on phone, edit on desktop" — in which case a draft shouldn't be tappable into a read-only detail at all.
6. **"Form submitted" colour:** sage (which also means presence today), or a new success token?

## 5. How to look yourself

As the sandbox admin: Announcements → open "Fall Kickoff Night" (two plum primaries in the aside), then open the draft "Small group placements — DRAFT" (it says POSTED · 18 views). Switch the layout to Compact. Then Forms → Edit on "Fall Retreat sign-up". On the phone as admin: Announcements (the draft tray is above the filters); tap New and read the chrome title. As the member: the same kickoff announcement — count the plum buttons.
