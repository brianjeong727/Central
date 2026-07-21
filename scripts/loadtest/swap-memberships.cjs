// Membership swap: the 200 ghosts leave the central chat, the 200 fleet users join
// (last_read_at backfilled — 200 members × 6k messages of unread computation is a
// self-inflicted wound otherwise). Fleet users also spread across the 5 DG groups so
// every client holds >1 chat topic, like real users. Idempotent.
// Run: node scripts/loadtest/swap-memberships.cjs
const { MINISTRY_ID, serviceClient } = require("./lib.cjs")

;(async () => {
  const db = serviceClient()

  const { data: central } = await db.from("groups").select("id").eq("ministry_id", MINISTRY_ID).eq("type", "church").limit(1).single()
  const { data: dgs } = await db.from("groups").select("id").eq("ministry_id", MINISTRY_ID).eq("type", "my").like("name", "Load DG Group%").order("name")
  const { data: ghosts } = await db.from("profiles").select("id").eq("ministry_id", MINISTRY_ID).like("email", "loaduser%@loadtest.test")
  const { data: fleet } = await db.from("profiles").select("id, email").eq("ministry_id", MINISTRY_ID).like("email", "fleet%@loadtest.test").order("email")
  if (!central || !fleet?.length) throw new Error("tenant not seeded / fleet missing")

  // ghosts out of the central chat (they stay as historical message authors)
  const ghostIds = (ghosts ?? []).map((g) => g.id)
  for (let off = 0; off < ghostIds.length; off += 100) {
    const { error } = await db.from("group_members").delete().eq("group_id", central.id).in("user_id", ghostIds.slice(off, off + 100))
    if (error) throw error
  }

  // fleet into the central chat, read-cursor at now
  const now = new Date().toISOString()
  const rows = fleet.map((f) => ({ group_id: central.id, user_id: f.id, last_read_at: now }))
  for (let off = 0; off < rows.length; off += 100) {
    const { error } = await db.from("group_members").upsert(rows.slice(off, off + 100), { onConflict: "group_id,user_id", ignoreDuplicates: true })
    if (error) throw error
  }

  // spread fleet across DG groups (i-th user → dg[i % 5]) for a second chat topic each
  if (dgs?.length) {
    const dgRows = fleet.map((f, i) => ({ group_id: dgs[i % dgs.length].id, user_id: f.id, last_read_at: now }))
    for (let off = 0; off < dgRows.length; off += 100) {
      const { error } = await db.from("group_members").upsert(dgRows.slice(off, off + 100), { onConflict: "group_id,user_id", ignoreDuplicates: true })
      if (error) throw error
    }
  }

  const { count: centralCount } = await db.from("group_members").select("*", { count: "exact", head: true }).eq("group_id", central.id)
  console.log(`central chat members now: ${centralCount} (target ≈202: 200 fleet + loadtest.admin + loadtest.member)`)
  console.log(`central group id: ${central.id}`)
  process.exit(0)
})().catch((e) => { console.error("FATAL", e.message || e); process.exit(1) })
