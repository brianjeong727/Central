## A screenshot taken after an edit can be a STALE compile — measure computed styles before you "fix" what you see (2026-08-15)

While building the chat-row swipe actions I changed two token values and added a CSS
class, re-ran the capture spec, and read the PNG. Twice the screenshot showed the OLD
render — once for the tile colours, once for a `bottom` that had no effect at all. Both
times the source file on disk was already correct. The slot's `next dev` (Turbopack) had
served a stale stylesheet/chunk to a *fresh page load*, so the run genuinely exercised
code that no longer existed.

The failure mode is nasty because the screenshot is not obviously wrong — it is a
plausible render of a real earlier state. The instinct is to conclude the change didn't
work and go edit the code again, which is how you end up "fixing" something twice and
landing a change you never actually saw.

**Rule: when a visual change appears not to have applied, PROVE it from the DOM before
touching the code again.** A ten-line throwaway spec that reads
`getComputedStyle(el).backgroundColor` / `.bottom` / `getBoundingClientRect()` and
`console.log`s it settles in 30 seconds what another round of screenshot-staring cannot.
This is the same discipline the mobile-screen-sweep learned the hard way (CLAUDE.md
Convention #27: "when a screen measures wrong, measure it directly before touching the
UI — fix the detector, never the threshold") — it applies to your own eyes too, not just
to a spec's assertions.

When the probe confirms the DOM really does have the old value: `kill` the dev server,
`rm -rf .next`, restart. Both times that cleared it instantly. HMR is not a guarantee,
and a spec that navigates fresh is not a guarantee either.

Corollary for the capture specs themselves: a shot of a row you already swiped open is
not a shot of the other direction — dragging the opposite way from an open row correctly
just closes it. Reload (or explicitly close) between captures, or you will photograph a
rest state and think the gesture is broken. See [[swipe-actions]].
