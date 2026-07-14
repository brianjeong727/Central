#!/bin/bash
# protect-docs.sh — blocks direct edits to source-of-truth docs.
# Exit 2 blocks the tool call and feeds the message back to Claude.
# NOTE: CLAUDE.md is deliberately NOT in this list (removed 2026-07-14) — it is
# governed by the ask-then-write rule instead: Claude may write it, but only after
# Brian explicitly approves the exact text in that task (see orchestration SKILL.md
# Step 5 and the Capture section of CLAUDE.md itself).
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

PROTECTED=("permissions.md" "MINISTRY_CONTEXT.md")

for doc in "${PROTECTED[@]}"; do
  if [[ "$FILE_PATH" == *"$doc" ]]; then
    echo "BLOCKED: $doc is a source-of-truth doc. Propose the change to Brian for approval — do not edit it directly. (See the per-doc escalation rules in the orchestration skill.)" >&2
    exit 2
  fi
done
exit 0
