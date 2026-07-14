"use server"

// Per-user blocking (App Store §1.2 UGC — "the ability to block abusive users").
// A member blocks another member: the blocked user's messages are hidden from the
// blocker client-side, and the blocker can't start a DM with them. The block is
// SILENT to the blocked party (they never learn; RLS guarantees the data side).
//
// user_blocks RLS is blocker-scoped for every operation. There is NO update
// policy, so we NEVER upsert — a repeat block is a plain INSERT whose duplicate
// error (23505) is treated as success (already blocked).

import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryMember } from "./authz"

export async function blockUser(blockedId: string): Promise<{ error: string | null }> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }
  const { userId, ministryId } = ctx

  if (!blockedId) return { error: "No user specified." }
  if (blockedId === userId) return { error: "You can't block yourself." }

  const admin = createAdminClient()
  const { error } = await admin.from("user_blocks").insert({
    blocker_id: userId,
    blocked_id: blockedId,
    ministry_id: ministryId,
  })
  // Duplicate = already blocked → success (plain INSERT, no upsert; there is no
  // UPDATE policy to fall back on).
  if (error && error.code !== "23505") return { error: error.message }
  return { error: null }
}

export async function unblockUser(blockedId: string): Promise<{ error: string | null }> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }
  const { userId } = ctx

  if (!blockedId) return { error: "No user specified." }

  const admin = createAdminClient()
  const { error } = await admin
    .from("user_blocks")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", blockedId)
  if (error) return { error: error.message }
  return { error: null }
}
