## `.kb-lift` eats whatever padding-bottom it lands on (2026-08-24)

`.kb-lift` (globals.css, Convention #28) is `padding-bottom: var(--kb-inset)`,
unlayered so it beats Tailwind utilities. `--kb-inset` defaults to **0px**. Put
the class on an element that already carries `pb-6` and the element loses its
bottom padding entirely for the ~100% of the time no keyboard is up — the class
does not ADD to the padding, it replaces it, and its resting value is zero.

Hit while giving the mobile profile form room to scroll a field clear of the
keyboard. `className="kb-lift pb-6 …"` looked right and quietly deleted the page's
bottom spacing.

**Rule:** `.kb-lift` goes on an element whose padding-bottom is otherwise
unclaimed — in practice its own SPACER div, not a layout wrapper:

```tsx
<div className="kb-lift md:hidden" data-kb-spacer aria-hidden />
```

The chat surfaces get away with it because the composer wrapper they put it on
has no padding of its own. Anywhere else, use the spacer.

Related: [[2026-08-24-a-state-rule-cannot-cancel-an-inline-style]] — the same
family of surprise (a declaration winning a fight you didn't know it was in).
