## A title-matched seed wipe crossed into a live season and destroyed real work (2026-08-01)

`scripts/seed-ccsf-events.mjs` re-seeds the 2025–26 CCSF fixture by deleting "the events it
owns" — matched by `ministry_id + team_id + title IN FIXTURE_TITLES`, with **no date bound**.
But "Start next season" copies events forward under the **same titles**. So a routine re-seed
of last season silently deleted Central's live 2026–27 season on 2026-07-31 22:45 UTC —
`calendar_events`, `event_plans`, `event_tasks`, `event_roles`, `event_notes` — including
board work that had deviated from the fixture. Nothing survived: the cascade was clean, zero
orphaned rows anywhere. Unrecoverable short of a cross-project backup restore, which wasn't
worth it for the volume; the season was rebuilt by hand instead.

**Why:** an identifier that is unique *within* a season is not unique *across* seasons. The
script's own header even documented the behavior ("a season rolled forward … IS therefore
wiped too") — documenting a footgun is not the same as disarming it, and a comment cannot
protect data. The wipe was also **silent**: it logged a count, never the rows, so the loss was
invisible until a human happened to open the board and notice a whole season missing.

**How to apply:**
- A destructive fixture cleanup must be bounded by the **window it owns**, never by name/title
  alone. Derive the bound from the fixture data itself (`SEASON_FROM`/`SEASON_TO` computed from
  `HISTORY_DATES`) so it cannot drift out of sync when the fixture season moves.
- Any seed/cleanup that deletes must **name what it spared**, not just what it removed. The new
  `LEFT ALONE:` block prints every same-title row outside the window; a silent delete is how
  this stayed invisible for a day.
- Before writing a `delete().in(<natural key>)`, ask what else in the tenant could legitimately
  carry that same key. Rolled-forward seasons, cloned templates, and duplicated events all
  reuse titles by design.
- Sandbox-only allowlists (`SEEDABLE_MINISTRY_IDS`) protect the wrong axis. They stop you
  writing into a *real congregation*; they do nothing about destroying *real work inside a
  sandbox*. Central is a sandbox tenant that carries genuine board data.
- E2E was NOT the culprit here and was correctly scoped (`E2E Sandbox` / `E2E Sandbox 2` only) —
  but `e2e/season-rollover.spec.ts`'s `cleanupRolled()` uses the same title-match shape. It gets
  away with it because it bounds on `.gte("start_date", "2026-07-01")`. Keep that bound.

Related: [[project-personal-sandbox]]
