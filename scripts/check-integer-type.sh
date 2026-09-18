#!/usr/bin/env bash
#
# check-integer-type.sh — type sizes are integers (design pass N22, ratified 2026-09-17).
#
# The audit found 196 half-pixel font sizes (9.5 / 10.5 / 11.5 / 12.5 / 13.5 / 14.5 /
# 15.5) across nine networks — not drift, one eye applied 196 times, forming a private
# type ramp per room beside the contract's integer scale. They were rounded once
# (half up) on 2026-09-17; this keeps the count at ZERO. A new fractional size is a
# BLOCKING verify failure, not a warning: the ramp regrows one "just this once" at a time.
#
# Matches inline `fontSize: 12.5` and Tailwind `text-[12.5px]`. Sizes as strings
# ("12.5px") are caught by the same pattern. Comments are not excluded on purpose —
# a size quoted in a comment is cheap to reword.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

hits="$(grep -rnE 'fontSize: *"?[0-9]+\.[0-9]+|text-\[[0-9]+\.[0-9]+px\]' --include='*.tsx' --include='*.ts' app components 2>/dev/null || true)"
if [ -n "$hits" ]; then
  echo "✗ integer-type: fractional font sizes are retired (N22) — round to the nearest integer:"
  echo "$hits" | sed 's/^/    /'
  exit 1
fi
echo "✓ integer-type: no fractional font sizes in app/ + components/"
exit 0
