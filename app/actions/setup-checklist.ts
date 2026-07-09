"use server"

// "Getting started" checklist for admins of a freshly-registered ministry.
// Backed by ministries.setup_checklist (jsonb: { leaders_invited?, dismissed? }).
// The card itself lives in components/central/getting-started-card.tsx; the
// shared types are defined there (components/central is a leaf — app/ depends
// on it, never the reverse) and imported type-only here.

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { requireMinistryMember, isAdminTier } from "./authz"
import type {
  SetupChecklistData,
  SetupChecklistItem,
} from "@/components/central/getting-started-card"

// Only ministries created on/after this date see the checklist — existing
// ministries are long past setup and shouldn't get a retroactive to-do card.
const FEATURE_LAUNCH = "2026-07-08"

type ChecklistJson = { leaders_invited?: boolean; dismissed?: boolean }

export async function getSetupChecklist(): Promise<SetupChecklistData> {
  const ctx = await requireMinistryMember()
  // Admin-tier gate (Convention #2 admin-tier pattern via isAdminTier).
  if (ctx.error !== null || !isAdminTier(ctx.role)) return { eligible: false }
  const ministryId = ctx.ministryId

  // Ministries row via the service client: invite_code is column-revoked from
  // `authenticated` (same admin-scoped read as getMinistryCodes), and
  // created_at/setup_checklist ride along in the one scoped read.
  const admin = createAdminClient()
  const { data: ministry } = await admin
    .from("ministries")
    .select("invite_code, created_at, setup_checklist")
    .eq("id", ministryId)
    .maybeSingle()
  if (!ministry) return { eligible: false }
  if (new Date(ministry.created_at) < new Date(FEATURE_LAUNCH)) return { eligible: false }

  const checklist = (ministry.setup_checklist ?? {}) as ChecklistJson
  if (checklist.dismissed) return { eligible: false }

  // Same-ministry reads through the caller's own client where RLS allows
  // (profiles / announcements / ministry_giving are all readable by ministry
  // members in the client UI). Teams go through the service client because
  // team visibility for non-governance admins is narrowed under gov RLS.
  const supabase = await createClient()
  const [
    { count: membersCount },
    { count: announcementsCount },
    { data: giving },
    { data: teams },
  ] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("ministry_id", ministryId),
    supabase.from("announcements").select("id", { count: "exact", head: true }).eq("ministry_id", ministryId),
    supabase.from("ministry_giving").select("zelle_info").eq("ministry_id", ministryId).maybeSingle(),
    admin.from("teams").select("id").eq("ministry_id", ministryId),
  ])

  // "Has a president" = a team_members row whose role is the is_president role.
  const teamIds = ((teams ?? []) as { id: string }[]).map((t) => t.id)
  let teamsWithPresident = 0
  if (teamIds.length > 0) {
    const { data: pres } = await admin
      .from("team_members")
      .select("team_id, team_roles!inner(is_president)")
      .in("team_id", teamIds)
      .eq("team_roles.is_president", true)
    teamsWithPresident = new Set(((pres ?? []) as { team_id: string }[]).map((r) => r.team_id)).size
  }

  // "Offering set up" = a ministry_giving row exists AND zelle_info is non-empty
  // (the row is a singleton and zelle_info is nullable).
  const offeringSet = typeof giving?.zelle_info === "string" && giving.zelle_info.trim().length > 0

  const items: SetupChecklistItem[] = [
    { key: "invite_leaders", done: checklist.leaders_invited === true },
    // The approval-time seeded welcome announcement counts as 1 — "posted your
    // first announcement" means anything beyond it.
    { key: "first_announcement", done: (announcementsCount ?? 0) > 1 },
    { key: "offering", done: offeringSet },
  ]
  // Presidents row is omitted entirely when the ministry has no workspaces.
  if (teamIds.length > 0) {
    items.push({ key: "presidents", done: teamsWithPresident >= teamIds.length })
  }

  return {
    eligible: true,
    dismissed: false,
    items,
    inviteCode: ministry.invite_code ?? null,
    membersCount: membersCount ?? 0,
    teamsTotal: teamIds.length,
    teamsWithPresident,
  }
}

// Merge one patch into ministries.setup_checklist (read-modify-write, scoped to
// the caller's own ministry). Admin-tier only.
async function mergeChecklist(patch: ChecklistJson): Promise<{ error: string | null }> {
  const ctx = await requireMinistryMember()
  if (ctx.error !== null) return { error: ctx.error }
  if (!isAdminTier(ctx.role)) return { error: "Not authorized." }

  const admin = createAdminClient()
  const { data: row } = await admin
    .from("ministries")
    .select("setup_checklist")
    .eq("id", ctx.ministryId)
    .maybeSingle()
  const next = { ...((row?.setup_checklist ?? {}) as ChecklistJson), ...patch }
  const { error } = await admin
    .from("ministries")
    .update({ setup_checklist: next })
    .eq("id", ctx.ministryId)
  return { error: error?.message ?? null }
}

export async function setLeadersInvited(done: boolean): Promise<{ error: string | null }> {
  return mergeChecklist({ leaders_invited: done })
}

export async function dismissSetupChecklist(): Promise<{ error: string | null }> {
  return mergeChecklist({ dismissed: true })
}
