#!/bin/bash
# destructive-git-guard.sh — blocks the git commands that can silently destroy
# uncommitted work in a session worktree: `git stash` (except list/show),
# `git reset --hard`, and `git clean` with force. A verifier's stash has
# clobbered an engineer's uncommitted rebuild before (lessons.md §Tester stash
# clobber) — that protection was prompt-level in three agent files; this makes
# it deterministic for every agent and the main session alike.
#
# Worktree sessions never legitimately need these: work lands by commit, slots
# reset via session.sh, and syncs go through /catchup.
#
# EXCEPTION: a single-use sentinel at .claude/.destructive-git-authorized
# permits exactly ONE blocked command, then is consumed. Create it only on
# Brian's explicit say-so.
#
# Exit 2 blocks the tool call and feeds the message back to Claude.
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

case "$CMD" in
  *git*) ;;
  *) exit 0 ;;
esac

SENTINEL="${CLAUDE_PROJECT_DIR:-.}/.claude/.destructive-git-authorized"

block() {
  if [ -f "$SENTINEL" ]; then
    rm -f "$SENTINEL"
    echo "destructive-git-guard: sentinel honored (single-use, now consumed)." >&2
    exit 0
  fi
  echo "BLOCKED: $1 This can silently destroy uncommitted work in a session worktree (see lessons.md §Tester stash clobber). Commit the work instead; if this destructive command is genuinely needed, ask Brian — his explicit approval authorizes creating the single-use sentinel .claude/.destructive-git-authorized." >&2
  exit 2
}

# Strip quoted spans so commit messages can't false-match. perl -0 slurps the
# whole command so MULTI-LINE quoted strings (multi-paragraph -m messages) are
# stripped too — line-based sed left their bodies unquoted and they false-matched.
SCRUBBED=$(printf '%s' "$CMD" | perl -0pe 's/"[^"]*"//gs; s/\x27[^\x27]*\x27//gs')
SCRUBBED="${SCRUBBED//&&/$'\n'}"
SCRUBBED="${SCRUBBED//||/$'\n'}"
SCRUBBED="${SCRUBBED//;/$'\n'}"
SCRUBBED="${SCRUBBED//|/$'\n'}"

while IFS= read -r seg; do
  read -ra toks <<< "$seg"
  [ ${#toks[@]} -eq 0 ] && continue

  gi=-1
  for i in "${!toks[@]}"; do
    if [ "${toks[$i]}" = "git" ]; then gi=$i; break; fi
  done
  [ "$gi" -lt 0 ] && continue

  # Walk past global options to the subcommand.
  j=$((gi + 1)); sub=""
  while [ $j -lt ${#toks[@]} ]; do
    t="${toks[$j]}"
    case "$t" in
      -C|-c|--git-dir|--work-tree|--namespace|--exec-path) j=$((j + 2)); continue ;;
      -*) j=$((j + 1)); continue ;;
      *) sub="$t"; break ;;
    esac
  done
  [ -z "$sub" ] && continue

  rest=("${toks[@]:$((j + 1))}")

  case "$sub" in
    stash)
      # Read-only stash subcommands are fine; everything else mutates.
      first="${rest[0]:-push}"
      case "$first" in
        list|show) ;;
        *) block "\`git stash ${first}\` would set aside (and risk losing) working-tree changes." ;;
      esac
      ;;
    reset)
      for t in "${rest[@]}"; do
        [ "$t" = "--hard" ] && block "\`git reset --hard\` discards working-tree changes."
      done
      ;;
    clean)
      for t in "${rest[@]}"; do
        case "$t" in
          -*f*|--force) block "\`git clean\` with force deletes untracked files." ;;
        esac
      done
      ;;
  esac
done <<< "$SCRUBBED"

exit 0
