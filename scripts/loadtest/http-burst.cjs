// HTTP hot-path burst: paced loops of the real home-load calls with random fleet
// JWTs (PostgREST tier), an AUTHENTICATED Next-tier loop against the prod app
// (middleware + full RSC render), a write-path loop (RSVP / reaction / view), and
// an optional auth sign-in burst (campus-NAT shape).
//
//   node scripts/loadtest/http-burst.cjs --rps 5 --duration 300 [--run-id burstA]
//        [--next-rps 1] [--auth-burst 0] [--write-rps 1] [--cookie-sessions 8]
//
// Fixed 2026-08-07 (all three silently poisoned the 160-conn run's HTTP numbers):
//   1. APP was the APEX domain, which 307s to www BEFORE middleware — the Next-tier
//      probes measured a redirect hop, never a page render.
//   2. `messages_p1` interpolated process.env.CENTRAL_GID, which nothing ever set,
//      so it queried `group_id=eq.` (empty) — a malformed filter, not page 1.
//   3. /home was fetched UNAUTHENTICATED, so it measured the login redirect rather
//      than the real logged-in shell. Now driven by forged SSR session cookies.
const { MINISTRY_ID, loadEnv, freshTokens, ndjsonLogger, sleep, FLEET_EMAIL, ensureThreadpool } = require("./lib.cjs")
const { warmCookieSessions } = require("./session-cookies.cjs")

ensureThreadpool()
loadEnv()
const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : Number(args[i + 1] ?? dflt) }
const sflag = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1] }
const RPS = flag("--rps", 5)
const DURATION = flag("--duration", 300)
const NEXT_RPS = flag("--next-rps", 1)
const AUTH_PER_MIN = flag("--auth-burst", 0)
const WRITE_RPS = flag("--write-rps", 1)
const COOKIE_SESSIONS = flag("--cookie-sessions", 8)
const RUN_ID = String(sflag("--run-id", `http${Date.now()}`))
const SB_URL = () => process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
// MUST be the www host: the apex 307s before middleware runs.
const APP = "https://www.joincentral.app"
const CENTRAL_GID = "2c67fabd-b2de-4f00-8698-ec55e4c5bef1"

// Bounded in-flight guard. The loops used to fire-and-forget (`void timed(...)`),
// so one slow response head-of-line-blocked everything behind it and the QUEUE TIME
// landed inside the measured ms — reading as server latency. Measured 2026-08-07:
// get_chat_list was p50 103ms / p95 196ms strictly sequential, but p50 283ms /
// p95 8525ms unbounded, at only 2rps ON A MAC. That artifact is what made the
// 160-conn run's HTTP numbers untrustworthy.
//
// So: cap concurrency and SKIP rather than queue. Skipping keeps every recorded
// latency a real network measurement, and the skip count separately tells us the
// client couldn't keep up — the two failure modes stay distinguishable.
function limiter(max, name) {
  let inflight = 0
  let skipped = 0
  return {
    name,
    run(fn) {
      if (inflight >= max) { skipped++; return null }
      inflight++
      return fn().finally(() => { inflight-- })
    },
    get skipped() { return skipped },
  }
}

async function timed(out, kind, fn) {
  const t0 = Date.now()
  try {
    const res = await fn()
    // redirect:"manual" surfaces a 3xx as status 0 (opaqueredirect) or the real 3xx —
    // both are healthy for the Next-tier probes (/login → /home for a signed-in user).
    // Treat <400 (and opaque 0) as ok; only 4xx/5xx are failures.
    const ok = res.status === 0 || (res.status >= 200 && res.status < 400)
    out.log({ ev: "http", kind, ms: Date.now() - t0, status: res.status, ok })
    if (res.status === 429 || res.status === 503) console.error(`[http] ${kind} → ${res.status} (tripwire!)`)
    return res
  } catch (e) {
    out.log({ ev: "http", kind, ms: Date.now() - t0, ok: false, err: String(e.message).slice(0, 120) })
    return null
  }
}

;(async () => {
  const fleet = Object.entries(freshTokens()).filter(([e]) => e.startsWith("fleet"))
  if (!fleet.length) throw new Error("no UNEXPIRED fleet tokens — run warm-sessions.cjs")
  console.log(`[http] ${fleet.length} unexpired fleet tokens`)
  const out = ndjsonLogger(`${RUN_ID}-http.ndjson`)
  const pick = () => fleet[Math.floor(Math.random() * fleet.length)][1]

  const H = (t) => ({ apikey: ANON(), Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json" })

  // ── fixtures: resolve real target rows once, so every probe hits a live row ──
  const bootstrap = pick()
  const getJson = async (path) => {
    const r = await fetch(`${SB_URL()}/rest/v1/${path}`, { headers: H(bootstrap) })
    return r.ok ? r.json() : []
  }
  const anns = await getJson(`announcements?ministry_id=eq.${MINISTRY_ID}&status=eq.published&select=id&limit=40`)
  const msgs = await getJson(`messages?group_id=eq.${CENTRAL_GID}&select=id&order=created_at.desc&limit=40`)
  const ANN_IDS = anns.map((a) => a.id)
  const MSG_IDS = msgs.map((m) => m.id)
  console.log(`[http] fixtures: ${ANN_IDS.length} announcements, ${MSG_IDS.length} messages`)
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)]

  // ── authenticated browser sessions for the Next tier ──
  let COOKIES = []
  if (NEXT_RPS && COOKIE_SESSIONS) {
    const emails = Array.from({ length: COOKIE_SESSIONS }, (_, i) => FLEET_EMAIL(i + 1))
    COOKIES = await warmCookieSessions(emails, process.env.E2E_PASSWORD, 350)
    console.log(`[http] ${COOKIES.length} authenticated cookie sessions ready`)
  }

  // ── READ mix: the calls a home load actually makes ──
  const MIX = [
    (t) => fetch(`${SB_URL()}/rest/v1/rpc/get_chat_list`, { method: "POST", headers: H(t), body: JSON.stringify({ p_user_id: t.user_id, p_ministry_id: MINISTRY_ID }) }),
    (t) => fetch(`${SB_URL()}/rest/v1/rpc/get_chat_previews`, { method: "POST", headers: H(t), body: JSON.stringify({ p_user_id: t.user_id, p_ministry_id: MINISTRY_ID }) }),
    (t) => fetch(`${SB_URL()}/rest/v1/announcements?ministry_id=eq.${MINISTRY_ID}&status=eq.published&order=created_at.desc&limit=30&select=id,title,body,is_pinned,is_event,created_at`, { headers: H(t) }),
    (t) => fetch(`${SB_URL()}/rest/v1/messages?select=id,group_id,sender_id,content,created_at&order=created_at.desc&limit=50&group_id=eq.${CENTRAL_GID}`, { headers: H(t) }),
    // Directory: 402 profiles in this tenant — the widest member-facing select.
    (t) => fetch(`${SB_URL()}/rest/v1/profiles?ministry_id=eq.${MINISTRY_ID}&select=id,name,role,avatar_url,grade,graduation_year&order=name.asc&limit=100`, { headers: H(t) }),
    // Announcement detail + its RSVP/view counts — the announcement tap path.
    (t) => fetch(`${SB_URL()}/rest/v1/rsvps?announcement_id=eq.${rand(ANN_IDS)}&select=user_id`, { headers: H(t) }),
    (t) => fetch(`${SB_URL()}/rest/v1/message_reactions?group_id=eq.${CENTRAL_GID}&select=message_id,emoji,user_id&limit=200`, { headers: H(t) }),
    (t) => fetch(`${SB_URL()}/rest/v1/group_members?group_id=eq.${CENTRAL_GID}&select=user_id,last_read_at&limit=250`, { headers: H(t) }),
  ]
  const KINDS = ["get_chat_list", "get_chat_previews", "announcements_p1", "messages_p1",
                 "directory_p1", "rsvps_for_ann", "reactions_p1", "roster"]

  const until = Date.now() + DURATION * 1000
  let i = 0

  // Per-tier caps, so a slow tier can't starve the others. Sized well above the
  // expected in-flight count (5rps x ~0.3s ≈ 1.5), so a skip means real trouble.
  const LIM = {
    read: limiter(10, "read"),
    write: limiter(6, "write"),
    next: limiter(4, "next"),
    auth: limiter(4, "auth"),
  }

  // ── Next tier: a REAL authenticated /home render (middleware cache-MISS path:
  //    getUser() + the joined profiles×ministries query + full RSC render). ──
  const nextLoop = (async () => {
    if (!NEXT_RPS) return
    let n = 0
    while (Date.now() < until) {
      if (COOKIES.length) {
        const s = COOKIES[n++ % COOKIES.length]
        LIM.next.run(() => timed(out, "next_home_auth", () => fetch(`${APP}/home`, {
          headers: { cookie: s.header, "user-agent": "central-loadtest/1.0" }, redirect: "manual",
        })))
      }
      LIM.next.run(() => timed(out, "next_login", () => fetch(`${APP}/login`, { redirect: "manual" })))
      await sleep(1000 / NEXT_RPS)
    }
  })()

  // ── WRITE tier: the toggles real users fire during a service. Each is
  //    self-cleaning (RSVP and reaction are toggles), so fixtures stay intact.
  //    Reaction writes ALSO drive the second realtime fan-out: the DB trigger
  //    broadcasts message_reactions INSERT/DELETE on the same chat:{gid} topic,
  //    so all 200 fleet listeners receive them (see app/home/chat-broadcast.ts).
  const writeLoop = (async () => {
    if (!WRITE_RPS) return
    let n = 0
    while (Date.now() < until) {
      const t = pick()
      const which = n++ % 3
      // Each toggle takes ONE limiter slot for its insert+delete pair, so the
      // delete is never skipped independently — a skipped delete would leave a
      // stray RSVP/reaction behind and drift the fixtures.
      if (which === 0 && ANN_IDS.length) {
        const annId = rand(ANN_IDS)
        LIM.write.run(async () => {
          const r = await timed(out, "w_rsvp_insert", () => fetch(`${SB_URL()}/rest/v1/rsvps`, {
            method: "POST", headers: { ...H(t), Prefer: "return=minimal,resolution=ignore-duplicates" },
            body: JSON.stringify({ announcement_id: annId, user_id: t.user_id }),
          }))
          if (r) await timed(out, "w_rsvp_delete", () => fetch(
            `${SB_URL()}/rest/v1/rsvps?announcement_id=eq.${annId}&user_id=eq.${t.user_id}`,
            { method: "DELETE", headers: H(t) }))
        })
      } else if (which === 1 && MSG_IDS.length) {
        const msgId = rand(MSG_IDS)
        const emoji = ["🙏", "🔥", "❤️", "😂"][n % 4]
        LIM.write.run(async () => {
          const r = await timed(out, "w_reaction_insert", () => fetch(`${SB_URL()}/rest/v1/message_reactions`, {
            method: "POST", headers: { ...H(t), Prefer: "return=minimal,resolution=ignore-duplicates" },
            body: JSON.stringify({ message_id: msgId, user_id: t.user_id, emoji, group_id: CENTRAL_GID }),
          }))
          if (r) await timed(out, "w_reaction_delete", () => fetch(
            `${SB_URL()}/rest/v1/message_reactions?message_id=eq.${msgId}&user_id=eq.${t.user_id}&emoji=eq.${encodeURIComponent(emoji)}`,
            { method: "DELETE", headers: H(t) }))
        })
      } else if (ANN_IDS.length) {
        // on_conflict is REQUIRED for resolution=ignore-duplicates to apply to a
        // non-PK unique constraint; without it PostgREST 409s on every repeat view.
        LIM.write.run(() => timed(out, "w_ann_view", () => fetch(`${SB_URL()}/rest/v1/announcement_views?on_conflict=announcement_id,user_id`, {
          method: "POST", headers: { ...H(t), Prefer: "return=minimal,resolution=ignore-duplicates" },
          body: JSON.stringify({ announcement_id: rand(ANN_IDS), user_id: t.user_id }),
        })))
      }
      await sleep(1000 / WRITE_RPS)
    }
  })()

  // Auth burst: PASSWORD grants from this one IP at the campus-NAT rate.
  const authLoop = (async () => {
    if (!AUTH_PER_MIN) return
    let n = 0
    while (Date.now() < until) {
      const email = FLEET_EMAIL((n++ % 200) + 1)
      LIM.auth.run(() => timed(out, "auth_token", () => fetch(`${SB_URL()}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { apikey: ANON(), "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: process.env.E2E_PASSWORD }),
      })))
      await sleep(60000 / AUTH_PER_MIN)
    }
  })()

  while (Date.now() < until) {
    const t = pick()
    const k = i++ % MIX.length
    LIM.read.run(() => timed(out, KINDS[k], () => MIX[k](t)))
    await sleep(1000 / RPS)
  }
  await Promise.all([nextLoop, authLoop, writeLoop])
  const skips = Object.fromEntries(Object.values(LIM).map((l) => [l.name, l.skipped]))
  const totalSkips = Object.values(skips).reduce((a, b) => a + b, 0)
  console.log(`[http] done (${i} PostgREST reads), client skips: ${JSON.stringify(skips)}`)
  if (totalSkips) console.error(`[http] WARNING: ${totalSkips} calls skipped — the CLIENT saturated, not the server. Latencies remain valid; offered load was below target.`)
  out.log({ ev: "done", calls: i, skips })
  setTimeout(() => process.exit(0), 3000)
})().catch((e) => { console.error("FATAL", e.message || e); process.exit(1) })
