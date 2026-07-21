// Create the 200-user fleet (fleet001..fleet200@loadtest.test) + the canary user,
// wire profiles into the Load Test tenant, paced to be gentle on the auth admin API.
// Idempotent: existing users are skipped. Run: node scripts/loadtest/create-fleet-users.cjs
const { MINISTRY_ID, FLEET_EMAIL, FLEET_SIZE, loadEnv, serviceClient, sleep } = require("./lib.cjs")

loadEnv()
const PASS = process.env.E2E_PASSWORD
const BRIANS_SANDBOX = "6c68111b-0248-45ba-9ab1-169ee33f62c9"
const CANARY_EMAIL = "canary@loadtest.test"

;(async () => {
  const db = serviceClient()

  // one listUsers sweep to make creation idempotent (pages of 1000 cover us)
  const existing = new Map()
  const { data: list, error: lerr } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (lerr) throw lerr
  for (const u of list.users) existing.set(u.email, u.id)

  let created = 0
  for (let i = 1; i <= FLEET_SIZE; i++) {
    const email = FLEET_EMAIL(i)
    if (existing.has(email)) continue
    const { data, error } = await db.auth.admin.createUser({ email, password: PASS, email_confirm: true })
    if (error) throw new Error(`${email}: ${error.message}`)
    existing.set(email, data.user.id)
    created++
    if (created % 20 === 0) console.log(`created ${created}…`)
    await sleep(200) // ~5/s
  }
  console.log(`auth users: ${created} created, ${FLEET_SIZE - created} already existed`)

  // Wire profiles: tenant, member role, and the member-tier middleware gate fields
  // (gender + graduation_year — without them login routes to complete-profile).
  const ids = Array.from({ length: FLEET_SIZE }, (_, k) => existing.get(FLEET_EMAIL(k + 1))).filter(Boolean)
  for (let off = 0; off < ids.length; off += 50) {
    const batch = ids.slice(off, off + 50)
    const { error } = await db
      .from("profiles")
      .update({ ministry_id: MINISTRY_ID, role: "member", gender: "male", graduation_year: 2028, grade: "junior" })
      .in("id", batch)
      .is("ministry_id", null) // only claim fresh profiles; re-runs leave wired ones alone
    if (error) throw error
  }
  // names (separate pass, cheap; skip if already named)
  const { data: unnamed } = await db.from("profiles").select("id, email").eq("ministry_id", MINISTRY_ID).like("email", "fleet%@loadtest.test").like("name", "%@loadtest.test%")
  for (const p of unnamed ?? []) {
    const n = p.email.match(/fleet(\d+)/)?.[1]
    await db.from("profiles").update({ name: `Fleet User ${Number(n)}` }).eq("id", p.id)
  }

  const { count } = await db.from("profiles").select("*", { count: "exact", head: true }).eq("ministry_id", MINISTRY_ID).like("email", "fleet%@loadtest.test")
  console.log(`fleet profiles wired into tenant: ${count}/${FLEET_SIZE}`)

  // Canary user — member of Brian's Sandbox (a REAL tenant on the shared infra,
  // designated for testing). Its latency during the burst is the "are we hurting
  // real users" signal.
  if (!existing.has(CANARY_EMAIL)) {
    const { data, error } = await db.auth.admin.createUser({ email: CANARY_EMAIL, password: PASS, email_confirm: true })
    if (error) throw error
    existing.set(CANARY_EMAIL, data.user.id)
    console.log(`canary auth user created`)
  }
  const canaryId = existing.get(CANARY_EMAIL)
  await db.from("profiles").update({ ministry_id: BRIANS_SANDBOX, role: "member", name: "Canary (load test)", gender: "male", graduation_year: 2028, grade: "junior" }).eq("id", canaryId)
  const { data: central } = await db.from("groups").select("id").eq("ministry_id", BRIANS_SANDBOX).eq("type", "church").limit(1).single()
  if (central) {
    await db.from("group_members").upsert({ group_id: central.id, user_id: canaryId }, { onConflict: "group_id,user_id", ignoreDuplicates: true })
  }
  console.log(`canary wired into Brian's Sandbox (${canaryId})`)
  process.exit(0)
})().catch((e) => { console.error("FATAL", e.message || e); process.exit(1) })
