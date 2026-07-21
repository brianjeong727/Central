// Warm the fleet's sessions: password sign-ins, paced to respect the /token per-IP
// rate limit, persisting {access_token, refresh_token, expires_at} per user to the
// gitignored .tokens.json. Re-runs refresh only what's expired/missing.
//
//   node scripts/loadtest/warm-sessions.cjs [--count N] [--pace MS]
//     --count N   only warm the first N fleet users (smoke: 10)
//     --pace MS   delay between token calls (default 1200ms ≈ 50/min — raise the
//                 dashboard rate limit before warming all 200 faster)
const { FLEET_EMAIL, FLEET_SIZE, loadEnv, readTokens, writeTokens, sleep, TOKENS_PATH } = require("./lib.cjs")
const { createClient } = require("@supabase/supabase-js")
const ws = require("ws")

loadEnv()
const args = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = args.indexOf(name)
  return i === -1 ? dflt : Number(args[i + 1])
}
const COUNT = flag("--count", FLEET_SIZE)
const PACE = flag("--pace", 1200)
const PASS = process.env.E2E_PASSWORD

;(async () => {
  let store = {}
  try { store = readTokens() } catch { /* first run */ }

  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  })

  let signedIn = 0, refreshed = 0, kept = 0, failed = 0
  for (let i = 1; i <= COUNT; i++) {
    const email = FLEET_EMAIL(i)
    const entry = store[email]
    const skew = 10 * 60 * 1000 // treat tokens expiring within 10min as expired
    if (entry && entry.expires_at * 1000 - skew > Date.now()) { kept++; continue }

    let res
    if (entry?.refresh_token) {
      res = await auth.auth.refreshSession({ refresh_token: entry.refresh_token })
      if (!res.error) refreshed++
    }
    if (!res || res.error) {
      res = await auth.auth.signInWithPassword({ email, password: PASS })
      if (!res.error) signedIn++
    }
    if (res.error) {
      failed++
      console.error(`${email}: ${res.error.message}${res.error.status === 429 ? " (RATE LIMITED — raise the dashboard /token limit or slow --pace)" : ""}`)
      if (res.error.status === 429) { console.error("aborting warm — fix the rate limit first"); break }
      continue
    }
    const s = res.data.session
    store[email] = { user_id: s.user.id, access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at }
    if ((signedIn + refreshed) % 20 === 0) { writeTokens(store); console.log(`warmed ${signedIn + refreshed} (${i}/${COUNT})…`) }
    await sleep(PACE)
  }

  writeTokens(store)
  console.log(`done: ${signedIn} signed in, ${refreshed} refreshed, ${kept} still fresh, ${failed} failed → ${TOKENS_PATH}`)
  process.exit(failed > 0 ? 1 : 0)
})().catch((e) => { console.error("FATAL", e.message || e); process.exit(1) })
