#!/bin/bash
# loop-done.sh — fires when Claude Code stops (loop finished / ready for you).
# macOS notification + sound. Swap the osascript line for your OS (see below).
osascript -e 'display notification "Build loop finished — ready for your review." with title "Claude Code" sound name "Glass"' 2>/dev/null
exit 0
