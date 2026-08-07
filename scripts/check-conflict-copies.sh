#!/usr/bin/env bash
#
# check-conflict-copies.sh — fail on committed iCloud/Finder conflict copies.
#
# The repo lives under ~/Desktop, which is iCloud-synced. When sync races a write
# it leaves a duplicate beside the original: "dm 2.ts", "report 3.sql". They are
# byte-identical copies with no value, and two had already been committed —
# including a duplicate Playwright spec that ran as a second copy of its whole
# test file in every suite run.
#
# Untracked copies are their own nuisance (session.sh refuses to reclaim a slot
# whose worktree is dirty), but those are visible in `git status`. The ones this
# catches are the copies that made it INTO the tree, where nothing surfaces them.
#
# Matches "<name> <digit>.<ext>" — Finder/iCloud's exact pattern. A legitimate
# filename with a trailing " 2" before the extension would trip this; none exist,
# and the false positive is cheap to allowlist below if one ever does.
set -uo pipefail

cd "$(git rev-parse --show-toplevel)" || exit 1

# Tracked files only — gitignored build output (test-results/, ios/ pods) churns
# with these names and is nobody's problem.
#
# No `mapfile`: macOS ships bash 3.2, where it doesn't exist. This script has to
# run on the machine it protects.
hits="$(git ls-files | grep -E '(^|/)[^/]+ [0-9]+\.[A-Za-z0-9]+$' || true)"

if [ -z "$hits" ]; then
  echo "✓ conflict-copies: none tracked"
  exit 0
fi

count="$(printf '%s\n' "$hits" | grep -c .)"
echo "✗ conflict-copies: $count committed iCloud/Finder duplicate(s):"
printf '%s\n' "$hits" | while IFS= read -r f; do
  [ -n "$f" ] || continue
  # Show whether an original exists, so the fix is obvious.
  orig="$(printf '%s' "$f" | sed -E 's/ [0-9]+(\.[A-Za-z0-9]+)$/\1/')"
  if [ -f "$orig" ]; then
    echo "    $f   (duplicate of $orig)"
  else
    echo "    $f   (NO original — check before deleting)"
  fi
done
echo
echo "  Remove with:  git rm \"<path>\""
exit 1
