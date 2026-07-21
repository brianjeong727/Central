// Canary: a real-tenant client (Brian's Sandbox member) measuring what an actual
// user feels while the fleet hammers the shared infra. get_chat_list RPC + a
// page-1 messages select every 15s. Run it BEFORE the burst for a baseline, keep
// it running throughout. Alerts to stderr when latency exceeds 3× its own baseline.
//
//   node scripts/loadtest/canary.cjs [--run-id burstA] [--interval 15000]
const { loadEnv, userClient, ndjsonLogger, sleep, pct } = require("./lib.cjs")
const { createClient } = require("@supabase/supabase-js")
const ws = require("ws")

loadEnv()
const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1] }
const RUN_ID = String(flag("--run-id", `canary${Date.now()}`))
const INTERVAL = Number(flag("--interval", 15000))
const SANDBOX = "6c68111b-0248-45ba-9ab1-169ee33f62c9"

;(async () => {
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: true, persistSession: false }, realtime: { transport: ws } })
  const { data, error } = await auth.auth.signInWithPassword({ email: "canary@loadtest.test", password: process.env.E2E_PASSWORD })
  if (error) throw error
  const uid = data.session.user.id
  const sb = userClient(data.session.access_token)
  const out = ndjsonLogger(`${RUN_ID}-canary.ndjson`)

  const baseline = []
  let fails = 0
  console.log(`[canary] running as canary@loadtest.test in Brian's Sandbox — interval ${INTERVAL}ms`)
  for (;;) {
    const t0 = Date.now()
    const { error: rpcErr } = await sb.rpc("get_chat_list", { p_user_id: uid, p_ministry_id: SANDBOX })
    const rpcMs = Date.now() - t0
    const t1 = Date.now()
    const { data: grp } = await sb.from("groups").select("id").eq("ministry_id", SANDBOX).limit(1).single()
    const selMs = Date.now() - t1
    const ok = !rpcErr && !!grp
    out.log({ ev: "canary", rpcMs, selMs, ok })

    if (ok && baseline.length < 20) baseline.push(rpcMs)
    const base = baseline.length >= 5 ? pct(baseline, 95) : null
    if (!ok) {
      fails++
      console.error(`[canary] FAIL #${fails}: ${rpcErr?.message ?? "select failed"}${fails >= 2 ? "  ← 2 consecutive: ABORT the burst" : ""}`)
    } else {
      fails = 0
      const flag3x = base && rpcMs > 3 * base
      console.log(`[canary] rpc=${rpcMs}ms sel=${selMs}ms${flag3x ? "  ⚠ >3× baseline — watch for sustained breach (2min = ABORT)" : ""}`)
    }
    await sleep(INTERVAL)
  }
})().catch((e) => { console.error("FATAL", e.message || e); process.exit(1) })
