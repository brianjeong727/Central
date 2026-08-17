// ─── The ONE derivation of a chat's chip image ───────────────────────────────
//
// Every surface that draws a chat's avatar (mobile chat list, desktop chat-list
// panel, the chat header, chat Settings, the Home recent-chats strip) resolves
// it HERE. Nothing else may read `groups.avatar_url`.
//
// ⚠️ THE DM BRANCH IS A SECURITY BOUNDARY, NOT A PREFERENCE.
//
// The `groups` UPDATE policy ("Ministry members can update their groups") splits
// on `type = 'church'` vs `type <> 'church'`, and a DM falls in the SECOND
// branch — so EITHER participant of a DM can write `groups.avatar_url` straight
// through the API, even though no UI anywhere offers it and `chatCapabilities()`
// returns `canManage: false` for a DM. RLS is strictly wider than the app gate
// here (RLS review 2026-08-16, finding W1).
//
// That written value is inert ONLY because this function never reads it for a
// DM. The moment any surface falls back to `groups.avatar_url` when the
// partner's `profiles.avatar_url` is null, your DM partner gets to choose the
// picture YOU see for the conversation, with no UI anywhere to inspect or undo
// it. So the DM case returns the partner unconditionally as the FIRST statement
// and never falls through — no `??` onto the group column, at any call site.
//
// If a DM partner has no profile photo, the correct result is `null` (the chip
// falls back to initials). That is not a gap to fill.

export interface ChatChipSource {
  /** groups.type — "church" | "my" | "dm" */
  type: string
  /** groups.avatar_url — the GROUP's own uploaded photo. Ignored for a DM.
   *  Named for the RPC column on purpose: `group_avatar_url` is the ONE token
   *  scripts/check-chat-avatar.sh greps for, and ChatGroup/ChatPreviewRow spell
   *  it the same way, so a surface that reaches past this resolver has to type
   *  the guarded word. When this was a plain `avatar_url`, the dangerous read
   *  named neither guarded token and the gate could not fail (review W1). */
  group_avatar_url?: string | null
  /** The other participant's profiles.avatar_url. Only meaningful for a DM. */
  partner_avatar_url?: string | null
}

/** The image URL a chat's chip should render, or null to fall back to initials. */
export function chatChipAvatar(chat: ChatChipSource): string | null {
  // A DM is the OTHER PERSON — never a group photo. See the W1 note above:
  // this early return is what keeps a writable-but-unread column inert.
  if (chat.type === "dm") return chat.partner_avatar_url ?? null
  return chat.group_avatar_url ?? null
}

/** The SAME decision for a caller that holds the two urls as loose values rather
 *  than a ChatGroup-shaped row (chat Settings' hero, the chat header — both read
 *  the group from `groups`/`group-meta`, not from get_chat_list).
 *
 *  It exists so those callers do not have to spell `group_avatar_url` to build a
 *  ChatChipSource literal: that word is the build gate's trigger, and a CORRECT
 *  call through the resolver must not trip it. Params are named, not positional,
 *  because two adjacent `string | null`s are silently swappable — and swapping
 *  these two is exactly the DM leak the gate exists to prevent. */
export function chatChipAvatarFromParts(parts: {
  type: string
  /** The chat's own uploaded photo. Ignored for a DM. */
  groupPhotoUrl?: string | null
  /** The other participant's profile photo. Only meaningful for a DM. */
  partnerPhotoUrl?: string | null
}): string | null {
  return chatChipAvatar({
    type: parts.type,
    group_avatar_url: parts.groupPhotoUrl,
    partner_avatar_url: parts.partnerPhotoUrl,
  })
}

/** The ChatGroup patch that sets (or clears) a chat's OWN uploaded photo in the
 *  shared chat-list SWR cache after an upload/removal commits.
 *
 *  It lives HERE for the same reason chatChipAvatarFromParts does: the field is
 *  spelled `group_avatar_url` precisely so a rogue READ trips
 *  scripts/check-chat-avatar.sh, and chat Settings — which legitimately WRITES
 *  the cached value — must not have to type the guarded word (that would either
 *  fail the gate or force the app's largest chat file onto its allow-list, which
 *  is where three of the seven chip surfaces live). Writing the cache is not the
 *  dangerous act; reading past the resolver is. */
export function chatGroupPhotoPatch(url: string | null): { group_avatar_url: string | null } {
  return { group_avatar_url: url }
}

// ─── Storage path for an uploaded chat photo ─────────────────────────────────
// `chat-avatars/<ministryId>/<file>` in the `announcement-images` bucket, which
// is where the `chat_avatars_photo_insert` policy points:
//
//   (storage.foldername(name))[1] = 'chat-avatars'
//   (storage.foldername(name))[2] = auth_ministry_id()::text
//
// `foldername` excludes the filename, so the ministry id MUST be the second
// segment — `chat-avatars/<groupId>/<ministryId>/…` is denied.
//
// The filename is UNIQUE per upload and the caller uses `upsert: false`.
// `announcement-images` has NO storage UPDATE policy and NO DELETE policy, so a
// stable-name + `upsert: true` write (the `profile-images` pattern) would
// succeed on the FIRST photo and be RLS-denied on every replacement — a silent
// write trap (RLS review 2026-08-16, finding B2). Unique names match the two
// live writers of this bucket (announcements, receipts); the cost is that the
// superseded object is orphaned, which is already true for both of those.
export function chatAvatarStoragePath(ministryId: string, groupId: string, ext: string): string {
  return `chat-avatars/${ministryId}/${groupId}-${Date.now()}.${ext}`
}
