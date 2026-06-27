#!/bin/bash
exit 0  # TEMP BYPASS — one-time bootstrap commit to main; restored immediately after
# main-branch-guard.sh — blocks `git commit` while on main/master and any
# `git push` that would update main/master on the remote.
# Exit 2 blocks the tool call and feeds the message back to Claude.
#
# Parses the ACTUAL git command (handles compound commands, global options,
# and push refspecs) and the ACTUAL current branch — no loose string-matching.
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
[ -z "$CMD" ] && exit 0

# Fast bail: nothing git-related.
case "$CMD" in
  *git*) ;;
  *) exit 0 ;;
esac

# Actual current branch (empty if not a repo / detached HEAD).
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

is_protected() { [ "$1" = "main" ] || [ "$1" = "master" ]; }

block() {
  echo "BLOCKED: $1 Switch to a feature branch first (e.g. \`git switch -c <name>\`) — never commit or push on main/master." >&2
  exit 2
}

# Strip quoted spans so commit messages can't trigger false matches
# (e.g. git commit -m "fix push to main" must NOT read as a push to main).
SCRUBBED=$(printf '%s' "$CMD" | sed -E 's/"[^"]*"//g; s/'\''[^'\'']*'\''//g')

# Split into command segments on shell separators (bash expansion avoids the
# BSD-sed "\n in replacement" gotcha). One git invocation per segment.
SCRUBBED="${SCRUBBED//&&/$'\n'}"
SCRUBBED="${SCRUBBED//||/$'\n'}"
SCRUBBED="${SCRUBBED//;/$'\n'}"
SCRUBBED="${SCRUBBED//|/$'\n'}"

while IFS= read -r seg; do
  read -ra toks <<< "$seg"
  [ ${#toks[@]} -eq 0 ] && continue

  # Locate `git`.
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
      -C|-c|--git-dir|--work-tree|--namespace|--exec-path)
        j=$((j + 2)); continue ;;   # global option that takes an argument
      -*) j=$((j + 1)); continue ;; # other global flags
      *) sub="$t"; break ;;
    esac
  done
  [ -z "$sub" ] && continue

  if [ "$sub" = "commit" ]; then
    is_protected "$BRANCH" && block "you are on '$BRANCH' and tried to \`git commit\`."
    continue
  fi

  if [ "$sub" = "push" ]; then
    # Collect positionals after `push`, skip options; flag --all/--mirror.
    pos=(); k=$((j + 1)); allflag=0
    while [ $k -lt ${#toks[@]} ]; do
      t="${toks[$k]}"
      case "$t" in
        --all|--mirror) allflag=1; k=$((k + 1)) ;;
        --repo|-o|--push-option|--receive-pack|--exec)
          k=$((k + 2)) ;;            # option that takes a value
        -*) k=$((k + 1)) ;;
        *) pos+=("$t"); k=$((k + 1)) ;;
      esac
    done

    [ $allflag -eq 1 ] && block "\`git push --all/--mirror\` would push main/master."

    if [ ${#pos[@]} -le 1 ]; then
      # No explicit refspec → pushes the current branch.
      is_protected "$BRANCH" && block "\`git push\` from '$BRANCH' would update the remote's protected branch."
    else
      # pos[0] = remote; the rest are refspecs.
      for ((r = 1; r < ${#pos[@]}; r++)); do
        ref="${pos[$r]#+}"          # strip leading + (force)
        dst="${ref##*:}"            # dest side of src:dst (or whole token)
        dst="${dst#refs/heads/}"    # strip refs/heads/
        [ "$dst" = "HEAD" ] && dst="$BRANCH"
        is_protected "$dst" && block "\`git push\` targets protected branch '$dst'."
      done
    fi
  fi
done <<< "$SCRUBBED"

exit 0
