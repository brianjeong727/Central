# Design pass · Batch 7 — People & You (N5)

Reviewed 2026-09-13 against the seeded E2E Sandbox, both widths, as admin, pastor and member. 37 captures, 2 reviewers, design-system claims verified in code (20 confirmed, 4 corrected, 0 refuted).

---

## The short version

This is the half of Central that's about people rather than work, and it's the half that's been left alone the longest. On a phone it's the calmest, most finished-feeling area in the app — the Directory is exemplary and Profile v2 is a confident, newer thing that reads like somebody sat down and rethought it. On desktop, the person it shows you is a passport page: email, class, hometown, a verse, arranged as a centred 480px column floating in a 1050px pane. It tells a leader who someone *is on paper* and nothing about how they're doing — which is the actual reason a leader opens a directory in a college ministry.

Three things break it:

- **A person has two faces that agree on nothing.** The Directory page (36px name, Message + Pray for + kebab, a facts table) and the modal peeked from chat (21px name, "Send Message" only, no facts, ~380px of dead space) share no content, no verbs and no link between them — and the modal is the one most people will actually meet, because chat is where they meet each other. On the phone the same two fields (Studying, From) render in two grammars one tap apart.
- **Collapsing the sidebar deletes the Directory.** The context panel is the only place the member list exists, so with the rail compact, Directory shows a dashed "choose someone from the list on the left" with no list — and a shared `?member=` link paints that empty box under a breadcrumb carrying the person's name. Journal and Sign out vanish the same way.
- **Congregation isn't a pulse.** The list is newest-first with no active-first sort, so the one live question sits below two archived ones; every card shows a count and every answer is a click away. A pastor opens it to feel the room and gets a filing cabinet. On the phone its two subpages are the last screens in the app still wearing the pre-August chrome the contract retired.

And two moments of action that fail quietly: the **Give amount is a real input styled as a 64px statistic** — a student who wants to give $20 has no reason to believe the "$50" can change, and the button confidently reads "Open Zelle · $50" either way; and **Notifications tells a blocked user that notifications are blocked, then offers eleven fully live switches** with no way to unblock.

**Recommendation:** one member record rendered at two sizes, not two designs — the chat modal becomes the Directory pane's content in a smaller frame, with the same verbs and a "View full profile" row. Decide what a member sheet is *for* (the biggest call in this network): a leader-only band with their small group, teams and open prayer request would make it the pastoral tool the directory implies. Make the compact toggle hide chrome, not content. Put the active pulse question first with its live result inline. Give the amount a field affordance and preset chips. Rewrite the doc's Profile recipe to describe v2 — it's better than what's written, and the member sheet has meanwhile followed the old one.

---

## 1. What a person hits

- **The member's Profile has no Faith section** — a section with no filled fields is removed entirely, so the fields that make the Directory worth reading (verse, worship song) are the ones a new member never learns exist.
- **Opening yourself from the Directory** gives a read-only page with no Edit and no route to Profile; everyone else's has a plum Send Message. An admin's kebab offers only Report and Block — role changes live in Church Settings with no hint here.
- **The verse row labels itself with its own value** — a member who named a verse without typing it out sees "PHILIPPIANS 4:6-7 / Philippians 4:6-7".
- **24 of 32 directory rows say MEMBER** — the tag that exists to find leaders is printed on everyone, beside the name.
- **Opening a person from inside a chat** gives a chrome row titled "Back" — the only back-label in the app that names the control instead of the place.
- **"Shared profile details are visible to members in this ministry"** — a policy statement about the viewer's data, printed on somebody else's card, where their class and team would go.
- **The journal editor on a phone is the desktop rich-text editor inside the page** — fifteen ~28px formatting buttons, half the 44px minimum, at the far end of the screen from the thumb. On desktop a private devotional opens with a 15-control toolbar while "Attach photo" is stranded 470px below.
- **The shared note editor ships a saturated Tailwind rainbow** as user-selectable text colour (`#000000`, `#EF4444`, `#3B82F6`…) into journal *and* meeting notes — the sanctioned route by which pure black and traffic-light saturation enter a cream product.
- **Prayers show no status on the row** — "answered", the entire emotional payload, is behind a kebab.
- **The newest journal entry can't be collapsed** (it alone has no chevron); Today's Verse is visually identical to a saved verse and sits at the bottom of every tab.
- **Notifications:** eleven rows, no grouping, Save only when dirty and 700px below the first control.
- **Give:** the same copy action twice, the recipient email three times, a "Coming soon" card for a feature that doesn't exist, the admin's edit control filed under the wrong heading at 12px, and a scripture citation with nothing cited ("2 CORINTHIANS 9 : 7").
- **The report modal** on a phone weights "Report & block" wider than "Report" and looks disabled until a reason is chosen — on the one sheet where someone is upset.
- **Sign out is a `--danger` row** in the panel while the genuinely destructive actions live in the Danger zone.
- **"Send to Congregation" is a 1256px plum bar** with no confirm, for a broadcast that can't be recalled.

## 2. Design-system findings — by root pattern

- **Five unsanctioned title sizes** below the H1 — member name 36/600 (the retired tier), profile name 32/400, ContentHeader 19/500, danger-zone 20/400, monogram 40/400.
- **A 480px column stranded in a 1050px pane** (hard do-not #13) at a 64px inset that's on neither the desktop inset nor the scale.
- **Desktop primitives at phone width across five screens** — `CentralButton` ×4 (incl. the Journal's *create*, making it the quietest control on a screen whose point is writing), the desktop `Select` among ten `PocketSwitch`es, bordered inputs and radio cards on the Congregation composer and the report modal, sub-44px Copy buttons. One sweep, not five fixes.
- **Congregation's two subpages use `PocketBackRow`** — the retired 15/600 back-label — and stack a second header under it. It's the component's last consumer; delete it and this can't recur. The guard script keys on an import this component never makes.
- **Profile v2 contradicts the doc's recipe on every point** and is better than it: identity on the page, 88px avatar, no Edit mode (tap-to-edit, commit on blur), a completeness meter, right-aligned fact rows, a full-bleed verse band. Doc moves. The one thing to keep from the old recipe: the name at 21, not 26 — at 26 it's bigger than the chrome title above it.
- **Two facts grammars for the same person** one tap apart; neither uses `PocketFactsGrid`, whose own comment says it exists for "event & member detail".
- **A kicker repeats the chrome title** on three of four settings screens ("NOTIFICATIONS" under "Notifications").
- **Small:** the privacy disclosure set in `--faint` (the non-text tier); the presence dot painted `--success` where the doc says `--sage`, with a breathing box-shadow glow; the Journal body double-counting the nav clearance (52px on top of 92); 12.5/13.5px on five captures; the report modal with no `role="dialog"`.

## 3. Rules to add or change

**New:** the standalone mono eyebrow *is* the section header on identity/settings/form pages — eleven consistent instances, no H2 under it, and it works; write it down as the L3 alternative with "no H2, no action slot". A kicker names a section, never the screen; a screen with one section gets no kicker. A person's own screens commit on blur with no edit mode at phone width — name it, and say when staged-Save applies instead.

**Change:** the doc's title tiers no longer match the shipped components — `PageTitle` defaults to 44 and every tab root uses it; `ContentHeader` renders 19/500 with an optional eyebrow. Both are ratified components used app-wide; the doc should record them. 12.5 / 13.5px are a de-facto scale step (40+ sites, one with a comment reasoning about it deliberately) — adopt or ratchet, but stop citing a rule enforced nowhere. Rewrite the mobile §5 Profile recipe to v2.

## 4. Decisions that are yours

1. **What is a member sheet for?** (a) Leave it — pastoral context lives in chat. (b) A leader-only band on the sheet: small group, teams, last message, open prayer request. (c) A separate "shepherding" view reached from the sheet. This is the biggest decision in the network.
2. **Is Congregation a pulse or a poll tool?** (a) Keep it as a sending tool. (b) A results-first landing (live result inline, trend across weeks). (c) Fold it into Forms and retire the tab.
3. **Should the compact sidebar exist on master/detail tabs?** (a) Don't collapse on Directory / Profile / Chats. (b) Give each an in-content fallback list.
4. **Profile v2 vs the written recipe:** (a) rewrite the doc and migrate the member sheet to match; (b) keep the doc and treat Profile as a one-off. Recommendation: (a).
5. **Give presets** — fixed $10/$25/$50/Other, or ministry-configurable (a schema change)? Presets set an anchor, which is a ministry-culture call.
6. **Notifications when blocked:** visibly disabled (honest, looks broken) or editable-as-intent with a stronger banner? Recommendation: disabled, with the App Store / instructions link in the banner.
7. **Directory role tags:** drop the MEMBER pill entirely (leaders become findable) or keep every role? Recommendation: drop it.
8. **The Journal gear** (show entries / show streak): stays on the Journal chrome, or moves into Profile → Settings with every other privacy switch?

## 5. How to look yourself

As admin: People → open Sarah Kim (the passport page), then Messages → Tuesday Night DG → tap "Grace Lee" (the other face). Collapse the rail and open People. Then Congregation as pastor. On the phone as member: People → tap your own name; Profile → Journal → New entry; Give.
