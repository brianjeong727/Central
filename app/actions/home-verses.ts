"use server"

import { createAdminClient } from "@/lib/supabase-admin"

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
  userId: string
): Promise<{ data: HomeVerse | null; error: string | null }> {
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
    .insert({ ministry_id: ministryId, reference, text, order_index: nextIndex, created_by: userId })
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
  const supabase = createAdminClient()
  const { error } = await supabase
    .from("home_verses")
    .update({ reference, text })
    .eq("id", id)
  return { error: error?.message ?? null }
}

export async function deleteHomeVerse(id: string): Promise<{ error: string | null }> {
  const supabase = createAdminClient()
  const { error } = await supabase.from("home_verses").delete().eq("id", id)
  return { error: error?.message ?? null }
}

export async function reorderHomeVerses(
  ministryId: string,
  orderedIds: string[]
): Promise<{ error: string | null }> {
  const supabase = createAdminClient()
  const updates = orderedIds.map((id, index) => ({
    id,
    order_index: index,
    ministry_id: ministryId,
  }))
  const { error } = await supabase.from("home_verses").upsert(updates)
  return { error: error?.message ?? null }
}
