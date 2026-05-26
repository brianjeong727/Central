import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const MINISTRY_ID = "952066e9-d06e-4613-9d06-d3ce78c9f364"
const SGL_TEAM_ID = "67056b8b-317c-48cd-9f73-9910d0b6b254"
const PASTOR_ROLE_ID = "69ddad6e-63c1-4f6c-a01d-77fb7922db89"
const BRIAN_ID = "df1a8c40-2047-45cf-be50-eb807c9fde06"
const OLD_PASTOR_ID = "83e4388c-1c5e-4677-ba5e-09668a5d2941"

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 1. Delete old broken user (ignore errors)
  await supabase.auth.admin.deleteUser(OLD_PASTOR_ID)

  // 2. Create fresh user via admin API (uses Go bcrypt correctly)
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email: "bjj46+pastor@pitt.edu",
    password: "pastor123!",
    email_confirm: true,
    user_metadata: { name: "Pastor Test" },
  })

  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })

  const userId = created.user.id

  // 3. Update the auto-created profile row
  await supabase.from("profiles").upsert({
    id: userId,
    name: "Pastor Test",
    email: "bjj46+pastor@pitt.edu",
    role: "pastor",
    ministry_id: MINISTRY_ID,
  })

  // 4. Add to Small Group Leaders team with Pastor role
  await supabase.from("team_members").insert({
    team_id: SGL_TEAM_ID,
    user_id: userId,
    role_id: PASTOR_ROLE_ID,
    added_by: BRIAN_ID,
  })

  return NextResponse.json({ ok: true, email: "bjj46+pastor@pitt.edu", password: "pastor123!", userId })
}
