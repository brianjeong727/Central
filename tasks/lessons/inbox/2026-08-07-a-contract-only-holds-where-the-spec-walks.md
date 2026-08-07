## A contract only holds over the screens the spec actually walks (2026-08-07)

Three times now I've said a mobile rule was "enforced everywhere" when the spec
guarding it walked ~10 hand-listed screens. Brian caught it each time by opening a
screen the list didn't name — Finance sections, then the settings subpages.

A hand-written list of screen names is the wrong shape for an "every screen" rule.
It cannot fail for a screen it never loads, so it rots silently as sections ship.
The fix is to DISCOVER screens from the design system's own primitives:

- `PocketRow` (`data-pocket-row`) is the one drill-in affordance at phone width, so
  recursively walking every row reaches every hub-and-spoke screen. Coverage went
  27 → 44 screens the moment it stopped being a list, picking up Groups, Rotations,
  the Transport spoke and six meeting-note details nobody had listed.
- `.back-chevron` (Convention #22) is the one "up a level", so backing out is
  equally generic.

**A sweep must report every violation, not die on the first.** Failing on screen 3
tells you nothing about screens 4–44. Collect into an array, assert `toEqual([])`
at the end with the list in the message.

### The measurement lies more often than the UI is broken

Of six sweep runs, three were invalid for reasons that had nothing to do with the
code, and each one initially looked like a real defect:

1. **Read mid-hydration.** Polling until the value is non-null catches whatever
   frame it lands on — Home's row is 24px until the avatar chip sizes it, then 19.
   Reported as a 22px violation. Poll until the reading is STABLE (two identical
   consecutive reads), not until it exists.
2. **A subtree dropped because its data hadn't painted.** The walk read a hub's
   rows before they rendered, so Finance's three sections silently vanished from a
   run. Nothing failed, so it read as "covered." Wait for the rows.
3. **A seed that matched nothing.** The announcement query filtered
   `status='published'`; older sandbox rows predate that column, so the detail
   screen was never loaded — indistinguishable from passing.

Rule: **an unreached screen must be visibly SKIPPED in the report.** A silent skip
and a pass look identical, and that is precisely how the first pass "covered"
Directory→member and the event spokes without ever loading them.

Corollary, learned the hard way twice in this session: when a screen measures wrong,
**measure it directly before changing any UI.** Home's 22px was a detector bug, and
"fixing" the chrome row would have broken a correct screen to satisfy a broken test.
Fix the detector, never the threshold — see [[mobile-chrome-rhythm-band-is-centering-slack]].

### Don't run `npm run build` while the slot's dev server is live

It wipes `.next` under the running `next dev` and every route 500s, which invalidated
a whole sweep run. Either stop the dev server first or run the build after the e2e
pass — never interleaved.

Related: [[2026-08-05-commit-before-ab-testing-against-base]].
