## Enforcing WHERE a thing sits is not enforcing WHAT it looks like (2026-08-09)

**What happened.** Convention #27 pinned the mobile chrome row's rhythm
(`POCKET_CHROME_PAD_Y`) and an e2e asserted the title's vertical POSITION. It was
described — by me — as enforced. Brian then found subpage headers that were
obviously wrong: the announcement and member-sheet back-labels rendered at **15px
in plum, 2px left** of where a root title starts, against a 22px ink root.

Nothing had regressed. The rule only ever covered position, so five chromes drifted
apart on TYPE while every assertion kept passing:

| chrome | was |
|---|---|
| tab roots | 22 ink |
| `PocketHubChrome` | 22 — **20 whenever it carried an action** |
| Announcements row | 20 ink |
| `SubpageShell` with title | 20 ink |
| `SubpageShell` back-label | **15 plum**, x−2 |
| chat header | 20, and a 16px gutter |

**The rule.** When you ratify a shared visual contract, pin every axis a consumer
can vary — position AND type AND colour — or name the unpinned ones as
deliberately free. "Enforced" means an assertion fails when it changes; an axis with
no assertion is not enforced, it is merely currently-consistent.

**Two enforcement layers, because one is always the wrong shape:**
- **Structural static check** (`scripts/check-chrome-title.sh`, blocking in
  `verify.sh`): any file importing `POCKET_CHROME_PAD_Y` — i.e. building a chrome
  row — must consume `POCKET_CHROME_TITLE`. Grepping for the VALUE (`serif +
  fontSize 22`) was tried first and is useless: it flags body headlines, modal
  titles and stat values, none of them chrome. Match on the structural signal, not
  the styling.
- **Runtime sweep**: measure the real row's font-size and colour on every screen
  the walk discovers.

---

### The detector lied in two directions, and one hid a real bug for months

Adding the type assertion produced 11 violations. **Nine were the detector's fault:**

1. It measured the flex WRAPPER span (which inherits 16px) instead of the leaf
   title — reporting eight healthy `SubpageShell` screens as 16px. Fix: require
   `children.length === 0`.
2. It measured the chat AVATAR's initials as a title — leaf text, 13px, sitting in
   the chrome row. Fix: skip `[data-monogram]` (a marker added to MonogramChip),
   not a size heuristic.

Trap 2 is the one that matters: because the detector had been reading the avatar,
the chat header's title offset was never measured, and it had sat at **y=20 against
a 12–19 band since it shipped** — centred on a 40px avatar where every other chrome
row is 34. **Fixing the detector is what exposed it.**

**Generalize:** a green check on the wrong element is worse than no check — it buys
false confidence and hides the defect it was meant to catch. When a detector starts
reporting violations, verify the ELEMENT it measured before believing either the
pass or the fail.

Related: [[a-contract-only-holds-where-the-spec-walks]]
