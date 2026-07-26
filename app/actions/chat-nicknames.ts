"use server"

// Shared per-chat nicknames — the ONLY write path for chat_nicknames. Runs
// server-side (service role) so moderation + membership + type gating are
// enforced regardless of client, closing the direct-insert bypass a browser-
// client write would leave (the read path is RLS-gated SELECT via the roster).
//
// Scope: personal group chats only (groups.type='my'). Any member may set/change/
// clear any member's nickname (shared Messenger model). See the chat_nicknames
// RLS (Convention #9 helpers) — this action mirrors it and adds moderation.

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryMember } from "./authz"
import { recordChatOffense } from "./moderation"
import { moderateText, scopeApplies, MODERATION_DEFAULTS, type ModerationSettings } from "@/lib/moderation"
import { MAX_NICKNAME_LEN } from "@/app/home/types"

// A "use server" file may only export async functions — keep this type internal.
type NicknameResult =
  | { error: null; nickname: string | null } // nickname === null means "cleared"
  | { error: string; blocked?: boolean }

// Verify: caller is authenticated + a member of the group, the group is a
// PERSONAL group chat in the caller's ministry, and the target is a member.
// Returns the caller ctx + the ministry_id to stamp on writes, or an error.
async function authorize(
  groupId: string,
  targetUserId: string,
): Promise<{ error: string } | { error: null; userId: string; ministryId: string }> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }

  const admin = createAdminClient()
  const { data: group } = await admin
    .from("groups")
    .select("id, type, ministry_id")
    .eq("id", groupId)
    .maybeSingle()
  if (!group || group.ministry_id !== ctx.ministryId) return { error: "Chat not found." }
  if (group.type !== "my" && group.type !== "dm") return { error: "Nicknames aren't available in this chat." }

  // Caller AND target must both be members of the group.
  const { data: memberships } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .in("user_id", [ctx.userId, targetUserId])
  const ids = new Set((memberships ?? []).map((m) => m.user_id))
  if (!ids.has(ctx.userId)) return { error: "You're not in this chat." }
  if (!ids.has(targetUserId)) return { error: "That person isn't in this chat." }

  return { error: null, userId: ctx.userId, ministryId: ctx.ministryId }
}

export async function setChatNickname(
  groupId: string,
  targetUserId: string,
  rawNickname: string,
): Promise<NicknameResult> {
  const auth = await authorize(groupId, targetUserId)
  if (auth.error !== null) return { error: auth.error }
  const { userId, ministryId } = auth

  const nickname = (rawNickname ?? "").trim()
  if (!nickname) return { error: "Nickname can't be empty." }
  if (nickname.length > MAX_NICKNAME_LEN) return { error: `Keep it under ${MAX_NICKNAME_LEN} characters.` }

  // Moderation — mirrors the chat send path (chats-tab applyModeration). A
  // nickname is a personal-chat label, so it filters under the ministry's
  // personal scope; a flagged nickname is rejected outright (never asterisked).
  const admin = createAdminClient()
  const { data: ministry } = await admin
    .from("ministries")
    .select("moderation_settings")
    .eq("id", ministryId)
    .maybeSingle()
  const settings: ModerationSettings = { ...MODERATION_DEFAULTS, ...((ministry?.moderation_settings as Partial<ModerationSettings>) ?? {}) }
  if (settings.enabled && scopeApplies(settings.scope, { isChurch: false, isPersonal: true, isMinistryDefault: false })) {
    const { flaggedCount } = moderateText(nickname, { strictness: settings.strictness, behavior: settings.behavior })
    if (flaggedCount > 0) {
      void recordChatOffense(groupId, nickname)
      return { error: "That nickname was blocked by the chat filter. Try another.", blocked: true }
    }
  }

  const { error } = await admin
    .from("chat_nicknames")
    .upsert(
      { group_id: groupId, target_user_id: targetUserId, ministry_id: ministryId, nickname, set_by: userId, updated_at: new Date().toISOString() },
      { onConflict: "group_id,target_user_id" },
    )
  if (error) return { error: error.message }

  return { error: null, nickname }
}

export async function clearChatNickname(groupId: string, targetUserId: string): Promise<NicknameResult> {
  const auth = await authorize(groupId, targetUserId)
  if (auth.error !== null) return { error: auth.error }

  const admin = createAdminClient()
  const { error } = await admin
    .from("chat_nicknames")
    .delete()
    .eq("group_id", groupId)
    .eq("target_user_id", targetUserId)
  if (error) return { error: error.message }

  return { error: null, nickname: null }
}
