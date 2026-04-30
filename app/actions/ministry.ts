"use server"

import { createClient } from "@/lib/supabase-server"

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export async function joinMinistryByCode(
  inviteCode: string
): Promise<{ ministryName: string | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { ministryName: null, error: "Not authenticated." }

  const { data: ministry, error: findErr } = await supabase
    .from("ministries")
    .select("id, name")
    .eq("invite_code", inviteCode.trim().toUpperCase())
    .maybeSingle()

  if (findErr) return { ministryName: null, error: findErr.message }
  if (!ministry) return { ministryName: null, error: "No ministry found with that invite code." }

  const { data: updatedRows, error: updateErr } = await supabase
    .from("profiles")
    .update({ ministry_id: ministry.id })
    .eq("id", user.id)
    .select("id")

  if (updateErr) return { ministryName: null, error: updateErr.message }
  if (!updatedRows || updatedRows.length === 0) {
    return { ministryName: null, error: "Profile not found. Please sign out and sign back in, then try again." }
  }

  return { ministryName: ministry.name, error: null }
}

export async function registerMinistry(data: {
  name: string
  university: string
  size: "small" | "medium" | "large"
}): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { error: "Not authenticated." }

  // Generate a unique invite code, retrying on collision (extremely rare)
  let inviteCode = generateInviteCode()
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: existing } = await supabase
      .from("ministries")
      .select("id")
      .eq("invite_code", inviteCode)
      .maybeSingle()
    if (!existing) break
    inviteCode = generateInviteCode()
  }

  const { data: ministry, error: createErr } = await supabase
    .from("ministries")
    .insert({
      name: data.name.trim(),
      university: data.university.trim(),
      size: data.size,
      invite_code: inviteCode,
      created_by: user.id,
    })
    .select("id")
    .single()

  if (createErr || !ministry) return { error: createErr?.message ?? "Failed to create ministry." }

  const { data: updatedRows, error: profileErr } = await supabase
    .from("profiles")
    .update({ ministry_id: ministry.id, role: "admin" })
    .eq("id", user.id)
    .select("id")

  if (profileErr) return { error: profileErr.message }
  if (!updatedRows || updatedRows.length === 0) {
    return { error: "Profile not found. Please sign out and sign back in, then try again." }
  }

  return { error: null }
}
