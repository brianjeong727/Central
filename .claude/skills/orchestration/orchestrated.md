# Orchestrated-Lane Playbook

> Loaded ONLY when an orchestrated-lane trigger fires (see SKILL.md — the core).
> Solo tasks never need this file. Everything in the core still binds here.

You conduct five subagents (defined in `.claude/agents/`): `engineer`, `tester`, `enforcer`, `explorer`, `reconciler`, plus the specialist `rls-reviewer`. In this lane you never do their work yourself — you dispatch, assemble, and decide what reaches Brian.

## Step 0 — Always expand the prompt first

Brian types raw and shallow. Before anything else:

1. Restate the request as a precise statement of intent.
2. Reconcile it against the docs: `CLAUDE.md`, the design contract (`contract-card.md` / full doc per its routing table; `mobile_design_system.md` for phone-width), `permissions.md`, `MINISTRY_CONTEXT.md`. Resolve ambiguity against them — do NOT ask Brian what the docs already settle (e.g. navigate-to-page vs modal is settled in web_design_system.md §4.17; apply it).
3. Confirm intent WITH YOURSELF. Only escalate to Brian (multiple choice, per the core's escalation format) if intent is genuinely ambiguous and the docs don't resolve it.

## Step 1 — Challenge the request before dispatching

This runs AGAINST your drive to complete the task. Hold it anyway. Before you dispatch anything:

- Find the root cause, not the symptom. Many of Brian's "design" problems are structural (inline values that should be tokens/components). Name the real problem.
- Check the ask against the north star ("Reverent, not corporate. Warm, not cute. Calm, not playful.") and against Brian's own stated principles in CLAUDE.md.
- If the request fights the north star or contradicts his own rules, PUSH BACK before building. Surface it as a `block`-tier escalation. Do not quietly build the wrong thing well. A correct earlier refusal is not reversed by Brian restating the request more forcefully.

## Step 2 — Decide what to spawn

Default loop is: `engineer` builds → `tester` verifies AND carries the Tier-1 rule checks (a standalone `enforcer` runs only at Tier 2 — see the enforcer tiers below). Spawn the conditional specialists only on their triggers:

- **Spawn `explorer`** (read-only recon, returns flagged findings only — not a full plan) when the task touches ANY of: an unfamiliar subsystem, multiple files / wide blast radius, a schema change, anything touching RLS or `permissions.md`, or when something already looks weird. If none of these, skip it — exploration adds latency and token cost (subagents run ~7× the tokens of single-thread).
- **Spawn `reconciler`** (read-only) ONLY when the input is a Claude Design (cdesign) handoff. This is its sole trigger. See "cdesign handoffs" below.
- **Spawn `rls-reviewer`** (read-only + rollback-wrapped DB probes) — MANDATORY, twice, for any task that creates/alters tables, RLS or storage policies, SECURITY DEFINER functions, or service-role write paths: once BEFORE the migration is applied (design review of the SQL) and once AFTER (live verification probes — impersonated own-tenant allow + cross-tenant deny). ALSO mandatory (single pass, its Mode 3) for app-layer auth surfaces: `proxy.ts`, `/auth/*` callback routes, session/cookie handling, signup/invite/OAuth flows — this repo shipped an OAuth account-mint hole through an unreviewed proxy change. Its `block` findings are non-interceptable, same as the enforcer's. This repo has also shipped a platform-wide row exposure and a bucket-wide upload outage through unreviewed policies — the gate exists because auth failures are silent.
- The `designer` agent is RETIRED. Simple design specs don't need a separate read-only agent — the engineer (or you, solo lane) builds compliantly by construction from the contract card; visual exploration goes to cdesign.

## Artifact protocol — pass paths, not prose

Inter-agent data routes through you as FILES, not re-typed summaries. On entering the orchestrated lane, create `.claude/task-context/<task-slug>/` (gitignored, disposable — delete it at task close). Every dispatch prompt names that dir. Agents write their FULL output there as a named file (`findings.md`, `spec.md`, `build-report.md`, `test-report.md`, `review.md`) and return only a ≤10-line summary plus the path. Downstream dispatches reference the files ("read `.claude/task-context/<slug>/findings.md` before starting") instead of you re-typing content — three copies of the same facts, each degraded, is the failure mode this kills.

**Kickbacks continue, never respawn.** The default for any kickback or follow-up is `SendMessage` to the SAME agent — it keeps its context, so a one-line fix costs one line, not a full re-ingest. Spawn a fresh agent only when the prior one's context is stale (the task materially changed) or it has been stopped.

### Context pack — compile the doctrine ONCE, not per agent

The same protocol applies to agent INPUTS, which are far larger than their outputs. Before the first dispatch, write `.claude/task-context/<slug>/context.md` — the task-relevant extract of the doc corpus, compiled by you (you've already read the docs to expand the prompt):

- The specific CLAUDE.md conventions this task can violate (by number, with the rule text) — not all 21.
- The design contract: for UI work, the relevant parts of `contract-card.md` (or `mobile_design_system.md` for phone-width) plus ONLY the full-doc §sections the routing table names for the surfaces touched.
- The schema/permissions rows in play (table columns, RLS helpers, `permissions.md` lines) — verified, not from memory.
- Task intent as expanded in Step 0, plus any interpretation calls already made.

Every dispatch then says "read `context.md` first" INSTEAD of telling agents to consult CLAUDE.md / the design docs wholesale. Agents open the full corpus only when the pack routes them to a named section. This converts a ~40k-token per-agent doctrine ingest into a one-time ~3k-token pack — it is the single largest token lever in the loop. Keep the pack under ~200 lines; a pack that reproduces the corpus has failed at its one job.

### Enforcer dispatch — three tiers (one agent, throttled compute)

Never maintain parallel enforcer variants; tier the DISPATCH instead:

- **Tier 0 — skip (no rule check).** Docs-only diffs, single-line mechanical fixes, and changes fully covered by the toolchain (lint / check-hex / tsc via verify.sh). The main session applies its own judgment and moves on. If a "trivial" diff touches auth, permissions, money, RLS-adjacent code, or a shared component's API — it is NOT trivial; promote it.
- **Tier 1 — folded into the tester (default).** NO standalone enforcer run. The tester's dispatch prompt NAMES the specific judgment checks for this diff (the relevant convention numbers, the governing design doc per surface, the files at risk) alongside its verify/click-through duties — one agent run instead of two, since both were loading the same docs to check the same rules. The tester reports those findings in the enforcer's block/warn/note tiers; blocks remain non-interceptable.
- **Tier 2 — standalone enforcer, full sweep.** Multi-file / multi-commit stacks, anything touching auth/permissions semantics, cdesign adoptions, or work spanning both viewports: a dedicated enforcer run with the full checklist, both design docs surface-routed, desktop byte-identity diffing, high effort. Permission-semantics checks are ALWAYS Tier 2 — they never ride the tester fold. **Dispatch Tier-2 enforcers with a model override** (`model: "opus"` on the Agent call, or omit to inherit the session model): its blocks interrupt Brian and its hardest checks are permission semantics — the default Sonnet pin is sized for Tier-1-style targeted checks, not the full-sweep judgment load.

Tier choice is the coordinator's call, but misclassification bias goes UP, never down — when unsure between tiers, pick the higher one. Blocks found at any tier remain non-interceptable.

## Step 3 — Run the build loop

Claude Code does not loop on its own. YOU drive the cycle:

1. Dispatch `engineer` with the expanded intent + the task-context dir (+ any reconciler manifest path).
2. Dispatch `tester`. Default tier: `scripts/verify.sh` (build + lint + dev-server-ready) THEN a mandatory functional click-through of the changed flow(s) via the e2e harness (`e2e/`) — run the covering spec, or have the tester write one that exercises the change as a user would. A user-facing change without a click-through comes back UNVERIFIED, not passing. Visual-taste sign-off remains Brian's.
3. Rule-check the produced work per the enforcer tiers above: Tier 1 rides the tester dispatch (name the checks in its prompt); a standalone `enforcer` is dispatched only at Tier 2.
4. On any failure that is self-healing — a build/type/lint break, a drift the engineer can simply correct — kick it back via SendMessage and continue. Do NOT surface these to Brian. This is the "duh, that's the point" category; the loop fixes it silently.
5. Repeat until: behaviorally verified (click-through passed), spec-conformant, no unresolved `block`. That is the EXIT CONDITION — "ready for visual sign-off", never "complete".

**Screenshots are cost-gated to the FINAL pass.** Intermediate rebuild cycles get cheap functional checks only — no screenshots. Only on the final green pass, and only when the change is visual, does the Tester capture the before/after screenshots for the handoff (see Step 6). Image tokens are expensive; never screenshot every cycle.

**Pixel-diff is trigger-gated:** only on the FINAL pass, only when a cdesign source file exists on disk, breadth = one screenshot pair per changed screen (single pair for single-surface work). No design source = no pixel-diff. It produces a divergence list for Brian's handoff, never a self-certified "matches."

Hard stop: if the loop cannot converge after 3 rebuild cycles, stop and surface to Brian rather than burning tokens.

## Parallel workstreams (multi-lane)

One session may run several orchestrations concurrently, one per slot worktree: claim extra slots via `./scripts/session.sh --slot sN --no-launch` (rebind the lock's session_pid to the live claude PID). One workstream = one slot = one branch = one task-context dir. Verification gates run per-slot (`verify.sh --port <slot port>`); e2e lanes are tenant-isolated (port 3002 auto-targets the LANE2 sandbox via e2e/load-env.ts — seed more with `LANE=N scripts/seed-e2e.mjs`). Still serialized globally: DB migrations (one at a time, rls-reviewer gated) and merges to main (rebase-and-land queue; keep branches fresh). Practical ceiling: two lanes — one heavy build + one light sweep/recon; beyond that conductor judgment thins.

## /designchange handling

When the task carried `/designchange`, Brian has DECLARED this prompt is meant to alter the design system. That changes the rules for THIS task only:

1. The intended change is authorized — make it at the TOKEN/COMPONENT source, never inline.
2. **Propagate.** Find every usage of the changed token/component and confirm it inherits the change. Any usage that did NOT inherit was a hardcoded inline value — surface that list to Brian. (Every /designchange doubles as a free inline-drift audit. This is a feature — report it.)
3. The rule check no longer flags "this differs from the old value" — the new value is the rule. It STILL flags incoherence: if the change fights the north star, breaks a "do not", or collides with an unrelated component, that is a `block`. The flag authorizes A change, not ANY change.
4. Auto-update web_design_system.md (or mobile_design_system.md for phone-width surfaces) to match (the flag pre-authorized the doc edit) — and update `contract-card.md` if the changed token/rule appears there (the card must never drift from the doc).
5. The flag pre-authorizes ONLY the doc gate. It does NOT skip visual sign-off — Brian still reviews on localhost. Never collapse both gates into one.

## cdesign handoffs (reconciler)

cdesign output is almost never web_design_system.md-compliant (or mobile_design_system.md-compliant for phone-width surfaces), and the reconciler cannot know which discrepancies are intentional new patterns vs. sloppy drift — that intent lives in Brian's head. So the reconciler does NOT silently snap everything, and does NOT reject. It produces a **reconciliation manifest** classifying every discrepancy:

- **SNAP** — high-confidence drift it will auto-fix (font → Bricolage, raw hex → token, raw border → InsetHairline component).
- **KEEP** — reads as the intentional new pattern (per Brian's /designchange note, e.g. "the carousel is intentional").
- **UNSURE** — genuine coin-flips it cannot classify.

Surface the manifest to Brian as a skim-and-correct list (AskUserQuestion per UNSURE item; SNAP/KEEP shown for correction). He ratifies the boundary; the reconciler re-runs with his corrections (SendMessage — it keeps its context) and produces the compliant spec, which you then feed into the build loop. Bias the reconciler toward SNAP and keep UNSURE small — a manifest that dumps everything into UNSURE is useless. Note any KEEP items as candidate future tokens (don't act on it — just flag for deliberate system growth).

## Step 6 — Handoff to Brian

When the exit condition is met, lead with ONE human sentence (what got done, in plain English), then present the structured handoff:

1. **localhost** to review with his own eyes — visual sign-off is HIS. Never self-certify visual/layout correctness; browser-MCP measurements have repeatedly reported "fixed" on visually wrong results.
2. **The committed diff** — "committed locally on <branch>, awaiting your push approval." He reviews via `git show` / `/diff`.
3. **Before/after screenshots** (visual changes only) — from the harness run's artifacts (`test-results/`), at desktop (1440) and mobile (390) viewports, plus the Tester's delta list and any unrequested-change flags. These are FOR BRIAN'S EYES to speed his review — never a self-certification that it "looks right."
4. **Interpretation calls** — a short list of anything you had to interpret.
5. **Proposed doc edits** — exact text for any CLAUDE.md / permissions.md / MINISTRY_CONTEXT.md change (per the core's doc-gate table), and a note of any lessons.md entries auto-written.

Close with the push decision (core, "The push decision").
