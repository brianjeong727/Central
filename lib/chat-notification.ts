// ─── Chat-notification eligibility + copy — ONE encoding ──────────────────────
// Whether a given chat message notifies YOU, and what the notification says.
//
// It exists because there are now TWO surfaces asking the same question and they
// must never disagree:
//   • app/api/push/dispatch/route.ts — the OS notification, when the app is not
//     in front of you;
//   • app/home/home-app.tsx — the in-app banner, when it is. iOS deliberately
//     suppresses its own banner while the app is open (lib/native-push.ts), so
//     without the in-app one a foregrounded user simply never hears about a
//     message in another room.
//
// Two copies of this rule would mean muting a chat silences one surface and not
// the other, or a 200-person room that stays quiet on your lock screen firing a
// banner every three seconds while you are in Workspace. Same predicate, same
// words, one file. (Ratified 2026-08-24: the in-app banner obeys exactly the
// setting the push obeys — so ONE control fixes both, and the user never has to
// learn that "notifications" means two different things.)
//
// Deliberately NOT included: the message BODY. The push lane sends a plain text
// preview and the in-app lane names attachments ("Photo", "Poll") the way the
// chat list does; both are right for their surface, and folding them together
// would change what a live push says for no gain here.

import type { NotificationSettings, ChatNotifyMode } from "@/app/home/types"

/** Where "smart" stops meaning "everything". Mirrors the read-receipt large-room
 *  threshold (Convention #18) — the same number, for the same reason: past it a
 *  room is a broadcast channel, not a conversation. */
export const SMART_ROOM_THRESHOLD = 30

export type ChatNotifyReason = "dm" | "reply" | "mention" | "group"

/** Mentions are inserted by the composer as `@FirstName` — a single token, no
 *  spaces. Lower-cased so matching is case-insensitive on both sides. */
export function mentionTokensIn(content: string | null | undefined): Set<string> {
  return new Set((content?.match(/@(\w+)/g) ?? []).map((t) => t.slice(1).toLowerCase()))
}

/** The token the composer would have inserted for this person — their first name,
 *  or the first word of their chat nickname. */
export function mentionToken(name: string | null | undefined): string {
  return (name ?? "").trim().split(" ")[0].toLowerCase()
}

/**
 * Does this message notify this person, and on what grounds? `null` = it does not.
 *
 * Order is load-bearing. `off` (and its legacy `muted` mirror) is a HARD override
 * checked first — it silences DMs, replies and mentions too, which is what mute
 * has always meant here. Then the personal reasons, each with its own global
 * toggle. Group traffic is last, so 'mentions' only ever suppresses the plain
 * firehose: a reply or an @ has already returned above it.
 */
export function chatNotifyReason({
  isDM, memberCount, chatMode, muted = false, settings, isMention, isReply,
}: {
  isDM: boolean
  /** Everyone in the room, the reader included. */
  memberCount: number
  /** `group_members.notify_mode` — NULL means inherit the global mode. */
  chatMode: ChatNotifyMode | null
  /** `group_members.muted` — trigger-derived from notify_mode; honoured as a mirror. */
  muted?: boolean
  settings: NotificationSettings
  isMention: boolean
  isReply: boolean
}): ChatNotifyReason | null {
  if (chatMode === "off" || muted) return null

  if (isDM) {
    // An explicit per-chat "all" is a deliberate opt-IN for this one thread, so it
    // beats a global dms:false the same way it beats group_mode below.
    if (chatMode !== "all" && settings.dms === false) return null
    return "dm"
  }
  if (isReply && settings.replies !== false) return "reply"
  if (isMention && settings.mentions !== false) return "mention"

  // Per-chat choice wins over the global mode.
  const mode = chatMode ?? settings.group_mode ?? "smart"
  if (mode === "off" || mode === "mentions") return null
  if (mode === "smart" && memberCount >= SMART_ROOM_THRESHOLD) return null
  return "group"
}

/**
 * The two fixed lines: WHO it is from, and WHERE it happened.
 *
 * Messenger's shape (Brian, 2026-08-22): WHO on the first line, WHERE on the
 * second, the message itself on the third. A DM has no "where" worth saying —
 * you already know a DM is from that person — so it stays two lines. This
 * replaced "Sender · Chat" as one run-on title, which read as a single name when
 * the chat name was long and pushed the message off the banner.
 */
export function chatNotifyCopy(
  reason: ChatNotifyReason,
  { senderName, groupName, isDM }: { senderName: string; groupName: string; isDM: boolean },
): { title: string; subtitle?: string } {
  return {
    title: senderName,
    subtitle: isDM
      ? undefined
      : reason === "mention" ? `mentioned you in ${groupName}`
      : reason === "reply" ? `replied in ${groupName}`
      : `to ${groupName}`,
  }
}
