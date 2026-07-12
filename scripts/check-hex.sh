#!/usr/bin/env bash
#
# check-hex.sh — raw-hex ratchet.
#
# Counts hardcoded hex color literals (#RGB / #RRGGBB) in app/ + components/
# TS/TSX and compares the total against a committed baseline. The count may
# only go DOWN: any increase fails (new inline hex = tech debt; use tokens from
# app/globals.css). This is a RATCHET, not a perfect linter — the grep is
# intentionally sane-not-exhaustive.
#
# Sanctioned forms are excluded (per tasks/lessons.md §hex sweep):
#   • Tailwind opacity-modified arbitrary hex, e.g.  bg-[#3E1540]/95
#   • <meta theme-color> / themeColor literals
#   • 8-digit (#RRGGBBAA) and 4-digit (#RGBA) alpha hex, and rgba() (no '#')
#
# Usage: bash scripts/check-hex.sh
#   exit 0  count <= baseline   (prints "can tighten" hint when strictly under)
#   exit 1  count  > baseline   (new hardcoded hex introduced)

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "check-hex: not a git repo" >&2; exit 2; }
cd "$ROOT" || exit 2

BASELINE_FILE="scripts/hex-baseline.txt"

count=$(grep -rEn --include='*.ts' --include='*.tsx' '#[0-9a-fA-F]{3,8}' app components 2>/dev/null \
  | grep -viE 'theme[-_]?color' \
  | perl -ne '
      my $n = 0;
      while (/#[0-9a-fA-F]{3,8}/g) {
        my $h = $&;
        my $pos = pos();
        my $len = length($h) - 1;          # hex digits, minus the "#"
        next if $len == 8 || $len == 4;    # alpha hex (#RRGGBBAA / #RGBA)
        my $after = substr($_, $pos, 2);
        next if $after =~ m{^\]/};          # Tailwind opacity-modified: [#hex]/NN
        $n++;
      }
      print "$n\n" if $n;
    ' \
  | awk '{s+=$1} END{print s+0}')

if [[ ! -f "$BASELINE_FILE" ]]; then
  echo "check-hex: missing $BASELINE_FILE (current count: $count)" >&2
  exit 2
fi
baseline="$(tr -dc '0-9' < "$BASELINE_FILE")"

if [[ "$count" -gt "$baseline" ]]; then
  echo "✗ hex ratchet: $count raw hex literals > baseline $baseline"
  echo "  new hardcoded hex introduced — use tokens from app/globals.css"
  exit 1
elif [[ "$count" -lt "$baseline" ]]; then
  echo "✓ hex ratchet: $count < baseline $baseline"
  echo "  ratchet can tighten: update scripts/hex-baseline.txt to $count"
  exit 0
else
  echo "✓ hex ratchet: $count == baseline $baseline"
  exit 0
fi
