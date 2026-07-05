"use server"

import { createClient } from "@/lib/supabase-server"
import { createAdminClient } from "@/lib/supabase-admin"
import { SUPER_UUID, CENTRAL_MINISTRY_ID, HOME_ROLE, MINISTRY_ROLES } from "./super-constants"

// Switch the super account's ministry role to test the real gates + RLS.
// The privileged write uses the service-role client (a user can't change their
// own role under RLS) — safe because it's gated on the verified super identity
// AND confined to sandbox ministries (is_sandbox = true).
export async function switchMinistryRole(role: string): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { error: "not authorized" }
    if (user.id !== SUPER_UUID) return { error: "not authorized" }

    if (!(MINISTRY_ROLES as readonly string[]).includes(role)) {
      return { error: "invalid role" }
    }

    const admin = createAdminClient()

    // Guardrail: the super's current ministry must be a sandbox. This is what
    // confines write-as to sandbox ministries only.
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("ministry_id")
      .eq("id", SUPER_UUID)
      .maybeSingle()
    if (profileErr) return { error: profileErr.message }
    if (!profile?.ministry_id) return { error: "super has no ministry" }

    const { data: ministry, error: ministryErr } = await admin
      .from("ministries")
      .select("is_sandbox")
      .eq("id", profile.ministry_id)
      .maybeSingle()
    if (ministryErr) return { error: ministryErr.message }
    if (!ministry?.is_sandbox) return { error: "current ministry is not a sandbox" }

    const { error: updateErr } = await admin
      .from("profiles")
      .update({ role })
      .eq("id", SUPER_UUID)
    if (updateErr) return { error: updateErr.message }

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to switch role." }
  }
}

// Return the super account to its home state (pastor of the Central sandbox).
export async function resetToSuper(): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) return { error: "not authorized" }
    if (user.id !== SUPER_UUID) return { error: "not authorized" }

    const admin = createAdminClient()
    const { error: updateErr } = await admin
      .from("profiles")
      .update({ role: HOME_ROLE, ministry_id: CENTRAL_MINISTRY_ID })
      .eq("id", SUPER_UUID)
    if (updateErr) return { error: updateErr.message }

    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to reset." }
  }
}
