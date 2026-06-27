#!/bin/bash
# protect-docs.sh — blocks direct edits to source-of-truth docs.
# Exit 2 blocks the tool call and feeds the message back to Claude.
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

PROTECTED=("CLAUDE.md" "permissions.md" "MINISTRY_CONTEXT.md")

for doc in "${PROTECTED[@]}"; do
  if [[ "$FILE_PATH" == *"$doc" ]]; then
    echo "BLOCKED: $doc is a source-of-truth doc. Propose the change to Brian for approval — do not edit it directly. (See the per-doc escalation rules in the orchestration skill.)" >&2
    exit 2
  fi
done
exit 0
