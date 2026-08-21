## The screen sweep couldn't see overlays, and row ORDER was the only thing hiding it (2026-08-20)

Moving one row from the top of the mobile chat list to the bottom turned
`e2e/mobile-screen-sweep.mobile.spec.ts` from a 2.8-minute pass into a 15-minute
timeout — with no margin violation anywhere behind it.

**The mechanism.** The walk decides whether tapping a row navigated by comparing the
row list before and after. `ChatScreen` is `fixed inset-0`: it does NOT remove the
list beneath it from the DOM, and **Playwright's `visible` filter tests layout, not
occlusion** — an element under a full-screen overlay is still "visible". So opening a
chat left the row list byte-identical and read as *nothing happened*. The walk moved
to the next row without backing out, and every remaining tap on that screen was a
click into a covered list — each burning the 30s default actionability timeout,
swallowed by `.catch(() => {})`.

**Why it had never fired.** The chat list's one NAVIGATING row (Open groups) happened
to be first. It was tapped and backed out of before any chat row could cover the
screen; the chat rows came last, were misread as no-ops, and the loop simply ended.
The bug was fully present and completely invisible. **Reordering a list is not a
cosmetic change to a test that walks it in order.**

**Three things to keep:**

1. **"Nothing changed in the DOM I'm watching" is not "nothing happened."** Any
   no-op detector needs a signal that a NEW SURFACE appeared, not just that the old
   one is unchanged. Here: every stacked mobile header routes through `BackChevron`
   (Convention #22), so counting visible `.back-chevron` elements is an exact overlay
   detector — an opened surface always adds one, an inline toggle never does. The same
   check belongs on the way BACK, or an overlay that failed to close masquerades as a
   successful return and the next row is tapped into it.
2. **A swallowed click needs a short timeout.** `.click().catch(() => {})` on the 30s
   default is the difference between a walk that finishes and one that eats its whole
   budget. If you are deliberately ignoring a failure, make it fail fast — 3s here.
3. **A timeout is not a verdict.** This spec collects violations and asserts once at
   the end, precisely so a run reports what it found — but dying at the Playwright
   ceiling kills the process before the summary prints, so a run that checked 40 clean
   screens reported nothing at all. The spec's own comment says this had already
   happened twice. **When a suite times out, the answer is never "probably fine" and
   never "probably load" — bisect it against the previous commit.** I asserted it was
   load, then asserted it was mine, then walked that back on a confounded second look,
   before actually measuring. The baseline run was the only step that ever produced
   information; everything before it was narration.
