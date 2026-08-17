#!/usr/bin/env bash
#
# ship-can-skip-build.sh — "has THIS exact tree already passed a full build?"
#
# Exit 0 = yes, /ship may skip both the build AND the dev-server restart.
# Exit 1 = no, run the full build guard.
#
# Why this exists: a `next build` is ~35s, and /ship ran one on every ship even
# when scripts/verify.sh had built the identical tree moments earlier. Because
# `npm run dev` opens with `rm -rf .next`, that build's output was then deleted
# immediately and the slot paid another ~14s cold-starting dev. ~50s of a ~60s
# ship, none of it buying anything. Measured on s3, 2026-08-17.
#
# The safety property: the stamp is written ONLY by a verify.sh run whose build
# actually passed, and it fingerprints HEAD plus the entire working diff. Any
# source change — committed, uncommitted, or a brand-new untracked file — moves
# the fingerprint and this exits 1. There is no way to skip a build for a tree
# that has not had one, which is the only thing the build guard is protecting.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 1

# MUST match scripts/verify.sh's build_fingerprint() exactly.
build_fingerprint() {
  {
    git rev-parse HEAD 2>/dev/null
    git diff HEAD -- . ':(exclude)capacitor.config.ts' 2>/dev/null
    git ls-files --others --exclude-standard 2>/dev/null
  } | shasum | awk '{print $1}'
}

SLOT="$(basename "$PWD")"
case "$SLOT" in
  central-s1) SLOT=s1 ;;
  central-s2) SLOT=s2 ;;
  central-s3) SLOT=s3 ;;
  *)          SLOT=main ;;
esac

STAMP="$(git rev-parse --git-common-dir)/session-locks/${SLOT}.built"
[ -f "$STAMP" ] || { echo "no green-build stamp for ${SLOT} — build required"; exit 1; }

WANT="$(build_fingerprint)"
HAVE="$(cat "$STAMP" 2>/dev/null)"

if [ -n "$WANT" ] && [ "$WANT" = "$HAVE" ]; then
  echo "tree unchanged since the last green verify.sh build — skipping build + dev restart"
  exit 0
fi

echo "tree has changed since the last green build — build required"
exit 1
