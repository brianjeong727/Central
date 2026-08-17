## A card can be load-bearing for LAYERING, not just looks (2026-08-16)

Removing the `PocketRowCard` from the mobile chat list was supposed to be
subtractive — delete a wrapper, move padding onto the rows. The first render came
back with every row painted a flat ivory block on the cream page.

`SwipeActionRow` renders the action panel BEHIND the row and hides it with an
opaque foreground layer, and that layer hardcoded `background: "var(--ivory)"` —
correct, invisibly, for as long as the row lived inside an ivory card. With the
card gone the foreground was still ivory while the page had become `--cream`, so
the thing that had been "matching its container" now read as a styling bug.

The same wrapper was carrying a second invisible job: `MonogramChip`'s presence
dot draws its ring as a fake cut-out, so `dotRing` has to equal whatever is behind
the avatar. It was `--ivory` for the same reason. (The cdesign handoff caught this
one and called it out; it did not catch the swipe layer, because the prototype has
no swipe actions.)

**Rule: before deleting a container, ask what else was reading its fill.** Grep the
subtree for the container's own token — `--ivory` here — and check each hit for
whether it is describing ITSELF or describing its BACKDROP. A backdrop reference is
a hidden coupling to the parent, and deleting the parent silently invalidates it
rather than breaking the build.

Corollary on the fix shape: both were hardcoded values that happened to be right.
Both are now explicit parameters (`surface` on SwipeActionRow, `dotRing` already
was one) with the default kept at the old value, so the ~18 in-card consumers are
untouched and the coupling is stated at the call site instead of assumed.

Corollary on catching it: neither `tsc` nor `verify.sh` nor the screen sweep can
see this — the sweep measures POSITION, and the rows were positioned perfectly. It
took looking at a screenshot. Layering bugs are invisible to every gate we own.

Related: [[enforce-the-type-not-just-the-position]].
