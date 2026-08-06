## A value copied into four components is four values — tokenize the box, not just the color (2026-08-05)

Central tokenizes colors, radii and spacing steps rigorously, and then hand-typed
`padding: "12px 20px 10px"` into every mobile chrome row. Four copies. They drifted
exactly as you'd expect, and nobody noticed for months because each screen looks
fine in isolation — the defect only exists in the TRANSITION between screens:

    PocketChrome / SubpageShell   12   ← the intended value, 11 screens
    PocketHeader (Home)           14   ← --space-6, one step off
    PocketHubChrome                0   + host wrapper's 24
    Directory                     56   (`pt-14`)

Drilling from the events list into an event made the title jump 12px up. Brian
caught it by putting two screenshots side by side; no single screen looks wrong.

**Rule: if a multi-property BOX (padding/gap/size) defines a shared rhythm, export
it as a constant, not a comment.** A token isn't only for a color — `12px 20px 10px`
IS a design decision, and the moment it is typed twice it will eventually be two
decisions. This is the same failure as [[2026-08-05-shared-shells-enforce-their-contract]]
from the same session, one layer down: there a contract was documented rather than
enforced; here a value was duplicated rather than shared.

Corollaries:

- **Split the constant along its real axes.** `PAD_Y` and `PAD_X` had to be separate
  exports: a chrome row nested inside an already-inset wrapper must take the
  vertical rhythm but NOT re-apply the horizontal gutter. One blob would have forced
  callers back to hand-typing.
- **Some defects only exist between screens.** Alignment, rhythm, and transition
  bugs are invisible in per-screen review. When a value is supposed to be shared,
  the test must SWEEP the screens and compare, not check one.
- **Don't chase the last few px of visual variance.** After the fix the title tops
  still ranged 13–19, because a short title centers inside a taller chevron row.
  The BOX is the invariant; the glyph position follows from it. Assert the box (or a
  band that is provably just centering slack) and stop.

Related: [[2026-08-05-shared-shells-enforce-their-contract]]
</content>
