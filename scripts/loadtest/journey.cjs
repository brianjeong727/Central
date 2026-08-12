// FEATURE load: N virtual users each running a realistic SESSION, not a flat mix of
// endpoints at a fixed rate. This is the difference between "requests per second" and
// "200 people using the app" — a real session is a journey with think-time, and the
// query mix, cache behavior, and burstiness all differ from a uniform generator.
//
//   node scripts/loadtest/journey.cjs --users 200 --duration 600 [--run-id j1]
//        [--think 4000] [--max-inflight 40]
//
// Each virtual user loops:  open app (home bundle) -> read announcements -> sometimes
// RSVP -> open a chat + page messages -> sometimes react -> browse directory ->
// sometimes open the Plan tab (teams/plans/tasks) -> sometimes open a form -> idle.
// Weights approximate a service-night: most people read, a few write.
//
// Every step is measured SEPARATELY by name so a slow feature is identifiable rather
// than averaged away. Concurrency is bounded and over-limit steps are recorded as
// client backpressure (never as server latency) — see lib.cjs for why that matters.
const {
  MINISTRY_ID, loadEnv, freshTokens, ndjsonLogger, sleep, pct, ensureThreadpool, safeFetch,
} = require("./lib.cjs")

ensureThreadpool()
loadEnv()

const args = process.argv.slice(2)
const num = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : Number(args[i + 1]) }
const str = (n, d) => { const i = args.indexOf(n); return i === -1 ? d : args[i + 1] }
const USERS = num("--users", 200)
const DURATION = num("--duration", 600)
const THINK = num("--think", 4000)          // mean think-time between steps
const MAX_INFLIGHT = num("--max-inflight", 40)
const RUN_ID = String(str("--run-id", `journey${Date.now()}`))

const SB = () => process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const CENTRAL_GID = "2c67fabd-b2de-4f00-8698-ec55e4c5bef1"

const out = ndjsonLogger(`${RUN_ID}-journey.ndjson`)
let inflight = 0
let skipped = 0
const jitter = (ms) => Math.round(ms * (0.5 + Math.random()))

async function step(name, fn) {
  if (inflight >= MAX_INFLIGHT) {
    skipped++
    out.log({ ev: "skip", step: name })
    return null
  }
  inflight++
  const t0 = Date.now()
  try {
    const res = await fn()
    const ok = !!res && res.status >= 200 && res.status < 400
    out.log({ ev: "step", step: name, ms: Date.now() - t0, status: res ? res.status : 0, ok })
    if (res && (res.status === 429 || res.status === 503)) console.error(`[journey] ${name} -> ${res.status}`)
    return res
  } catch (e) {
    out.log({ ev: "step", step: name, ms: Date.now() - t0, ok: false, err: String(e.message).slice(0, 100) })
    return null
  } finally {
    inflight--
  }
}

;(async () => {
  const tokens = Object.entries(freshTokens()).filter(([e]) => e.startsWith("fleet"))
  if (tokens.length < 10) throw new Error(`need warmed tokens, have ${tokens.length}`)
  console.log(`[journey] ${tokens.length} unexpired tokens, simulating ${USERS} users for ${DURATION}s`)

  const H = (t) => ({ apikey: ANON(), Authorization: `Bearer ${t.access_token}`, "Content-Type": "application/json" })
  const get = (t, path) => safeFetch(`${SB()}/rest/v1/${path}`, { headers: H(t) }, 20000)
  const post = (t, path, body, prefer) => safeFetch(`${SB()}/rest/v1/${path}`, {
    method: "POST", headers: { ...H(t), Prefer: prefer || "return=minimal" }, body: JSON.stringify(body),
  }, 20000)
  const del = (t, path) => safeFetch(`${SB()}/rest/v1/${path}`, { method: "DELETE", headers: H(t) }, 20000)

  // Resolve real targets once so every step hits live rows.
  const boot = tokens[0][1]
  const j = async (p) => { const r = await get(boot, p); return r && r.ok ? r.json().catch(() => []) : [] }
  const [anns, msgs, teams, plans, forms, sgs] = await Promise.all([
    j(`announcements?ministry_id=eq.${MINISTRY_ID}&status=eq.published&select=id&limit=40`),
    j(`messages?group_id=eq.${CENTRAL_GID}&select=id&order=created_at.desc&limit=40`),
    j(`teams?ministry_id=eq.${MINISTRY_ID}&select=id&limit=10`),
    j(`event_plans?ministry_id=eq.${MINISTRY_ID}&select=id&limit=20`),
    j(`announcement_forms?ministry_id=eq.${MINISTRY_ID}&select=id&limit=10`),
    j(`small_groups?ministry_id=eq.${MINISTRY_ID}&select=id&limit=15`),
  ])
  const pick = (a) => a[Math.floor(Math.random() * a.length)]
  console.log(`[journey] fixtures — announcements:${anns.length} messages:${msgs.length} teams:${teams.length} plans:${plans.length} forms:${forms.length} smallGroups:${sgs.length}`)
  if (!teams.length || !plans.length || !forms.length) console.error("[journey] WARNING: some features have no fixtures; those steps are skipped")

  const until = Date.now() + DURATION * 1000

  // ── one virtual user's session loop ──
  async function session(userIdx) {
    const t = tokens[userIdx % tokens.length][1]
    // Stagger arrivals across the first 60s so 200 users don't open the app in lockstep.
    await sleep(Math.random() * Math.min(60000, DURATION * 300))
    while (Date.now() < until) {
      // 1. Open the app — the home bundle every client fetches on boot.
      await step("home:chat_list", () => post(t, "rpc/get_chat_list", { p_user_id: t.user_id, p_ministry_id: MINISTRY_ID }, "return=representation"))
      await step("home:chat_previews", () => post(t, "rpc/get_chat_previews", { p_user_id: t.user_id, p_ministry_id: MINISTRY_ID }, "return=representation"))
      await step("home:announcements", () => get(t, `announcements?ministry_id=eq.${MINISTRY_ID}&status=eq.published&order=created_at.desc&limit=30&select=id,title,body,is_pinned,is_event,created_at`))
      await step("home:events", () => get(t, `calendar_events?ministry_id=eq.${MINISTRY_ID}&select=id,title,start_date,end_date,all_day,category&order=start_date.desc&limit=20`))
      await sleep(jitter(THINK))

      // 2. Read an announcement; sometimes RSVP (toggle, self-cleaning).
      if (anns.length) {
        const a = pick(anns)
        await step("ann:detail_rsvps", () => get(t, `rsvps?announcement_id=eq.${a.id}&select=user_id`))
        await step("ann:view", () => post(t, `announcement_views?on_conflict=announcement_id,user_id`, { announcement_id: a.id, user_id: t.user_id }, "return=minimal,resolution=ignore-duplicates"))
        if (Math.random() < 0.25) {
          await step("ann:rsvp_insert", () => post(t, `rsvps?on_conflict=announcement_id,user_id`, { announcement_id: a.id, user_id: t.user_id }, "return=minimal,resolution=ignore-duplicates"))
          await step("ann:rsvp_delete", () => del(t, `rsvps?announcement_id=eq.${a.id}&user_id=eq.${t.user_id}`))
        }
        await sleep(jitter(THINK))
      }

      // 3. Open the big chat and page messages; sometimes react.
      await step("chat:messages_p1", () => get(t, `messages?select=id,group_id,sender_id,content,created_at,reply_to_id&order=created_at.desc&limit=50&group_id=eq.${CENTRAL_GID}`))
      await step("chat:reactions", () => get(t, `message_reactions?group_id=eq.${CENTRAL_GID}&select=message_id,emoji,user_id&limit=200`))
      await step("chat:roster", () => get(t, `group_members?group_id=eq.${CENTRAL_GID}&select=user_id,last_read_at&limit=250`))
      if (msgs.length && Math.random() < 0.2) {
        const m = pick(msgs)
        const emoji = ["🙏", "🔥", "❤️"][Math.floor(Math.random() * 3)]
        await step("chat:react_insert", () => post(t, "message_reactions?on_conflict=message_id,user_id,emoji", { message_id: m.id, user_id: t.user_id, emoji, group_id: CENTRAL_GID }, "return=minimal,resolution=ignore-duplicates"))
        await step("chat:react_delete", () => del(t, `message_reactions?message_id=eq.${m.id}&user_id=eq.${t.user_id}&emoji=eq.${encodeURIComponent(emoji)}`))
      }
      await step("chat:mark_read", () => safeFetch(`${SB()}/rest/v1/group_members?group_id=eq.${CENTRAL_GID}&user_id=eq.${t.user_id}`, {
        method: "PATCH", headers: { ...H(t), Prefer: "return=minimal" }, body: JSON.stringify({ last_read_at: new Date().toISOString() }),
      }, 20000))
      await sleep(jitter(THINK))

      // 4. Directory (the widest member-facing select).
      if (Math.random() < 0.5) {
        await step("directory:list", () => get(t, `profiles?ministry_id=eq.${MINISTRY_ID}&select=id,name,role,avatar_url,grade,graduation_year&order=name.asc&limit=100`))
        await sleep(jitter(THINK))
      }

      // 5. Plan tab — teams, plans, tasks, roles (the heaviest read surface).
      if (teams.length && Math.random() < 0.35) {
        await step("plan:teams", () => get(t, `teams?ministry_id=eq.${MINISTRY_ID}&select=id,name,icon,team_type,description`))
        await step("plan:my_memberships", () => get(t, `team_members?user_id=eq.${t.user_id}&select=team_id,role_id`))
        if (plans.length) {
          const p = pick(plans)
          await step("plan:tasks", () => get(t, `event_tasks?event_plan_id=eq.${p.id}&select=id,title,assigned_to,due_date,completed,phase,priority&order=sort_order.asc`))
          await step("plan:roles", () => get(t, `event_roles?event_plan_id=eq.${p.id}&select=id,role_name,assigned_to`))
        }
        await sleep(jitter(THINK))
      }

      // 6. Small groups.
      if (sgs.length && Math.random() < 0.2) {
        await step("smallgroups:list", () => get(t, `small_groups?ministry_id=eq.${MINISTRY_ID}&select=id,name,type,leader_id`))
        await step("smallgroups:members", () => get(t, `small_group_members?group_id=eq.${pick(sgs).id}&select=user_id,meal_taken`))
        await sleep(jitter(THINK))
      }

      // 7. Forms — open one and read its fields (the fill path's read half).
      if (forms.length && Math.random() < 0.2) {
        const f = pick(forms)
        await step("forms:fields", () => get(t, `form_fields?form_id=eq.${f.id}&select=id,label,type,options,required,order_index&order=order_index.asc`))
        await step("forms:my_response", () => get(t, `form_responses?form_id=eq.${f.id}&user_id=eq.${t.user_id}&select=id`))
        await sleep(jitter(THINK))
      }

      // Idle between sessions — people put the phone down.
      await sleep(jitter(THINK * 3))
    }
  }

  await Promise.all(Array.from({ length: USERS }, (_, i) => session(i)))

  // ── report, per step, so a slow feature is named rather than averaged away ──
  const rows = require("node:fs").readFileSync(out.file, "utf8").trim().split("\n").map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const steps = rows.filter((r) => r.ev === "step")
  const names = [...new Set(steps.map((s) => s.step))].sort()
  console.log(`\n═══ Journey — ${USERS} virtual users, ${DURATION}s ═══`)
  console.log(`${"step".padEnd(24)} ${"n".padStart(6)} ${"p50".padStart(7)} ${"p95".padStart(8)} ${"p99".padStart(8)} ${"err".padStart(5)}`)
  for (const n of names) {
    const s = steps.filter((x) => x.step === n)
    const ms = s.filter((x) => x.ok).map((x) => x.ms)
    const errs = s.filter((x) => !x.ok).length
    const flag = (pct(ms, 95) ?? 0) > 1500 || errs > 0 ? " ⚠" : ""
    console.log(`${n.padEnd(24)} ${String(s.length).padStart(6)} ${String(pct(ms, 50) ?? "-").padStart(7)} ${String(pct(ms, 95) ?? "-").padStart(8)} ${String(pct(ms, 99) ?? "-").padStart(8)} ${String(errs).padStart(5)}${flag}`)
  }
  const allErr = steps.filter((s) => !s.ok).length
  console.log(`\ntotal steps ${steps.length}, errors ${allErr} (${(100 * allErr / Math.max(1, steps.length)).toFixed(2)}%), client-skipped ${skipped}`)
  if (skipped) console.error(`NOTE: ${skipped} steps skipped by the client concurrency cap — offered load exceeded what this box could issue; latencies remain valid.`)
  out.log({ ev: "done", steps: steps.length, errors: allErr, skipped })
  setTimeout(() => process.exit(0), 2000)
})().catch((e) => { console.error("FATAL", e.message || e); process.exit(1) })
