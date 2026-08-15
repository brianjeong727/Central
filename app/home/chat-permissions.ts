// ─── Chat capability gates — ONE encoding ────────────────────────────────────
// Who may manage, leave, archive or delete a given chat. Lifted out of
// ChatSettings so the settings screen and the chat-list swipe actions cannot
// drift: two copies of a gate silently disagree, and here a disagreement means
// the swipe offers an action the DB then refuses (or hides one the user has).
//
// Derived from permissions.md via lib/roles.ts — never an inline role array
// (Convention #2). Church-chat management is "in-chat leader-or-above": a
// leader-tier role (incl. pastor) AND membership of THIS chat, mirroring the
// groups / group_members / messages RLS.

import { isLeaderRole } from "@/lib/roles"

export interface ChatCapabilityInput {
  /** groups.type — "church" | "my" | "dm" */
  type: string
  /** groups.archived */
  archived?: boolean
  /** groups.is_central_chat — the auto-enrolled ministry-wide room */
  isCentral?: boolean
  /** Is the acting user a member of THIS chat? In the chat LIST this is always
   *  true (get_chat_list only returns rooms you belong to); ChatSettings computes
   *  it from the loaded roster. */
  isMemberOfChat: boolean
}

export interface ChatCapabilities {
  canManage: boolean
  canLeave: boolean
  canArchive: boolean
  canUnarchive: boolean
  canDelete: boolean
}

export function chatCapabilities(
  { type, archived = false, isCentral = false, isMemberOfChat }: ChatCapabilityInput,
  role: string,
): ChatCapabilities {
  const isChurch = type === "church"
  const isMy = type === "my"
  // The ministry chat is identified by its own column, never by name — a rename
  // can then never break the delete/archive guards.
  const isCentralChat = isChurch && isCentral

  const churchManage = isChurch && isLeaderRole(role) && isMemberOfChat

  return {
    canManage: churchManage || isMy,
    // A DM is a PAIR, not a room you happen to be in — you cannot leave it, and
    // taking that option used to delete the leaver's group_members row, which
    // stopped their DM pushes and made the other side mint duplicate threads.
    canLeave: isMy,
    canArchive: churchManage && !archived && !isCentralChat,
    canUnarchive: churchManage && archived,
    canDelete: churchManage && !isCentralChat,
  }
}
