"use server"

// Content reporting (App Store §1.2 UGC — "a mechanism to report offensive
// content"). A ministry MEMBER files a report against a message, announcement, or
// profile; ministry ADMINS triage it from Church Settings → Reports.
//
// Follows the authz doctrine (app/actions/authz.ts): verify the CALLER, resolve
// the target's ministry + author with the admin client, confirm same-ministry,
// THEN write with ministry_id stamped. content_reports RLS is reporter-scoped
// insert + admin-only read/update — the server-side checks are defense-in-depth.

import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryMember, requireMinistryAdmin } from "./authz"

export type ReportTargetType = "message" | "announcement" | "profile"
export type ReportReason = "inappropriate" | "harassment" | "spam" | "other"
export type ReportStatus = "open" | "reviewed" | "dismissed" | "actioned"

const VALID_REASONS: ReportReason[] = ["inappropriate", "harassment", "spam", "other"]
const VALID_UPDATE_STATUSES: ReportStatus[] = ["reviewed", "dismissed", "actioned"]

export interface CreateReportInput {
  targetType: ReportTargetType
  targetId: string
  reason: ReportReason
  details?: string
}

export async function createReport(input: CreateReportInput): Promise<{ error: string | null }> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }
  const { userId, ministryId } = ctx

  if (!VALID_REASONS.includes(input.reason)) return { error: "Invalid reason." }
  if (!input.targetId) return { error: "Nothing to report." }

  const admin = createAdminClient()

  // Resolve the target's ministry (for same-tenant enforcement) and its author
  // (reported_user_id) per target type.
  let targetMinistryId: string | null = null
  let reportedUserId: string | null = null

  if (input.targetType === "message") {
    const { data: msg } = await admin
      .from("messages")
      .select("sender_id, group_id")
      .eq("id", input.targetId)
      .maybeSingle()
    if (!msg) return { error: "Message not found." }
    const { data: grp } = await admin
      .from("groups")
      .select("ministry_id")
      .eq("id", msg.group_id)
      .maybeSingle()
    targetMinistryId = grp?.ministry_id ?? null
    reportedUserId = msg.sender_id ?? null
  } else if (input.targetType === "announcement") {
    const { data: ann } = await admin
      .from("announcements")
      .select("ministry_id, created_by")
      .eq("id", input.targetId)
      .maybeSingle()
    if (!ann) return { error: "Announcement not found." }
    targetMinistryId = ann.ministry_id
    reportedUserId = ann.created_by ?? null
  } else if (input.targetType === "profile") {
    const { data: prof } = await admin
      .from("profiles")
      .select("ministry_id")
      .eq("id", input.targetId)
      .maybeSingle()
    if (!prof) return { error: "Profile not found." }
    targetMinistryId = prof.ministry_id
    reportedUserId = input.targetId
  } else {
    return { error: "Invalid report target." }
  }

  if (!targetMinistryId || targetMinistryId !== ministryId) return { error: "Not authorized." }

  const details = (input.details ?? "").trim().slice(0, 2000) || null

  const { error } = await admin.from("content_reports").insert({
    ministry_id: ministryId,
    reporter_id: userId,
    target_type: input.targetType,
    target_id: input.targetId,
    reported_user_id: reportedUserId,
    reason: input.reason,
    details,
    status: "open",
  })
  if (error) return { error: error.message }
  return { error: null }
}

// Admin triage: mark a report reviewed / dismissed / actioned. Verifies the
// caller is an admin of the report's own ministry before writing.
export async function updateReportStatus(
  reportId: string,
  status: ReportStatus,
): Promise<{ error: string | null }> {
  if (!VALID_UPDATE_STATUSES.includes(status)) return { error: "Invalid status." }

  const admin = createAdminClient()
  const { data: report } = await admin
    .from("content_reports")
    .select("ministry_id")
    .eq("id", reportId)
    .maybeSingle()
  if (!report) return { error: "Report not found." }

  const ctx = await requireMinistryAdmin(report.ministry_id)
  if (ctx.error !== null) return { error: ctx.error }

  const { error } = await admin
    .from("content_reports")
    .update({ status, reviewed_by: ctx.userId, reviewed_at: new Date().toISOString() })
    .eq("id", reportId)
    .eq("ministry_id", report.ministry_id)
  if (error) return { error: error.message }
  return { error: null }
}
