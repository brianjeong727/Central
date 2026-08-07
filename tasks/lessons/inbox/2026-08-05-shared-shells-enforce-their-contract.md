## A shared shell must ENFORCE its layout contract, not document it (2026-08-05)

`SubpageShell` is Central's full-bleed mobile subpage: its own 20px screen padding
is supposed to be the ONLY horizontal inset, so a drilled-in screen sits at the same
gutter as the tab root it was opened from. The contract was real, correct, and
written down — as a comment at the mount sites:

```jsx
{/* Receipts + Finance render FULL-BLEED (no px-5 wrapper) so their detail
    SubpageShell is the only horizontal inset … */}
```

Team settings, Receipts and Finance obeyed it. The event workspace didn't — it
mounts inside the Plan tab's `md:hidden px-5 pb-28` body wrapper, so its own `px-5`
stacked and every event screen rendered at **40px instead of 20**, chrome row
included. Nothing failed; it just looked subtly narrower than the list it came from,
and it survived a full design pass before a human noticed the page "felt padded".

**Rule: when a shared component's correctness depends on WHERE it is mounted, the
component must defend itself.** A comment at the call site is not enforcement — it
is a request, and it will be missed by the next mount. `SubpageShell` now measures
the symmetric horizontal padding its ancestors impose and cancels it, so it lands at
20px from anywhere. Mounted correctly the correction is 0 and nothing changes.

Generalisations worth carrying:

- **"Every consumer must remember X" is a design smell.** Either the component can
  enforce X itself, or a test must. Prefer the component — a test only covers the
  screens someone thought to test.
- **Measure before theorising about spacing.** Eyeballing screenshots produced three
  wrong guesses; one `getComputedStyle` walk up the ancestor chain printed
  `padL=20 / padL=20` and ended the discussion in one run. When a gap looks wrong,
  dump the ancestors' padding — do not reason about which wrapper "probably" owns it.
- **Cancel only SYMMETRIC padding.** An ancestor with asymmetric padding is doing
  something deliberate (a rail, an inset strip); a blanket de-bleed would fight it.
- **Do the correction in a layout effect, not an effect.** `useLayoutEffect` lands
  it in the same frame as mount; `useEffect` shows one painted frame at the wrong
  inset, which reads as a jump.

Related: [[2026-08-05-mobile-chrome-actions-are-a-slot]]
</content>
