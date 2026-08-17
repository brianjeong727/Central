## An unchecked box is not evidence of open work (2026-08-17)

A `/nextstep` product-direction call read `APPSTORE_SUBMISSION_STEPS.md` — a doc whose own
first line says *"Throwaway checklist — delete when done"* — and offered "finish the App Store
submission" as one of two strategic directions. Brian's answer: it's already done. The whole
direction was fiction produced by a doc nobody deleted.

This is not a one-off. The sweep that followed found the same shape everywhere:
`tasks/run-sheet-plan.md` carried **21 unchecked boxes** while Run Sheet P1 runs live in
`app/actions/event-confirmations.ts` and an hourly `run_sheet_tick()` cron. `tasks/todo.md`
had 23 unchecked boxes on shipped work (account deletion, URL-state params) inside 517 lines
of completed sections. Fifteen docs in total described a Central that no longer exists.

**The trap:** a plan is written BEFORE the work and abandoned AFTER it — the checkboxes are
ticked in reality, not in the file. So staleness is invisible from inside the doc: an
abandoned plan and a live backlog are byte-identical. Recency doesn't separate them either
(a 3-week-old doc can be live, a 3-day-old one dead).

**The rule:** a doc is a CLAIM about the codebase, never evidence. Before letting any plan,
checklist, or status doc drive a decision, verify its claim against something that cannot
go stale — the code, the schema, the live database, the git log. One grep would have
settled it: `grep -rl event_confirmations app/` for the run sheet, and for the App Store,
asking Brian rather than reading his own abandoned checklist back to him.

Corollary for CLAUDE.md's source-of-truth rule (already stated for schema: *"Source of
truth: the live database"*) — it generalizes. **Every doc is downstream of something
authoritative; go to the upstream thing.**

Corollary for writing docs: a plan that outlives its work becomes a trap for the next
session, so the outcome belongs somewhere durable (CLAUDE.md, a lesson, the commit message)
and the plan itself should be deleted, not archived "as a record." `tasks/todo.md` now
carries that rule in its own header.
