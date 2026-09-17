# AGENTS.md

**CLAUDE.md is the single source of truth for this repository.**

This file previously held a separate, parallel project brief that drifted out of
date (wrong design direction, stale architecture, deleted files described as
live). To avoid two contradicting docs, that content has been removed. Any agent
working in this repo — Codex included — should read **`CLAUDE.md`** at the repo
root for the current, maintained guidance: stack, architecture, key files,
conventions, permissions, and workflow.

Related canonical docs (each owns its domain, all referenced from CLAUDE.md):
- `CLAUDE.md` — project rules that apply everywhere
- `components/central/CLAUDE.md`, `app/home/CLAUDE.md` — folder-scoped conventions; read the one for the folder you're editing (Claude loads these automatically; other agents must open them)
- `REFERENCE.md` — full convention text, key files, architecture, schema index
- `web_design_system.md` (`.claude/skills/design-system/`) — the desktop (≥768px) design contract
- `mobile_design_system.md` (`.claude/skills/design-system/`) — the phone-width (`md:hidden`, ≤430px) design contract
- `permissions.md` — role/access source of truth
- `MINISTRY_CONTEXT.md` — real-world ministry workflows and vocabulary
- `PRD.md` — product vision and roadmap (not implementation detail)

Do not reintroduce project guidance here; update `CLAUDE.md` instead.
