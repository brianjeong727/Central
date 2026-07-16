// Seed the E2E sandbox tenant: one ministry + admin/member test users.
// Idempotent — safe to re-run; finds-or-creates everything by fixed emails/name.
//
//   node --env-file=.env.local scripts/seed-e2e.mjs
//
// Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, E2E_PASSWORD.
// The E2E harness (e2e/) logs in as these users; all their writes are isolated
// to the sandbox ministry by RLS, so tests never touch real congregations.
import { createClient } from "@supabase/supabase-js"
import ws from "ws" // supabase-js needs a WebSocket impl under Node < 22

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const PASSWORD = process.env.E2E_PASSWORD
if (!URL_ || !KEY) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
if (!PASSWORD) throw new Error("Missing E2E_PASSWORD in .env.local")

// LANE env var seeds a per-slot sandbox (LANE=2 -> "E2E Sandbox 2", e2e2.* users)
// so parallel verification gates never collide in one tenant.
const LANE = process.env.LANE && process.env.LANE !== "1" ? process.env.LANE : ""
const SUF = LANE ? ` ${LANE}` : ""
const ESUF = LANE ? LANE : ""
const MINISTRY_NAME = `E2E Sandbox${SUF}`
const INVITE_CODE = `E2E-SBX${ESUF}`
const USERS = [
  { email: `e2e${ESUF}.admin@test.com`, name: `E2E Admin${SUF}`, role: "admin" },
  { email: `e2e${ESUF}.member@test.com`, name: `E2E Member${SUF}`, role: "member" },
]

const db = createClient(URL_, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

async function findOrCreateUser({ email, name }) {
  const { data: page, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) throw listErr
  const existing = page.users.find((u) => u.email === email)
  if (existing) {
    // keep the password in sync with E2E_PASSWORD so rotating it just means re-running this
    await db.auth.admin.updateUserById(existing.id, { password: PASSWORD })
    return existing.id
  }
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  })
  if (error) throw error
  return data.user.id
}

const ids = {}
for (const u of USERS) ids[u.email] = await findOrCreateUser(u)

// handle_new_user() auto-created profile rows; ministry needs created_by, so ministry comes second
let { data: ministry } = await db.from("ministries").select("id").eq("name", MINISTRY_NAME).maybeSingle()
if (!ministry) {
  const { data, error } = await db
    .from("ministries")
    .insert({
      name: MINISTRY_NAME,
      university: "E2E University",
      size: "small",
      invite_code: INVITE_CODE,
      status: "active",
      is_public: false,
      created_by: ids[USERS[0].email],
    })
    .select("id")
    .single()
  if (error) throw error
  ministry = data
}

for (const u of USERS) {
  const { error } = await db
    .from("profiles")
    // gender + graduation_year are REQUIRED for member-tier accounts: the OAuth
    // onboarding gate (proxy.ts) redirects any member/visitor profile missing
    // either to /complete-profile, which would break auth.setup + every
    // memberState spec. Seed them complete so a fresh re-seed stays green.
    .update({
      ministry_id: ministry.id, role: u.role, name: u.name, needs_grad_check: false,
      gender: "female", graduation_year: new Date().getFullYear() + 2,
    })
    .eq("id", ids[u.email])
  if (error) throw error
}

console.log(`✓ E2E sandbox ready`)
console.log(`  ministry: ${MINISTRY_NAME} (${ministry.id})`)
for (const u of USERS) console.log(`  ${u.role.padEnd(6)} ${u.email}`)
console.log(`\nAdd/keep in .env.local: E2E_MINISTRY_ID=${ministry.id}`)
