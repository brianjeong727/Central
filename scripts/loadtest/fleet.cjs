// Fleet coordinator: builds the client manifest (tokens × group memberships),
// spawns workers, runs the connection plan, watches tripwires, refreshes tokens,
// and guarantees a <10s teardown on SIGINT or abort.
//
//   node scripts/loadtest/fleet.cjs --plan "50x120,100x120,200x600" \
//        [--workers 8] [--open-ratio 0.25] [--stagger 50] [--run-id burstA]
//
//   --plan     steps "COUNTxHOLD_SECONDS": bring fleet to COUNT clients, hold.
//   --stagger  ms between client starts within a worker (50ms × 200 ≈ the 10s
//              "service start" join spike at the 200 step).
// Tripwires (auto-abort): fallbacks > 2% of fleet · disconnects > 10% of fleet ·
// any worker loop-delay p99 > 1000ms for 3 consecutive stats.
const { fork } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const { MINISTRY_ID, serviceClient, readTokens, writeTokens, ndjsonLogger, sleep } = require("./lib.cjs")
const { createClient } = require("@supabase/supabase-js")
const ws = require("ws")

const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1] }
const PLAN = String(flag("--plan", "20x60")).split(",").map((s) => { const [c, h] = s.split("x").map(Number); return { count: c, holdS: h } })
const WORKERS = Number(flag("--workers", 8))
const OPEN_RATIO = Number(flag("--open-ratio", 0.25))
const STAGGER = Number(flag("--stagger", 50))
const RUN_ID = String(flag("--run-id", `run${Date.now()}`))

;(async () => {
  const db = serviceClient()
  const tokens = readTokens()

  // manifest: every warmed fleet user + its group ids, open flag assigned round-robin
  const { data: groups } = await db.from("groups").select("id, type").eq("ministry_id", MINISTRY_ID)
  const central = groups.find((g) => g.type === "church")
  const gids = groups.map((g) => g.id)
  const userIds = Object.values(tokens).map((t) => t.user_id)
  const memberships = []
  for (let off = 0; off < userIds.length; off += 100) {
    const { data, error } = await db.from("group_members").select("user_id, group_id").in("group_id", gids).in("user_id", userIds.slice(off, off + 100))
    if (error) throw error
    memberships.push(...data)
  }
  const byUser = new Map()
  for (const m of memberships) {
    if (!byUser.has(m.user_id)) byUser.set(m.user_id, [])
    byUser.get(m.user_id).push(m.group_id)
  }
  const manifest = Object.entries(tokens)
    .filter(([email]) => email.startsWith("fleet"))
    .map(([email, t], i) => ({ email, user_id: t.user_id, access_token: t.access_token, groups: byUser.get(t.user_id) ?? [], open: i % Math.round(1 / OPEN_RATIO) === 0 }))
    .filter((r) => r.groups.length > 0)
  const maxCount = Math.max(...PLAN.map((p) => p.count))
  if (manifest.length < maxCount) throw new Error(`plan needs ${maxCount} clients but only ${manifest.length} warmed+membered — run warm-sessions/swap-memberships`)

  const manifestPath = path.join(__dirname, "logs", `${RUN_ID}-manifest.json`)
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  fs.writeFileSync(manifestPath, JSON.stringify(manifest))
  const out = ndjsonLogger(`${RUN_ID}-coordinator.ndjson`)
  console.log(`[fleet] manifest: ${manifest.length} clients, central=${central.id}, open ratio ${OPEN_RATIO}`)

  const workers = new Map() // workerId -> {proc, lastStat, highLoopCount}
  const CHUNK = Math.max(10, Math.ceil(maxCount / WORKERS))
  let covered = 0 // clients launched so far (manifest prefix)
  let nextWorkerId = 0
  let aborted = false

  // Each ramp step spawns fresh workers covering the DELTA [covered, target) in
  // chunks of ≤CHUNK clients — existing workers never need to grow.
  function spawnUpTo(target) {
    while (covered < target) {
      const from = covered
      const to = Math.min(from + CHUNK, target)
      const w = nextWorkerId++
      const proc = fork(path.join(__dirname, "fleet-worker.cjs"), [], {
        env: { ...process.env, MANIFEST: manifestPath, RANGE: `${from}:${to}`, WORKER_ID: String(w), RUN_ID, CENTRAL_GID: central.id, STAGGER_MS: String(STAGGER) },
      })
      workers.set(w, { proc, lastStat: null, highLoopCount: 0 })
      proc.on("message", (m) => { if (m.type === "stat") onStat(w, m) })
      proc.on("exit", (code) => { workers.delete(w); if (!aborted && code !== 0) console.error(`[fleet] worker ${w} died (${code})`) })
      covered = to
    }
  }

  function totals() {
    let t = { connected: 0, joined: 0, joinFails: 0, fallbacks: 0, recv: 0, disconnects: 0, clients: 0 }
    for (const { lastStat } of workers.values()) {
      if (!lastStat) continue
      for (const k of Object.keys(t)) t[k] += lastStat[k] ?? 0
    }
    return t
  }

  function onStat(w, m) {
    const rec = workers.get(w)
    if (!rec) return
    rec.lastStat = m
    rec.highLoopCount = m.loopP99 > 1000 ? rec.highLoopCount + 1 : 0
    const t = totals()
    out.log({ ev: "totals", ...t })
    // tripwires
    if (t.clients >= 20) {
      if (t.fallbacks > 0.02 * t.clients) return abort(`fallbacks ${t.fallbacks} > 2% of ${t.clients}`)
      if (t.disconnects > 0.1 * t.clients) return abort(`disconnects ${t.disconnects} > 10% of ${t.clients}`)
    }
    if (rec.highLoopCount >= 3) return abort(`worker ${w} event-loop p99 > 1s x3 — measurements invalid`)
  }

  function abort(reason) {
    if (aborted) return
    aborted = true
    console.error(`\n[fleet] ABORT: ${reason}`)
    out.log({ ev: "abort", reason })
    shutdown(1)
  }

  function shutdown(code) {
    for (const { proc } of workers.values()) { try { proc.send({ type: "shutdown" }) } catch { /* */ } }
    // Exit as soon as every worker process has actually exited (sockets closed),
    // with a hard 8s SIGKILL backstop so a wedged worker can never hang teardown.
    const finish = () => { out.close(); process.exit(code) }
    const poll = setInterval(() => { if (workers.size === 0) { clearInterval(poll); clearTimeout(hard); finish() } }, 250)
    const hard = setTimeout(() => {
      clearInterval(poll)
      for (const { proc } of workers.values()) { try { proc.kill("SIGKILL") } catch { /* */ } }
      finish()
    }, 8000)
  }
  process.on("SIGINT", () => { console.log("\n[fleet] SIGINT — tearing down"); out.log({ ev: "sigint" }); shutdown(130) })

  // token refresher: trickle-refresh anything expiring within 20min, push via IPC
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false }, realtime: { transport: ws } })
  setInterval(async () => {
    const store = readTokens()
    for (const [email, t] of Object.entries(store)) {
      if (!email.startsWith("fleet")) continue
      if (t.expires_at * 1000 - 20 * 60 * 1000 > Date.now()) continue
      const { data, error } = await anon.auth.refreshSession({ refresh_token: t.refresh_token })
      if (error) { out.log({ ev: "refresh_fail", email, err: error.message }); continue }
      const s = data.session
      store[email] = { user_id: s.user.id, access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at }
      writeTokens(store)
      // broadcast to all workers — the owner looks itself up, others no-op
      for (const { proc } of workers.values()) { try { proc.send({ type: "refresh", email, token: s.access_token }) } catch { /* */ } }
      out.log({ ev: "refreshed", email })
      await sleep(1500)
    }
  }, 5 * 60 * 1000)

  // run the plan
  for (const step of PLAN) {
    if (aborted) break
    console.log(`[fleet] → ${step.count} clients (hold ${step.holdS}s)`)
    out.log({ ev: "step", count: step.count, holdS: step.holdS })
    spawnUpTo(step.count)
    const holdUntil = Date.now() + step.holdS * 1000
    while (Date.now() < holdUntil && !aborted) {
      await sleep(5000)
      const t = totals()
      console.log(`[fleet] clients=${t.clients} joined=${t.joined} fails=${t.joinFails} fallbacks=${t.fallbacks} recv=${t.recv} disc=${t.disconnects}`)
    }
  }
  if (!aborted) { console.log("[fleet] plan complete — tearing down"); out.log({ ev: "plan_complete" }); shutdown(0) }
})().catch((e) => { console.error("FATAL", e); process.exit(1) })
