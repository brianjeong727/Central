#!/usr/bin/env bash
#
# check-chrome-title.sh — a mobile chrome row must not hand-write its title type.
#
# Convention #27 pinned where the chrome row SITS (POCKET_CHROME_PAD_Y) and an e2e
# asserted the title's vertical position. Nothing pinned how the title LOOKS, so
# five chromes quietly drifted — tab roots at 22, the announcements row and
# SubpageShell at 20, PocketHubChrome dropping 22→20 whenever it carried an action,
# and the SubpageShell back-label at 15 in PLUM — while every position assertion
# kept passing. Ratified 2026-08-08: serif 22/600 --ink, back-labels included.
#
# The signal is STRUCTURAL, not typographic: importing POCKET_CHROME_PAD_Y is what
# it means to build a chrome row. Any file that does must take its title type from
# POCKET_CHROME_TITLE too. Grepping for "serif + fontSize 22" instead was tried and
# is useless — it flags body headlines, modal titles and stat values, none of which
# are chrome.
#
# e2e/mobile-screen-sweep.mobile.spec.ts is the runtime half: it measures the real
# chrome row on every discovered screen. This is the cheap half, so a new
# hand-rolled chrome row fails in verify.sh before a browser starts.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

builders="$(grep -rlE 'POCKET_CHROME_PAD_Y' --include='*.tsx' app components 2>/dev/null || true)"

bad=""
for f in $builders; do
  # The constant's own home defines both — skip it.
  [ "$f" = "components/central/pocket.tsx" ] && continue
  # A file that only NAMES the constant in prose (a comment pointing at the rule)
  # is not building a row. Strip comments SYNTACTICALLY rather than by line prefix.
  # Prefix-matching was tried twice and leaks both times: " * …" has no slash on it,
  # and a JSX `{/* … */}` continuation line carries no marker at ALL, so prose
  # wrapped onto a second line read as code and failed a BLOCKING gate on a comment
  # (profile-tab.tsx, 2026-08-16). Perl slurps the file and removes /* … */ blocks
  # (which covers `{/* … */}`) and // tails, then we grep what's actually left.
  if ! perl -0777 -ne 's{/\*.*?\*/}{}gs; s{//[^\n]*}{}g; exit(/POCKET_CHROME_PAD_Y/ ? 0 : 1)' "$f"; then
    continue
  fi
  if ! grep -q 'POCKET_CHROME_TITLE' "$f"; then
    bad="$bad$f\n"
  fi
done

if [ -n "$bad" ]; then
  echo "✗ chrome-title: file builds a chrome row (POCKET_CHROME_PAD_Y) without POCKET_CHROME_TITLE"
  printf "$bad" | sed 's/^/    /'
  echo
  echo "  The mobile chrome row's title is serif 22/600 --ink, defined once in"
  echo "  components/central/pocket.tsx. Spread POCKET_CHROME_TITLE — back-labels too."
  exit 1
fi

n="$(printf '%s\n' "$builders" | grep -c . || true)"
echo "✓ chrome-title: $n chrome builders all consume POCKET_CHROME_TITLE"
