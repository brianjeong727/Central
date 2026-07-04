"use server"

import { createAdminClient } from "@/lib/supabase-admin"
import { requireSameMinistry, requireMinistryAdmin, requireMinistryMember, isAdminTier } from "@/app/actions/authz"

export interface HomeVerse {
  id: string
  ministry_id: string
  reference: string
  text: string
  order_index: number
  created_by: string | null
  created_at: string
}

export async function getHomeVerses(ministryId: string): Promise<HomeVerse[]> {
  // Read gate: caller must belong to this ministry.
  const authz = await requireSameMinistry(ministryId)
  if (authz.error !== null) return []

  const supabase = createAdminClient()
  const { data } = await supabase
    .from("home_verses")
    .select("*")
    .eq("ministry_id", ministryId)
    .order("order_index", { ascending: true })
  return (data ?? []) as HomeVerse[]
}

export async function addHomeVerse(
  ministryId: string,
  reference: string,
  text: string,
  // Retained for caller signature compatibility; created_by now comes from the
  // verified session instead of this caller-supplied value.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  userId: string
): Promise<{ data: HomeVerse | null; error: string | null }> {
  // Write gate: admin-tier of this ministry only.
  const authz = await requireMinistryAdmin(ministryId)
  if (authz.error !== null) return { data: null, error: authz.error }

  const supabase = createAdminClient()
  const { data: existing } = await supabase
    .from("home_verses")
    .select("order_index")
    .eq("ministry_id", ministryId)
    .order("order_index", { ascending: false })
    .limit(1)
  const nextIndex = (existing?.[0]?.order_index ?? -1) + 1
  const { data, error } = await supabase
    .from("home_verses")
    // created_by comes from the verified session, never the caller-supplied param.
    .insert({ ministry_id: ministryId, reference, text, order_index: nextIndex, created_by: authz.userId })
    .select()
    .single()
  if (error) return { data: null, error: error.message }
  return { data: data as HomeVerse, error: null }
}

export async function updateHomeVerse(
  id: string,
  reference: string,
  text: string
): Promise<{ error: string | null }> {
  // Write gate: admin-tier, scoped to the caller's own ministry.
  const authz = await requireMinistryMember()
  if (authz.error !== null) return { error: authz.error }
  if (!isAdminTier(authz.role)) return { error: "Not authorized." }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("home_verses")
    .update({ reference, text })
    .eq("id", id)
    .eq("ministry_id", authz.ministryId)
  return { error: error?.message ?? null }
}

export async function deleteHomeVerse(id: string): Promise<{ error: string | null }> {
  // Write gate: admin-tier, scoped to the caller's own ministry.
  const authz = await requireMinistryMember()
  if (authz.error !== null) return { error: authz.error }
  if (!isAdminTier(authz.role)) return { error: "Not authorized." }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from("home_verses")
    .delete()
    .eq("id", id)
    .eq("ministry_id", authz.ministryId)
  return { error: error?.message ?? null }
}

export async function reorderHomeVerses(
  ministryId: string,
  orderedIds: string[]
): Promise<{ error: string | null }> {
  // Write gate: admin-tier of this ministry only.
  const authz = await requireMinistryAdmin(ministryId)
  if (authz.error !== null) return { error: authz.error }

  const supabase = createAdminClient()

  // Only reorder rows that actually belong to this ministry — the upsert would
  // otherwise let a caller re-home another ministry's verse rows by id.
  const { data: ownRows } = await supabase
    .from("home_verses")
    .select("id")
    .eq("ministry_id", ministryId)
    .in("id", orderedIds)
  const ownIds = new Set((ownRows ?? []).map((r: { id: string }) => r.id))

  const updates = orderedIds
    .filter(id => ownIds.has(id))
    .map((id, index) => ({
      id,
      order_index: index,
      ministry_id: ministryId,
    }))
  if (updates.length === 0) return { error: null }

  const { error } = await supabase.from("home_verses").upsert(updates)
  return { error: error?.message ?? null }
}
