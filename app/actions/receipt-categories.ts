"use server"

import { createClient } from "@/lib/supabase-server"

export interface ReceiptCategory {
  id: string
  ministry_id: string
  team_id: string
  name: string
  fund: string
  order_index: number
  created_by: string | null
  created_at: string
}

// Create a per-team receipt category. RLS enforces that the caller is a member of
// the team (or an admin/leader); ministry_id is set on the row per convention #8.
export async function createReceiptCategory(params: {
  ministryId: string
  teamId: string
  name: string
  fund?: string
}): Promise<{ data: ReceiptCategory | null; error: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: "Not authenticated" }

  const name = params.name.trim()
  if (!name) return { data: null, error: "Category name is required." }

  // Next order_index for this team (append to the end of the strip).
  const { data: last } = await supabase
    .from("receipt_categories")
    .select("order_index")
    .eq("ministry_id", params.ministryId)
    .eq("team_id", params.teamId)
    .order("order_index", { ascending: false })
    .limit(1)
  const nextOrder = last && last.length ? (last[0].order_index ?? 0) + 1 : 0

  const { data, error } = await supabase
    .from("receipt_categories")
    .insert({
      ministry_id: params.ministryId,
      team_id: params.teamId,
      name,
      fund: params.fund ?? "church",
      order_index: nextOrder,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as ReceiptCategory, error: null }
}

// List a team's receipt categories, ordered for the sub-tab strip.
export async function listReceiptCategories(
  ministryId: string,
  teamId: string,
): Promise<{ data: ReceiptCategory[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("receipt_categories")
    .select("*")
    .eq("ministry_id", ministryId)
    .eq("team_id", teamId)
    .order("order_index", { ascending: true })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as ReceiptCategory[], error: null }
}

export async function deleteReceiptCategory(
  id: string,
  ministryId: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("receipt_categories")
    .delete()
    .eq("id", id)
    .eq("ministry_id", ministryId)

  if (error) return { error: error.message }
  return { error: null }
}

// Persist a new ordering. Each id is written with its new order_index, scoped to
// the ministry (convention #8). RLS enforces team membership.
export async function reorderReceiptCategories(
  ministryId: string,
  orderedIds: string[],
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("receipt_categories")
      .update({ order_index: i })
      .eq("id", orderedIds[i])
      .eq("ministry_id", ministryId)
    if (error) return { error: error.message }
  }
  return { error: null }
}
