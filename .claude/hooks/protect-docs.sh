#!/bin/bash
# protect-docs.sh — blocks direct edits to source-of-truth docs.
# Exit 2 blocks the tool call and feeds the message back to Claude.
# NOTE: CLAUDE.md is deliberately NOT in this list (removed 2026-07-14) — it is
# governed by the ask-then-write rule instead: Claude may write it, but only after
# Brian explicitly approves the exact text in that task (see orchestration SKILL.md
# Step 5 and the Capture section of CLAUDE.md itself).
#
# permissions.md followed on 2026-08-22, on Brian's instruction and for the same
# reason. The block never protected the CANON — it protected the keystrokes. What
# actually keeps permissions.md honest is that a human reads the exact text before it
# lands, and ask-then-write preserves that while dropping a copy-paste step; the diff
# stays reviewable and revertable either way.
#
# THE RULE THAT REPLACES IT, and it is not optional: propose the exact wording, WAIT
# for Brian to approve it in that task, then write it. A standing preference, an
# earlier task's approval, or "he asked for the feature so he must want the doc line"
# do not count. If the applied text has to differ from what was approved, re-ask.
# MINISTRY_CONTEXT.md stays blocked — it is ministry vocabulary and workflow, which
# Claude has no independent way to verify.
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

PROTECTED=("MINISTRY_CONTEXT.md")

# Match the exact repo-root file, not any path that merely ENDS in the name —
# the old suffix match false-blocked e.g. a hypothetical docs/foo-permissions.md.
ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null)}"

for doc in "${PROTECTED[@]}"; do
  if [[ "$FILE_PATH" == "$doc" || ( -n "$ROOT" && "$FILE_PATH" == "$ROOT/$doc" ) ]]; then
    echo "BLOCKED: $doc is a source-of-truth doc. Propose the change to Brian for approval — do not edit it directly. (See the per-doc escalation rules in the orchestration skill.)" >&2
    exit 2
  fi
done
exit 0
