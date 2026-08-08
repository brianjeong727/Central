## The keyboard is a layout input, not an event (2026-08-08)

Typing in a mobile chat showed a composer floating in blank cream — no header,
no transcript, an iOS `^ v Done` bar wedged underneath. The instinct ("iMessage
must ship its own keyboard") is wrong, and so is the instinct one level down
("add a keyboardWillShow listener and nudge the composer").

**iMessage and Messenger use the stock system keyboard.** What they do
differently is shrink the SURFACE. Nothing moves up; the container gets shorter
and the flex column re-lays out — header pinned, transcript shorter, composer on
the keys. Once framed that way the fix is a height, not a handler.

The trap that made it look otherwise: a `fixed inset-0` overlay is anchored to
the LAYOUT viewport, which the keyboard does not shrink. So the composer stays
at the bottom of a full-height box, lands under the keys, and iOS does the only
thing it can — scrolls the whole document to reveal the caret. Everything
scrolling away was never a scroll bug. It was the browser compensating for a
layout that never made room.

**Two values, not one.** How much the keyboard OCCLUDES and WHETHER a keyboard
is showing are different facts, and conflating them breaks one container or the
other:

- In the Capacitor shell (Keyboard plugin, `resize: "native"`) iOS shrinks the
  WKWebView itself. The occluded amount is genuinely **0** — the viewport IS the
  visible area.
- In mobile Safari nothing resizes. The occluded amount is the real keyboard
  height.

`window.innerHeight - visualViewport.height` reports the right number in BOTH
with no branch, which is why `--kb-inset` is one expression and not a fork. But
`env(safe-area-inset-bottom)` has to collapse in both cases (the home indicator
is behind the keys; reserving it leaves a dead band under the input pill), and
that is true in the container where the inset is 0. Hence a separate
`[data-kb-open]` flag. Deriving "open" from `inset > 0` would have silently
skipped the whole native path.

**Half the fix cannot ship on a web deploy.** The remote-URL shell means JS
lands instantly, so it is easy to forget that `resize: "native"` and
`setAccessoryBarVisible(false)` are native config — they need `npx cap sync ios`
plus a new binary. The accessory bar in particular has no web equivalent: no
amount of CSS removes it.

**Testing it.** Playwright cannot raise a software keyboard, and it does not
need to — the contract boundary is the two published values. Driving
`--kb-inset` + `[data-kb-open]` directly tests the half that can regress in this
repo; the measurement half lives in iOS. Verified as a real guard by removing
`kb-lift` and watching the composer land at 827px against a 508px keyboard line.
A layout spec that has never been seen to fail is not a guard.
