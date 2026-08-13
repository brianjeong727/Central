// Warm the fleet's sessions: password sign-ins, paced to respect the /token per-IP
// rate limit, persisting {access_token, refresh_token, expires_at} per user to the
// gitignored .tokens.json. Re-runs refresh only what's expired/missing.
//
//   node scripts/loadtest/warm-sessions.cjs [--count N] [--pace MS] [--signin-only]
//     --count N       only warm the first N fleet users (smoke: 10)
//     --pace MS       delay between token calls (default 1200ms ≈ 50/min)
//     --signin-only   never refresh; always password sign-in
//
// PACE MUST RESPECT THE CONFIGURED PER-IP LIMITS — this is what actually blocked the
// 2026-08-12 warm, misdiagnosed twice as "the dashboard limit isn't raised":
//   sign-ups and sign-ins : 600 / 5min  = 2.0 req/s  -> pace >= 500ms
//   token refreshes       : 150 / 5min  = 0.5 req/s  -> pace >= 2000ms
// `--pace 350` is ~2.9 req/s = 857/5min, which exceeds the sign-in ceiling and blew
// the (much lower) refresh ceiling by 8x. Measured clean: 60 sign-ins at 1/s, no 429.
//
// SIGN-IN IS THE CHEAP PATH: it allows 4x the rate of refresh, so for a full 200-user
// warm prefer --signin-only. Refresh is only worth it when well under 150/5min.
const { FLEET_EMAIL, FLEET_SIZE, loadEnv, readTokens, writeTokens, sleep, TOKENS_PATH, ensureThreadpool } = require("./lib.cjs")
ensureThreadpool()
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
const SIGNIN_ONLY = args.includes("--signin-only")
// Re-mint any token with less than N minutes left. Default 10 preserves the old
// behavior; pass a run-length-aware value before a long burst (a token with 15min
// left survives the default check but expires mid-run, and the in-run refresher then
// races expiry across 200 clients at a rate the refresh ceiling won't allow).
// Idempotent by design: repeated passes only top up what is actually short-dated,
// which matters because the effective per-IP ceiling forces multi-pass warming.
const MIN_REMAINING = flag("--min-remaining", 10)
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
    const skew = MIN_REMAINING * 60 * 1000
    if (entry && entry.expires_at * 1000 - skew > Date.now()) { kept++; continue }

    let res
    if (entry?.refresh_token && !SIGNIN_ONLY) {
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
