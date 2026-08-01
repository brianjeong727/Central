#!/bin/bash
# sim-overlay-guard.sh — blocks a commit that would carry /sim's local-only
# artifacts into the repo. Exit 2 blocks the tool call and feeds the message
# back to Claude.
#
# /sim leaves THREE files dirty, not one:
#   1. capacitor.config.ts   — the dev overlay (server.url → http://localhost:<port>,
#                              cleartext:true, "localhost" in allowNavigation).
#                              Committing it points the SHIPPED app at a laptop.
#   2. ios/App/CapApp-SPM/Package.swift
#   3. ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
#      — `cap sync` rewrites the tracked npm-style plugin paths
#        (../../../node_modules/@capacitor/app) into this machine's RESOLVED pnpm
#        paths (node_modules/.pnpm/@capacitor+app@8.1.0_.../...). Those resolve
#        for nobody else. The tracked npm-style paths work fine under pnpm
#        because node_modules/@capacitor/* are symlinks into .pnpm — which is
#        exactly why the committed version must stay npm-style.
#
# The /sim skill only ever warned about (1), so (2) and (3) slipped through by
# hand every run. This is content-based, not filename-based: it inspects the
# STAGED blobs, so it fires however the change got staged.
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

case "$CMD" in
  *git*) ;;
  *) exit 0 ;;
esac

# Strip quoted spans so a commit MESSAGE mentioning these paths can't self-block.
SCRUBBED=$(printf '%s' "$CMD" | perl -0pe 's/"[^"]*"//gs; s/\x27[^\x27]*\x27//gs')
case "$SCRUBBED" in
  *commit*) ;;
  *) exit 0 ;;
esac

STAGED=$(git diff --cached --name-only 2>/dev/null)
[ -z "$STAGED" ] && exit 0

offenders=""

# (1) capacitor.config.ts must never be staged carrying a localhost server URL.
if printf '%s\n' "$STAGED" | grep -qx "capacitor.config.ts"; then
  if git show :capacitor.config.ts 2>/dev/null | grep -qE 'url:[[:space:]]*"http://localhost'; then
    offenders="${offenders}  · capacitor.config.ts — still carries the /sim dev overlay (http://localhost). Prod must be https://www.joincentral.app.\n"
  fi
fi

# (2)(3) The SPM files must never be staged carrying machine-resolved pnpm paths.
for f in \
  "ios/App/CapApp-SPM/Package.swift" \
  "ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved"
do
  if printf '%s\n' "$STAGED" | grep -qx "$f"; then
    if git show ":$f" 2>/dev/null | grep -q "node_modules/.pnpm"; then
      offenders="${offenders}  · $f — \`cap sync\` rewrote it to this machine's resolved pnpm paths; they resolve for nobody else.\n"
    fi
  fi
done

if [ -n "$offenders" ]; then
  printf "BLOCKED: this commit carries /sim's local-only artifacts:\n%b\nRevert them and commit again:\n  git checkout -- capacitor.config.ts ios/App/CapApp-SPM/Package.swift ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved\n\nAfter any /sim run \`git status\` should show ONLY capacitor.config.ts modified, and that one is reverted before committing.\n" "$offenders" >&2
  exit 2
fi

exit 0
