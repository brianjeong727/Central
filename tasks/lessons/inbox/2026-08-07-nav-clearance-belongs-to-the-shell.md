## Fixed-overlay clearance belongs to the scroll container, once — never to pages (2026-08-07)

Brian: "every time i scroll to the bottom of a page, i can always scroll so much
further than the last thing on the page."

Measured rather than eyeballed. Dead space below the last *real* content:

| surface | before | after | needed |
|---|---|---|---|
| mobile home | 260px | 128px | 74px |
| mobile settings | 267px | 135px | 74px |
| desktop (any) | 40px | 40px | ~40px ✓ |

Cause: `pb-28` (112px) was on the shell's scroll region AND on all 18 tab/section
roots inside it. Both are in the same box, so they stack — ~260px reserved where
the pill needs 74px, i.e. ~190px of scroll past your own content. Desktop was
never affected (`md:pb-0` everywhere).

**Rules:**
1. Clearance for a FIXED overlay (nav pill, sticky footer, toast rail) belongs to
   the scroll container, exactly once. A page inside that container adding its
   own is double-counting — and it's invisible in review, because each `pb-28`
   looks locally correct.
2. Derive the value from the overlay's real geometry, don't guess it:
   `--nav-clearance: calc(env(safe-area-inset-bottom) + 14px + 60px + var(--space-7))`
   reads the pill's own inset/offset/height. The old fixed 112px was wrong in
   BOTH directions — too much on a flat-bottom phone, too little on a notched one
   because it ignored `env(safe-area-inset-bottom)`.
3. Apply it as a CLASS, not an inline style. An inline `paddingBottom` outranks
   the `@media (min-width:768px)` reset and leaks the pad onto desktop, where
   there is no pill. (Caught while writing this — the first attempt did exactly
   that.)

**Measuring technique worth reusing.** Two tricks made this tractable:
- Take the bottom-most **leaf** element, not any descendant. A wrapper's
  `getBoundingClientRect()` includes its own padding, so measuring against
  wrappers hides precisely the padding you're hunting.
- Force overflow with a SHORT viewport (390×520). Dead space is structural, so it
  measures identically — and it makes thin pages scrollable, which answers the
  "not every page has enough content to test" problem directly.

Related: [[e2e-fixtures-must-be-time-relative]] — the same degraded-dev-server
trap reappeared while verifying this (two specs failed together, both passed
alone, all 28 passed after a restart). Restart before believing a regression.
