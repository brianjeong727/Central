## Fixing a token's contrast against the SURFACE can collapse it against its NEIGHBOUR (2026-08-02)

Retuning `--muted-text` for WCAG AA looked like a one-line token change. It wasn't, and the trap has
three layers — each only visible after fixing the one above it.

**Layer 1 — tune against the darkest surface, not the lightest.** `--muted-text` `#8A8497` was
3.51:1 on `--cream`, failing AA-normal. Tuning it to clear 4.5:1 *on cream* gives `#787186` — which
still fails on `--cream-2` (4.24), `--body-bg` (4.13), and `--ivory` (3.95). Central has seven cream
surfaces. **Always target the darkest surface the token actually lands on** (`--ivory` here), which
gives `#6E687B` and passes everywhere.

**Layer 2 — check the token against its NEIGHBOURS, not just its background.** `#6E687B` passes AA
on every surface, but `--body` vs `--muted-text` fell from **2.01:1 to 1.36:1**. Legibility went up
while the visual *hierarchy* went down: adjacent body and tertiary text started reading as the same
weight of information. A contrast fix can silently flatten a type ramp.

**Layer 3 — fix the flattening from the other end.** The instinct is to walk the changed token back,
but that just re-breaks Layer 1 (it bought 0.20 of separation for three failing surfaces). The right
move was darkening `--body` `#5A5466` → `#474251`, which re-opened the gap to 1.81:1 with every tier
still AA. The ladder ended up *evenly* spaced (ink↔body 1.96, body↔muted 1.81, muted↔faint 1.50)
where it had been lopsided — which is why it reads better, not just more compliant.

**Rules:**
- Never eyeball a token's replacement. Compute the ratio against every surface it appears on AND
  against the tokens directly above and below it in the ramp.
- A "one-line token change" that touches a text tier is a **product-wide visual change** — budget
  for a regression sweep across every tab, not just the surface that motivated it.
- Grep for hardcoded copies before AND after. This task found four (`--muted-foreground` — commented
  as mirroring `--muted-text` and drifting a full tier the moment it moved — plus `.typing-dot` and
  the Tiptap editor/view twins). Alias them (`var(--token)`), never re-copy the new hex.
- Opacity modifiers are invisible to a hex grep. `--muted-text/40` at ~1.9:1 survives every sweep.
  Grep for `/[0-9]` modifiers on text tokens too.

Related: [[faint-is-not-a-text-tier]]
