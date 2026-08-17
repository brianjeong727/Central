---
description: Product-level "what do we do next" call. Reads the REAL state of Central — shipped surfaces, shelved bets, live adoption numbers, work already in flight — and returns one decisive recommendation shaped as two mutually-exclusive directions plus one thing that needs review. Read-only, builds nothing, ends in a pick. Strategic lane: does NOT load the orchestration skill.
---

Brian is asking, at the PRODUCT level, what Central's next step should be. This is a **direction call, not a build task** — do not load `.claude/skills/orchestration/SKILL.md`, do not enter the build loop, do not edit code, do not run migrations. Read, diagnose, recommend, stop.

Your job is to be **decisive**. Brian does not want a survey of options — he wants a strong diagnosis privately, and a short pickable answer publicly. The diagnosis is the work; the brevity is the deliverable.

## Phase 1 — Evidence (read-only, cite everything)

Every claim in your output must trace to something you actually read this run. No claim from memory, no claim from vibes. Gather:

1. **What's actually shipped.** `CLAUDE.md` Layer 1 (Key Files, tab structure, feature-area index) — the honest inventory of surfaces that exist. Note what is present but THIN (a tab that's a placeholder, e.g. `network-tab.tsx`) versus load-bearing.
2. **What's been deliberately shelved or frozen.** `app/home/workspace-presets.ts` (`comingSoon` flags — the worship family is frozen), any "SHELVED"/"retired"/"backlogged"/"placeholder" markers in `CLAUDE.md` and `PRD.md`. A shelved bet is a decision already made — treat resuming one as a real direction only if the evidence says the freeze is now the bottleneck.
3. **The stated vision vs. the built product.** `PRD.md` is vision/roadmap only. Diff it against #1: which promised pillar has no surface, and which built surface has no user?
4. **Live adoption — the strongest signal available, and the one most likely to lie.** Query via Supabase MCP. **Central's own tenant is a sandbox** (`is_sandbox=true`), and some tenants are `hidden_from_discovery` test rows — an adoption number that includes them is worthless. Always split real from test:
   - `ministries` by `status`, with `is_sandbox` / `hidden_from_discovery` broken out.
   - Per real ministry: member count (`profiles`), and recency of actual use — latest `messages.created_at`, `announcements.created_at`, `rsvps`.
   - The question you are answering: **does Central have users, retained users, or neither?** Pre-first-real-tenant, pre-retention, and post-retention are three different products with three different next steps. Get this right before anything else — it decides which directions are even admissible.
5. **What is already in flight.** `git log --oneline -25`, `./scripts/session-status.sh` (other slots' branches), `tasks/todo.md`, and `tasks/lessons/inbox/` (recent surprises are a map of where the product is fragile). **Never propose a direction another session is already building** — check this before writing the answer, and if a direction overlaps in-flight work, say so and pick differently.
6. **Launch-blocking reality.** Distribution state: iOS shell (`capacitor.config.ts`, App Store notes), Android (`tasks/android-play-store-plan.md`), and any memory-flagged prelaunch blockers. A product that cannot be installed cannot be adopted; if a hard blocker exists, it outranks every feature idea.

## Phase 2 — Diagnose (private; think hard here)

Form a single thesis: **what is the ONE thing standing between Central and its next real milestone?** Name the bottleneck, not a wish list. Test your thesis against these traps before committing:

- **Building past the bottleneck.** More features when the blocker is distribution, onboarding, or zero real tenants is motion, not progress.
- **Confusing "incomplete" with "next."** Every codebase has gaps. A gap only becomes the next step if it blocks the milestone.
- **The demo-vs-retention gap.** Impressive-in-a-demo and returned-to-on-Tuesday are different products. Say which one the evidence says is missing.
- **Sandbox illusion.** Rich seeded fixtures in Brian's Sandbox are not usage.
- **Debt that is actually fine.** Frozen code that nobody touches costs nothing. Don't dress cleanup up as strategy.

## Phase 3 — Answer (this is what Brian reads — keep it under ~300 words total)

Exactly this shape, in this order. Prose, no tables. Hard ceilings — if it doesn't fit, your thesis isn't sharp enough yet.

**Diagnosis** — ≤4 bullets, ≤20 words each. Each bullet carries its evidence inline (a file, a table, a count, a commit). One of them must state the bottleneck outright.

**Direction A / Direction B** — the two best bets. Each gets exactly four lines:
- *Name* — a plain-English outcome, not a task title.
- *Why now* — one sentence.
- *First move* — one sentence, concrete enough to start today.
- *The bet* — what you're wagering and what you give up by not doing the other.

Rules on the two directions: they must be **genuinely mutually exclusive bets on where effort goes**, not two steps of one sequence (if B is "then do A," B is not a direction — find a real alternative). Different in KIND, not just in size. **Never offer three.** Kill the weaker third in your head and don't mention it.

**Needs review** — ONE item, 2–3 sentences: something that could invalidate work or bite at launch (a permission/RLS assumption, a scaling cliff, a shipped-but-unverified surface, a cost/quota edge). It is a risk to look at, **not** a third direction. Include the rough cost to check it.

**Recommendation** — one sentence: A or B, and why in a half-clause. Take the position; hedging here is a failure of the command.

Then call `AskUserQuestion` so Brian picks in one tap: Direction A / Direction B / Review first. Nothing after that call — do not start building the winner in the same turn. When he picks, THAT becomes a normal build task and goes through the orchestration skill from the top.

If the evidence genuinely cannot support a call (e.g. the DB is unreachable), say so in one line and name what you'd need — do not invent a recommendation to fill the shape.

Optional focus from Brian (a surface, an audience, a timeframe) — honor it as a constraint on the directions, not as permission to skip the diagnosis:

$ARGUMENTS
