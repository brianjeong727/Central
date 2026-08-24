## The poll composer predated the form primitives, and nothing said so (2026-08-24)

Brian: "the poll creation UI looks stale." It was — measurably, not just in feel.

**What it was made of.** A `CentralModal` wrapping hand-rolled Tailwind: inputs with
their own border/radius/padding, their own `focus:border-plum/40` in place of the
shared `central-field` focus rule, labels at their own tracking rather than
`EYEBROW_STYLE`, a bare 16px `X` per option row with no tap target, and a full-width
`text-white` submit at 12px radius overriding the modal's own right-aligned footer.
Every one of those is a primitive that exists (`Input`, `FormField`, `IconButton`,
`CentralButton`) and that the surface was written before, or beside.

**The tell that mattered visually.** The inputs painted `--cream-panel` on a
`--cream-panel` modal, so at phone width — where chat actually lives — the option
fields all but disappeared into the sheet behind them. `Input` paints `--cream` on
`--line-2` precisely so it separates from a panel. A hand-rolled control does not get
that decision for free; it gets whatever token the author reached for that day.

**Why "stale" is the right word and not "ugly".** Nothing about it was broken. It
simply stopped receiving the system's decisions: focus behaviour, tap targets,
disabled treatment, footer grammar, the accidental-dismiss guard (`dirty`) that every
other creation modal now has. Drift is silent by construction — the surface keeps
working while the rest of the app moves.

**Cheap check for the next one.** In a file that already imports from
`@/components/central`, grep the JSX for `className="...px-...py-...rounded-...border-`
on an `<input>`/`<button>`. A raw control inside a design-system consumer is drift
almost every time; the hex ratchet does not catch it because the values were tokens
all along.

**Coverage gap it exposed.** `poll-composer-keyboard.spec.ts` was the only poll spec
and asserts the sheet clears the keyboard — so the entire question-and-options form
could have been broken and every poll test still passed. That absence is what made a
purely visual refactor risky. `e2e/poll-create.spec.ts` now drives the real thing:
fill, add a third option, remove it, re-add, submit, and assert the poll and its
message in Postgres. Written against BEHAVIOUR (placeholders, button names, persisted
rows), never markup, so the next redesign does not have to rewrite it.

**Detail worth keeping.** `FormField`'s `helper` renders AFTER its children, so
"Two to five choices." landed under the Add-option button and read as a caption for
it. The cap moved into the label row as a mono METRIC ("2 of 5", mixed case per the
contract card) — and it counts ROWS, not filled options, or it reads "0 of 5" with two
empty boxes directly beneath it.
