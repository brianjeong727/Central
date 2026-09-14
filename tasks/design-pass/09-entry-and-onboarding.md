# Design pass · Batch 9 — Entry, onboarding & the founder's edges (N1 + N10)

Reviewed 2026-09-13/14 against the E2E Sandbox, both widths, signed out, as a member, and as an admin registering a ministry. 53 captures, 2 reviewers, design-system claims verified in code. The founder console (`/admin`) is gated on your email and could not be captured; it's reviewed from code only.

---

## The short version

This is the calmest, most finished network in Central. The split-shell auth screens are genuinely good — the chapel photo, the Hebrews verse, one plum button, "Welcome back." — a stranger's first impression is *a serious, quiet thing built by people who care*, which is exactly the north star. The landing page has been rebuilt since the design doc last described it and it's better than the doc. The invalid-invite state is better written than most products' happy paths.

It earns a signup from a pastor. It doesn't yet earn one from the student who got a link from a friend — and that's who arrives in volume.

- **The landing sells to the wrong person.** The only plum primary — hero and closing CTA both — is "Register your ministry". The student gets a 15px "Sign in" in the nav and a ghost link 4,800px down. On a phone it's worse: Sign in, Get started and Ministries are all inside the hamburger; the one visible action on the fold is the pastor's. The signup fork repeats the inversion — the plum icon tile is on "Register a church", the ivory one on "Join a ministry".
- **The invite landing opens as a blank screen and sells the vendor.** `/j/<code>` — the single highest-stakes screen in the funnel — is vertically centred in the viewport, so on a phone the message starts ~500px down and the first second reads as loading. The only brand on it is Central's own logo; the ministry appears solely as text in the headline. No monogram, no university, no "invited by". A student has no signal she landed in *her friends'* place.
- **Two dead ends.** `/ministries` signed out renders a header with nothing in it — no Sign in, no Create account — and it's where the landing's own "Find an existing ministry" link and the invalid-invite recovery both send people. And the Browse tab lists ministries you cannot join: every row is a locked "Code" button (registration defaults to private), with no instruction on where a code comes from; the founder is told registering "works best on desktop" with no link.
- **The onboarding wizard answers a failed Continue with silence** — two danger borders and no words — in the pastor's first minute. Step 2 is one toggle costing a quarter of the wizard. Step 3 is 62% dead: five of eight workspace rows are the indefinitely-backlogged worship family, shown as full-weight "COMING SOON" tiles (at 9.5px, below the type floor); nothing is pre-selected and the copy excuses it, so Review reports "WORKSPACES · None". And the 24–48h approval wait — the one fact that could change whether a pastor starts — is disclosed on the last line before Submit, after step 1 promised "only takes a few minutes".

Also: the funnel can't decide whether you're registering a **church** or a **ministry** — it uses both, sometimes one click apart. **Gender is a required two-option blocker** at signup and again at complete-profile, on a form that already asks name/email/password/grad year before showing anything about the ministry. And the Network tab is a permanent "Coming soon" card holding one of six rail slots for every admin.

**Recommendation:** put the student's door on the fold — plum "Join your ministry" beside an outline "Register your ministry"; keep the pastor pitch for the closing CTA. Top-anchor the invite landing and lead with the ministry's identity block. Give `/ministries` a signed-out header and make a locked row say the next step ("Ask a leader for the code", or a join request). Fix the wizard's pacing: say "approved within 24–48 hours" on step 1, fold Visibility into step 1, pre-select the two workspaces nearly every college ministry needs, and hide the backlogged presets (they still exist in Add-workspace later). Pick one noun — "ministry". Decide gender: my vote is collect it after landing, where the small-group reason is visible.

---

## 1. What a person hits

- **Three of seven auth H1s are at the wrong weight** (400 instead of 600) because the title block is hand-copied into seven files — "Welcome back." renders lighter than the tagline beside it. An `AuthHeader` primitive would end it.
- **The whole phone entry network is the desktop auth layout rendered narrow** — `--cream-panel` ground (retired on mobile), a 24px gutter against the app's 20, bordered outline secondaries, a bordered centre-aligned register gate, disabled primaries at 70% opacity (the exact washed-lilac the contract retired) so "Join ministry" looks tappable and isn't.
- **"Copy invite codeShare link or QR"** — the two invite buttons render flush against each other with no separator; the one growth action on the page reads as a typo.
- **The invite-code field** is 680px wide for an 8-character code, and its placeholder is set in the same letterspaced style a real code would use — at a glance it looks already filled.
- **Two screens share the H1 "Choose a ministry"** for different jobs (switch vs find) and neither has a back control; `/pick-ministry` offers only Sign out as an exit.
- **The review step is read-only** — fixing a typo in the ministry name means Back ×3, Continue ×3. Its rows are the loose right-aligned label/value pattern the mobile contract replaced.
- **The wizard's step-1 primary is 34px out of column** on the phone (an empty placeholder span where Back would be) and the size cards wrap one word per line.
- **The approval notice is a green success check** on the one sentence that should register as a cost.
- **Legal/support pages** set a 44/600 hero H1 on a phone so "Delete your account" takes two lines; no hanging indent on the numbered steps; Support is vertically centred with half the fold empty above one button.
- **Entry screens use a different back glyph** (a hand-rolled ArrowLeft with a ~32px target, labelled "Back") than every screen after sign-in.
- **The Network screen lights no pill tab**, so a person can't tell where they are.

## 2. Design-system findings — by root pattern

- Nine screens on four unrelated chromes (split-shell auth · header+column `/ministries` · bare centred card · wizard two-panel); the two bare-card pages have no eyebrow, 26px titles at two different weights, and sit on two different grounds.
- Fractional type across four files (12.5 / 13.5 / 14.5 / 15.5) plus one `rgba()`; the entry network runs a private ramp.
- The landing runs its own display scale and spacing (68 / 46 / 38 / 36 / 26; 90 / 96 / 110) and the doc's §7.8 describes a landing that no longer exists — the code is right, rewrite the doc, and say the landing has its own scale so the app scale isn't read as violated.
- The toggle-off track has three instances and two values (`#D6D0C0` hardcoded in two files with a comment saying no token exists; `--dashed` in the third).
- The landing's product mocks render app chrome at 14/600 — advertising a heavier product than the one you land in.

## 3. Rules to add or change

**New:** the disabled-primary pattern (50% plum + a 13px reason line beneath) is good and undocumented — write it down with a tokenised disabled fill, not opacity. The split-shell title block (eyebrow → 44px serif ending in a period → 16px subtitle) is used eight times and named nowhere. Public/pre-shell screens at phone width use the Pocket ground rules even without a chrome row. One validation grammar per funnel: a blocked primary is disabled with one plain sentence; a danger ring never appears without its own message. The "choice row" card (icon tile, title, sub, chevron, whole card tappable) has three instances and no component.

**Change:** rewrite §7.8 from the shipped landing; give the marketing/auth surfaces an explicit spacing tier or snap them; the mobile token table (again).

## 4. Decisions that are yours

1. **Who is the landing for?** (a) Keep "Register your ministry" as the sole primary. (b) Two peers — plum "Join your ministry" + outline "Register". (c) One plum "Get started" into the existing fork. Recommendation: (b).
2. **Gender at signup.** (a) Hard blocker before the account exists (today). (b) Collect after landing, before small-group placement. (c) Required with "prefer not to say" routing to manual placement. The group generator is the reason it exists — how badly does it break if the field is empty for a week?
3. **Browse with no joinable ministries.** (a) Hide ministries that can't be joined. (b) Keep them, with "Ask a leader for the code". (c) A join *request* the admin approves — the mechanism already exists.
4. **The five backlogged presets in onboarding.** (a) Hide them. (b) Collapse to one quiet line. Do not leave five disabled cards in the founder's first five minutes.
5. **Pre-select workspaces?** Student Org Board + Small Group Leaders on by default, or keep the true zero?
6. **"Church" or "ministry"?** Pick one for the tenant; reserve "church" for a sending church.
7. **The Network tab:** hide until real, or keep as a roadmap signal costing a rail slot?
8. **Who may register?** "Register a church" reads "I'm a pastor, deacon, or elder." A student president or campus staff worker fits neither card.

## 5. How to look yourself

Open the landing on your phone, signed out, and find the door a student would take. Then tap a `/j/<code>` link and count how long it looks like it's loading. Then `/ministries` signed out on desktop — find Sign in. Then register a ministry as the sandbox admin: press Continue on step 1 empty, count the steps, read step 3, read the line above Submit.
