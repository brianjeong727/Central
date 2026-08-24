## A test that scrolls the page itself proves nothing about the app (2026-08-24)

Shipped a fix for "the verse types itself under the keyboard" with an e2e that:
set `--kb-inset`, scrolled the page to the bottom **itself**, then asserted the
field cleared the keyboard. It passed. The fix did not work, and Brian came back
with the same complaint.

The test proved the ROOM existed. The bug was that nothing ever used it.

**Rule: when the fix is "the app moves something", the test must not move it.**
Set up the world, do the user's action, wait, and measure. If the assertion needs
a `scrollTo` to pass, the assertion is about the DOM, not about the feature.

**And prove the test can fail.** One line — comment out the scroll and run it.
Here that took thirty seconds and printed `verse bottom 845 must clear the
keyboard at 544`, which is the actual bug, in the actual numbers. A test that has
never been seen red is a test whose subject you have not identified.

Second-order lesson about the fix itself: `scrollIntoView({block:"center"})` is
the wrong instrument under `resize: "none"` (Convention #28). It centres inside
the LAYOUT viewport — the whole screen, keyboard included — so "centred" can
still be behind the keys; `html { scroll-behavior: smooth }` makes it animate,
and a smooth scroll started while iOS animates the keyboard in gets clobbered by
iOS's own scrolling. Compute the overflow against the real visible bottom
(`min(visualViewport.offsetTop + height, innerHeight - --kb-inset)`) and scroll
by exactly that, instantly.

Related: [[2026-08-24-kb-lift-eats-the-padding-it-lands-on]].
