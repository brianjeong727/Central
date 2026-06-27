#!/bin/bash
# lint-on-write.sh — lint ONLY the file just written. Fast feedback, no full-project run.
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only lint TS/TSX/JS/JSX files; skip everything else silently.
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx) ;;
  *) exit 0 ;;
esac

# Lint just this one file. Non-blocking: report problems back to the loop
# (exit 0 always) — the Tester is the real gate; this is fast early warning.
npx eslint "$FILE_PATH" 2>&1 || echo "Lint warnings in $FILE_PATH (above) — not blocking; Tester will verify." >&2
exit 0
