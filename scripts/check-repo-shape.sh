#!/usr/bin/env bash
#
# check-repo-shape.sh — conventions about which FILES exist, which no lint rule can see.
#
#   #11  Middleware is proxy.ts. A recreated middleware.ts would run beside it
#        (or instead of it) and silently fork the routing gate.
#   #24  Lessons are inbox files named tasks/lessons/inbox/<YYYY-MM-DD>-<kebab-slug>.md (an underscore may survive from a quoted column name),
#        one per file. A misnamed file escapes /lessons-gc's date ordering, and
#        anything that isn't .md isn't a lesson at all.
#
# Tracked files only, like check-conflict-copies.sh. No `mapfile` (macOS bash 3.2).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

fail=0

mw="$(git ls-files | grep -E '^(src/)?middleware\.(ts|js|mjs|tsx)$' || true)"
if [ -n "$mw" ]; then
  echo "✗ repo-shape: #11 middleware is proxy.ts — remove:"
  printf '    %s\n' $mw
  fail=1
fi

bad="$(git ls-files tasks/lessons/inbox | sed 's#^tasks/lessons/inbox/##' \
  | grep -vE '^README\.md$' \
  | grep -vE '^[0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9_]+(-[a-z0-9_]+)*\.md$' || true)"
if [ -n "$bad" ]; then
  echo "✗ repo-shape: #24 lesson files must be tasks/lessons/inbox/<YYYY-MM-DD>-<kebab-slug>.md:"
  printf '%s\n' "$bad" | sed 's/^/    /'
  fail=1
fi

[ "$fail" -eq 0 ] && echo "✓ repo-shape: no middleware.ts; every lesson inbox file is <date>-<slug>.md"
exit "$fail"
