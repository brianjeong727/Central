"use server"

// ── "Is this attachment still referenced?" ────────────────────────────────────
//
// Forwarding copies `attachment_url` VERBATIM, so a forwarded message points at the
// SAME storage object. Deleting the original must therefore not remove the file while
// another live message still shows it.
//
// The client cannot answer this question. `messages` RLS only returns rows in chats the
// caller belongs to, and a forward by definition lives in the FORWARDER's chat — which
// the original sender usually is not in. Probed by rls-reviewer on the real data: the
// client-side guard saw 0 references when the truth was 2, removed the object, and the
// hidden forward began 404ing. So the guard was not merely incomplete; in the DEFAULT
// forward topology it was wrong.
//
// This runs the count with the service-role client so it sees every chat, and returns a
// BOOLEAN — never the rows, never which chats. The caller learns exactly one bit about
// an attachment it is already entitled to delete.
//
// The `.remove()` itself deliberately STAYS on the client, under the
// `owner = auth.uid()` storage policy. Moving deletion server-side would put it behind
// the service role and quietly retire the policy that enforces "only the uploader".

import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryMember } from "./authz"

/**
 * True when a message OTHER than `excludeMessageId` still points at `attachmentUrl`.
 *
 * FAILS CLOSED: any authorization problem, bad input, or query error returns `true`
 * ("still referenced"), so the caller skips removal. An orphaned file is recoverable —
 * a broken image in someone else's chat is not.
 */
export async function attachmentStillReferenced(
  attachmentUrl: string,
  excludeMessageId: string,
): Promise<boolean> {
  if (!attachmentUrl || !excludeMessageId) return true

  const ctx = await requireMinistryMember()
  if (ctx.error) return true

  const admin = createAdminClient()

  // The caller must be the SENDER of the message being deleted. That is the same gate
  // handleDeleteMessage's own UPDATE enforces (`.eq("sender_id", userId)`) and the same
  // one the storage policy enforces (`owner = auth.uid()`), so this endpoint cannot be
  // used to probe attachments the caller could not already delete.
  const { data: own, error: ownErr } = await admin
    .from("messages")
    .select("id, attachment_url, sender_id, ministry_id")
    .eq("id", excludeMessageId)
    .maybeSingle()

  if (ownErr || !own) return true
  if (own.sender_id !== ctx.userId) return true
  if (own.attachment_url !== attachmentUrl) return true

  const { count, error } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("attachment_url", attachmentUrl)
    .neq("id", excludeMessageId)
    .not("deleted", "is", true)

  if (error) return true
  return (count ?? 0) > 0
}
