## A CSS state rule cannot cancel an inline style (2026-08-24)

`components/central/*` styles almost everything inline. That is fine until a
property needs a STATE — a `[data-armed]`, a `:hover`, a media query — because an
inline declaration outranks every stylesheet rule short of `!important`.

Hit while building the chat row's full-swipe commit. The action tiles carried
`borderLeft: "1px solid var(--line-3)"` inline, and the armed state's
`.swipe-panel[data-armed="1"] .swipe-tile[data-commit="0"] { border-left-color: transparent }`
silently lost. The slab that was supposed to read as one unbroken surface kept a
hairline cutting it exactly where the seam used to be — and the computed style
reported `1px / rgb(239,233,218)`, i.e. the rule never applied at all, which is
the tell. Fix was to move BOTH halves into globals.css (`.swipe-tile { border: none }`
plus `.swipe-tile + .swipe-tile { border-left: … }`), where the state rule can
out-specify them.

**Rule:** if a property will ever be overridden by state, it does not go inline —
it goes in globals.css from the start. `+`-sibling selectors are also a truer
statement of "not the first one" than an index check computed in JS.

It then happened a SECOND time in the same task, which is why it is worth a file:
the tile's `color` was inline too, so the armed state's `--danger` step on a
destructive tile silently did nothing and the tile stayed ink. Same shape, same
half-hour. Writing the lesson did not stop me repeating it two edits later —
the only thing that would have is auditing every inline property on the element
for "does this have a state?" the first time.

**Second half of the same bug, worth knowing separately:** two adjacent boxes at
any DPR above 1 land on fractional device pixels, and the sliver between them
shows whatever is BEHIND them. So even with the seam gone, the page cream still
bled through as a hairline. A slab made of adjacent tiles must paint its own
container the same fill — the tiles alone are not enough.

Related: [[2026-08-20-turbopack-serves-a-stale-bundle-after-an-edit]] — this was
diagnosed twice against a stale render before the dev server was restarted, which
is the second time that lesson has been paid for.
