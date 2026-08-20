## A gear-reached screen is invisible to a row-discovery sweep (2026-08-20)

`e2e/mobile-screen-sweep.mobile.spec.ts` discovers screens by walking every
`[data-pocket-row]` and backing out via `.back-chevron`. That is genuinely
self-maintaining for hub-and-spoke navigation — and it is exactly why team
settings rotted for months while the sweep reported 30 screens and 0 violations.

Team settings is opened by the `IconButton title="Team settings"` gear in
`PocketHubChrome`, not by a row. So the walk could never reach it, and it
accumulated every violation the sweep exists to catch: a second header row under
the chrome (identity + chat + trash, with a `--line-3` rule across the screen),
a hand-rolled action rail instead of `MobileChromeActions`, desktop
`PlanSectionHeader` serif-plus-rule section headers, a desktop 36×20 toggle with
a hardcoded hex track, and — on its add-member sub-view — a `PocketBackRow`
stacked directly under `SubpageShell`'s own back chevron. Two back arrows on one
screen, on a rule (§0.3 "one chrome chevron, ever") that two comments elsewhere
in the same file already cite.

Two corollaries:

1. **Discovery covers one affordance; every OTHER entry point needs an explicit
   hop.** The sweep already knew this — it hand-hops into ChatScreen (a card) and
   the event workspace (a card). The gear is a third affordance and nobody added
   it. When you build a screen, ask which affordance opens it, and if the answer
   isn't "a PocketRow", the sweep does not have it.

2. **A skip that isn't printed is indistinguishable from a pass.** The sweep's
   whole Plan branch — Team hub, its sections, the event workspace and all its
   spokes — was gated on `if (teamId)`, seeded from "whatever team-owned event
   happens to be in this sandbox". There is none in the current lane, so the
   entire subtree silently vanished from a run that still printed "0 violations".
   The file's own header says an unreached screen must print SKIPPED; the rule
   was written for the leaf checks and not applied to the branch guards. Same bug
   in `mobile-subpage-gutter`: the "no team-owned event" `test.skip` sat in a
   `beforeEach`, so it also disabled the team-settings gutter test — a test with
   no event in it at all.

See [[a-hand-listed-spec-cannot-fail-for-a-screen-it-never-loads]].
