## `.shell-scroll` is not the scroller at phone width — the document is (2026-08-15)

`app/home/home-app.tsx` calls its `.shell-scroll` div "the SOLE scroll region on
mobile" in a comment, and `mobile_design_system.md` §3 says the same. That is true
as a LAYOUT rule (nothing else may scroll) but false as a DOM fact, and code that
reads a scroll offset needs the DOM fact.

Every height/overflow constraint in the chain is `md:`-prefixed:

    shell root   `min-h-screen`            + `md:h-screen md:overflow-hidden md:min-h-0`
    wrapper      (nothing)                 + `md:flex-1 md:flex md:flex-col md:overflow-hidden`
    scroll div   `overflow-y-auto min-h-screen` + `md:flex-1 md:min-h-0 md:overflow-hidden`

Below 768px none of those apply, so the div is auto-height and its content can
never overflow its own box. Measured on the announcements tab at 390px:

    .shell-scroll   scrollHeight 1920 === clientHeight 1920   → NOT scrollable
    after 600px     .shell-scroll.scrollTop 0, window.scrollY 600

**`element.scrollTop` on that div is a permanent 0 at exactly the width mobile
gestures run at.** `overflow-y: auto` is not evidence that an element scrolls —
only `scrollHeight > clientHeight` is.

This shipped as a bug in pull-to-refresh: the gesture's top-anchored guard
(`if (node.scrollTop > 0) return`) was meant to keep it from arming mid-page, and
it never once fired. Pulling down halfway through a feed armed the refresh, and
the non-passive `touchmove` then `preventDefault`ed the drag — so the gesture ate
the scroll instead of scrolling. The guard read as obviously correct in review;
nothing about the line reveals that its input is a constant.

**Rule: any code reading a scroll position from the shell scroller must fall back
to the document when the node isn't itself scrollable.**

```ts
function effectiveScrollTop(node: HTMLElement): number {
  if (node.scrollHeight > node.clientHeight) return node.scrollTop
  return window.scrollY || document.documentElement.scrollTop || 0
}
```

Corollaries:

- **A guard whose input is a constant fails silently and looks fine.** It never
  throws and never logs; the only symptom is the guarded thing happening when it
  shouldn't. Assert the guard BLOCKS something, not just that the happy path works
  — the pull-to-refresh spec's mid-page case is the half that carries the signal,
  and it was verified to fail on the old code before being trusted.
- **A layout rule and a DOM fact are different claims.** "Nothing else may scroll"
  does not tell you WHICH element scrolls, and a comment asserting the former will
  be read as the latter.

Related: [[2026-08-07-nav-clearance-belongs-to-the-shell]]
