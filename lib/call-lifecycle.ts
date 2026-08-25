// ─── Ending a call — shared by the server actions and the LiveKit webhook ────
//
// Extracted out of app/actions/calls.ts because a "use server" file may only
// export async functions, and the webhook route needs the same close-out path.
// It has to be the SAME path, not a copy: whoever gets there first (the last
// person to hang up, or LiveKit reporting the room empty) must produce exactly
// one ended row and exactly one summary line in the chat.

import type { createAdminClient } from "@/lib/supabase-admin"

type Admin = ReturnType<typeof createAdminClient>

export type CallEndReason = "completed" | "declined" | "missed" | "cancelled" | "failed"

/** A ringing call nobody answered is dead after this long. */
export const RING_TIMEOUT_MS = 60_000

export function callSummaryLine(
  reason: CallEndReason,
  answeredAt: string | null,
  kind: "audio" | "video",
): string {
  const noun = kind === "video" ? "Video call" : "Call"
  if (reason === "declined") return `${noun} declined`
  if (reason === "missed" || !answeredAt) return `Missed ${noun.toLowerCase()}`
  if (reason === "failed") return `${noun} failed to connect`
  const secs = Math.max(0, Math.round((Date.now() - new Date(answeredAt).getTime()) / 1000))
  const mm = Math.floor(secs / 60)
  const ss = String(secs % 60).padStart(2, "0")
  return `${noun} ended · ${mm}:${ss}`
}

/**
 * Close a call out: stamp the row, release its participants, then write the
 * in-chat summary line.
 *
 * Idempotent by construction. The `.neq("status", "ended")` on the UPDATE is
 * what makes it so — the row is claimed and returned in one statement, so a
 * second caller gets no row back and stops before writing a duplicate system
 * message. That matters because both sides of a hang-up race here, and so does
 * the webhook a moment later.
 */
export async function finalizeCall(
  admin: Admin,
  callId: string,
  reason: CallEndReason,
): Promise<boolean> {
  const now = new Date().toISOString()
  const { data: call } = await admin
    .from("calls")
    .update({ status: "ended", ended_at: now, end_reason: reason })
    .eq("id", callId)
    .neq("status", "ended")
    .select("id, group_id, answered_at, kind")
    .maybeSingle()
  if (!call) return false // someone else already ended it

  await admin
    .from("call_participants")
    .update({ state: "left", left_at: now })
    .eq("call_id", callId)
    .eq("state", "joined")

  // NO ministry_id — `messages` does not have that column (it is scoped through
  // group_id, the same way event_tasks is scoped through its plan). Passing one
  // makes PostgREST reject the whole insert, and this write was previously
  // unchecked, so the call ended correctly and the chat silently gained no record
  // of it. The error is inspected now for exactly that reason.
  const { error } = await admin.from("messages").insert({
    group_id: call.group_id,
    sender_id: null,
    message_type: "system",
    content: callSummaryLine(reason, call.answered_at, (call.kind as "audio" | "video") ?? "audio"),
  })
  if (error) console.error("[calls] call summary line failed to post:", error.message)
  return true
}
