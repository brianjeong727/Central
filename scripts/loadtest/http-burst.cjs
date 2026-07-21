// HTTP hot-path burst: paced loops of the real home-load calls with random fleet
// JWTs (PostgREST tier), plus an authenticated Next-tier loop against the prod app
// (middleware JWT + RSC render) and an optional auth sign-in burst (campus-NAT shape).
//
//   node scripts/loadtest/http-burst.cjs --rps 5 --duration 300 [--run-id burstA]
//        [--next-rps 1] [--auth-burst 0]   (auth-burst = sign-ins per minute)
const { MINISTRY_ID, loadEnv, readTokens, ndjsonLogger, sleep, FLEET_EMAIL } = require("./lib.cjs")

loadEnv()
const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : Number(args[i + 1] ?? dflt) }
const sflag = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1] }
const RPS = flag("--rps", 5)
const DURATION = flag("--duration", 300)
const NEXT_RPS = flag("--next-rps", 1)
const AUTH_PER_MIN = flag("--auth-burst", 0)
const RUN_ID = String(sflag("--run-id", `http${Date.now()}`))
const SB_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const APP = "https://joincentral.app"

async function timed(out, kind, fn) {
  const t0 = Date.now()
  try {
    const res = await fn()
    // redirect:"manual" surfaces a 3xx as status 0 (opaqueredirect) or the real 3xx —
    // both are healthy for the Next-tier probes (/home → auth redirect is EXPECTED).
    // Treat <400 (and opaque 0) as ok; only 4xx/5xx are failures.
    const ok = res.status === 0 || (res.status >= 200 && res.status < 400)
    out.log({ ev: "http", kind, ms: Date.now() - t0, status: res.status, ok })
    if (res.status === 429 || res.status === 503) console.error(`[http] ${kind} → ${res.status} (tripwire!)`)
  } catch (e) {
    out.log({ ev: "http", kind, ms: Date.now() - t0, ok: false, err: String(e.message).slice(0, 120) })
  }
}

;(async () => {
  const tokens = readTokens()
  const fleet = Object.entries(tokens).filter(([e]) => e.startsWith("fleet"))
  if (!fleet.length) throw new Error("no warmed fleet tokens")
  const out = ndjsonLogger(`${RUN_ID}-http.ndjson`)
  const pick = () => fleet[Math.floor(Math.random() * fleet.length)][1]

  const H = (t) => ({ apikey: ANON(), Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json" })
  const MIX = [
    (t) => fetch(`${SB_URL()}/rest/v1/rpc/get_chat_list`, { method: "POST", headers: H(t), body: JSON.stringify({ p_user_id: t.user_id, p_ministry_id: MINISTRY_ID }) }),
    (t) => fetch(`${SB_URL()}/rest/v1/rpc/get_chat_previews`, { method: "POST", headers: H(t), body: JSON.stringify({ p_user_id: t.user_id, p_ministry_id: MINISTRY_ID }) }),
    (t) => fetch(`${SB_URL()}/rest/v1/announcements?ministry_id=eq.${MINISTRY_ID}&status=eq.published&order=created_at.desc&limit=30&select=id,title,body,is_pinned,is_event,created_at`, { headers: H(t) }),
    (t) => fetch(`${SB_URL()}/rest/v1/messages?select=id,group_id,sender_id,content,created_at&order=created_at.desc&limit=50&group_id=eq.${process.env.CENTRAL_GID ?? ""}`, { headers: H(t) }),
  ]
  const KINDS = ["get_chat_list", "get_chat_previews", "announcements_p1", "messages_p1"]

  const until = Date.now() + DURATION * 1000
  let i = 0

  // Next-tier loop: exercises Vercel middleware + RSC. Unauthenticated /home is a
  // pure middleware redirect; /login is a real RSC page render. Both are prod-tier
  // signals without cookie forgery.
  const nextLoop = (async () => {
    if (!NEXT_RPS) return
    while (Date.now() < until) {
      void timed(out, "next_login", () => fetch(`${APP}/login`, { redirect: "manual" }))
      void timed(out, "next_home_redirect", () => fetch(`${APP}/home`, { redirect: "manual" }))
      await sleep(1000 / NEXT_RPS)
    }
  })()

  // Auth burst: PASSWORD grants from this one IP at the campus-NAT rate.
  const authLoop = (async () => {
    if (!AUTH_PER_MIN) return
    let n = 0
    while (Date.now() < until) {
      const email = FLEET_EMAIL((n++ % 200) + 1)
      void timed(out, "auth_token", () => fetch(`${SB_URL()}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { apikey: ANON(), "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: process.env.E2E_PASSWORD }),
      }))
      await sleep(60000 / AUTH_PER_MIN)
    }
  })()

  while (Date.now() < until) {
    const t = pick()
    const k = i++ % MIX.length
    void timed(out, KINDS[k], () => MIX[k](t))
    await sleep(1000 / RPS)
  }
  await Promise.all([nextLoop, authLoop])
  console.log(`[http] done (${i} PostgREST calls)`)
  out.log({ ev: "done", calls: i })
  setTimeout(() => process.exit(0), 3000)
})().catch((e) => { console.error("FATAL", e.message || e); process.exit(1) })
