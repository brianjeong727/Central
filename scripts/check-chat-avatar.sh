#!/usr/bin/env bash
#
# check-chat-avatar.sh — only chat-avatar.ts may resolve a chat's chip image.
#
# WHY THIS IS A BUILD GATE AND NOT A CONVENTION
#
# The `groups` UPDATE policy splits on `type = 'church'` vs everything else, and a
# DM falls in the SECOND branch — so EITHER participant of a DM can write
# `groups.avatar_url` straight through the API, even though no UI offers it and
# `chatCapabilities()` returns canManage:false for a DM. RLS is strictly WIDER
# than the app gate here (RLS review 2026-08-16, finding W1), and the review's
# follow-up (finding A2) was blunt about it: that written value is inert ONLY
# because no render path reads it for a DM.
#
# Six surfaces draw a chat chip. If any ONE of them ever reads `group_avatar_url`
# directly — or falls back to it when a DM partner has no photo — then your DM
# partner silently chooses the picture YOU see for that conversation, with no UI
# anywhere to inspect or undo it. That is a security property resting on six
# separate places continuing to behave, which is exactly the kind of thing that
# holds until someone adds a seventh surface in a hurry.
#
# So the rule is structural: the RPC column names may appear in the data layer
# that maps rows, and in chat-avatar.ts which owns the decision. Nowhere else.
# e2e/chat-avatars.mobile.spec.ts is the runtime half — it plants a group photo on
# a DM row and asserts the UI still shows the partner. This is the cheap half: a
# new direct reader fails here before a browser starts.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 2

# ONLY `group_avatar_url`. Two deliberate narrowings, both learned by this check
# false-positiving on its first run:
#   • `partner_avatar_url` is NOT dangerous to read — it IS the partner's own
#     photo, which is precisely what a DM is supposed to show. It is also the
#     ChatChipSource property name, so flagging it fails every CORRECT caller of
#     chatChipAvatar() and the check would have to be allow-listed into
#     uselessness.
#   • bare `avatar_url` is far too common (profiles, teams, ministries all have
#     one) to carry any signal.
# What is dangerous is reading the GROUP's column, because that is the one a DM
# participant can write and a DM must never render.
#
# WHY THIS TOKEN IS NOW THE RIGHT ONE TO GUARD (review finding W1, 2026-08-16).
# It was not, at first. `group_avatar_url` was only the RPC's column name, while
# the client type ChatGroup called the same field a plain `avatar_url` — so the
# realistic dangerous edit, `chatChipAvatar(group) ?? group.group_avatar_url`
# spelled as `?? group.avatar_url`, named NEITHER guarded token and sailed
# through. The gate could fail only for a hand-written new RPC mapper, which is
# the one case that is not the risk. The fix was structural rather than a wider
# grep: ChatGroup's field was RENAMED to `group_avatar_url`, so the dangerous
# read has to type the guarded word. Two consequences worth keeping:
#   • Correct callers must NOT have to type it — that is what
#     chatChipAvatarFromParts() and chatGroupPhotoPatch() exist for.
#   • The allow-list must stay SMALL. Adding chats-tab.tsx (three of the seven
#     chip surfaces) to it would give the gate back the hole it just lost.
readers="$(grep -rlE 'group_avatar_url' \
  --include='*.ts' --include='*.tsx' app components lib 2>/dev/null || true)"

# Files allowed to name it:
#   chat-avatar.ts  — owns the derivation itself
#   chat-list.ts    — maps get_chat_list rows into ChatGroup
#   utils.ts        — maps get_chat_previews rows into ChatPreview
#   types.ts        — declares the fields
allowed="app/home/chat-avatar.ts app/home/chat-list.ts app/home/utils.ts app/home/types.ts"

bad=""
for f in $readers; do
  case " $allowed " in *" $f "*) continue ;; esac
  # A file that only mentions the columns in prose (a comment pointing at this
  # rule) is not reading them. Strip comment lines first — a block-comment
  # continuation (" * …") carries no slash and slips through a naive filter.
  grep -E 'group_avatar_url' "$f" | grep -qvE '^\s*(\*|//|/\*)' || continue
  bad="$bad$f\n"
done

if [ -n "$bad" ]; then
  echo "✗ chat-avatar: file reads the raw group_avatar_url column directly"
  printf "$bad" | sed 's/^/    /'
  echo
  echo "  Resolve a chat's chip image through chatChipAvatar() in"
  echo "  app/home/chat-avatar.ts — never group_avatar_url directly, and never as a"
  echo "  fallback when a DM partner has no photo. A DM's group photo is writable"
  echo "  by either participant through the API; it is inert only because nothing"
  echo "  reads it. See the header of chat-avatar.ts."
  exit 1
fi

n="$(printf '%s\n' "$readers" | grep -c . || true)"
echo "✓ chat-avatar: $n files name group_avatar_url, all of them sanctioned"
