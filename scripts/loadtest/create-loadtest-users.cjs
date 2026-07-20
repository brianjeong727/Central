// Create 2 real auth users for the Load Test 200 tenant and wire their profiles.
const fs = require("node:fs")
const path = require("node:path")
const { createClient } = require("@supabase/supabase-js")
const ws = require("ws")

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim()
  if (!t || t.startsWith("#")) continue
  const eq = t.indexOf("=")
  if (eq === -1) continue
  const k = t.slice(0, eq).trim()
  let v = t.slice(eq + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(k in process.env)) process.env[k] = v
}

const MID = "f00d1e57-0000-4000-8000-000000000001"
const PASS = process.env.E2E_PASSWORD
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

async function ensureUser(email, role, name) {
  const { data: list } = await db.auth.admin.listUsers({ perPage: 1000 })
  let u = list.users.find((x) => x.email === email)
  if (!u) {
    const { data, error } = await db.auth.admin.createUser({ email, password: PASS, email_confirm: true })
    if (error) throw error
    u = data.user
    console.log(`created auth user ${email} → ${u.id}`)
  } else {
    console.log(`auth user exists ${email} → ${u.id}`)
  }
  // handle_new_user made a profiles row (ministry NULL) — point it at the tenant
  const { error: perr } = await db.from("profiles").update({ ministry_id: MID, role, name }).eq("id", u.id)
  if (perr) throw perr
  // central chat enrollment (auto-enroll only fires on INSERT, not this UPDATE)
  const { data: central } = await db.from("groups").select("id").eq("ministry_id", MID).eq("type", "church").single()
  const { error: gerr } = await db.from("group_members").upsert(
    { group_id: central.id, user_id: u.id },
    { onConflict: "group_id,user_id", ignoreDuplicates: true },
  )
  if (gerr) throw gerr
  // and one DG group each for the my-chats path
  const { data: dg } = await db.from("groups").select("id").eq("ministry_id", MID).eq("type", "my").limit(1).single()
  await db.from("group_members").upsert({ group_id: dg.id, user_id: u.id }, { onConflict: "group_id,user_id", ignoreDuplicates: true })
  return u.id
}

;(async () => {
  await ensureUser("loadtest.admin@loadtest.test", "admin", "Load Admin")
  await ensureUser("loadtest.member@loadtest.test", "member", "Load Member")
  const { count } = await db.from("group_members").select("*", { count: "exact", head: true })
    .eq("group_id", (await db.from("groups").select("id").eq("ministry_id", MID).eq("type", "church").single()).data.id)
  console.log(`church chat member count: ${count}`)
  console.log("done")
})().catch((e) => { console.error("FATAL", e.message || e); process.exit(1) })
