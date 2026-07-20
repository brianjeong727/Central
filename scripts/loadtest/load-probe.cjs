// Load probe — reproduce the CCSF board-meeting freeze against prod.
// Phase 0: one baseline session. Phase 1: N concurrent sessions, staggered ~1s,
// full page loads across hot tabs. Phase 2: all sessions hold on the chats tab
// while the service role fires messages into a shared probe group; page
// responsiveness is sampled the whole time.
//
// Run from the s1 worktree root:  node scratchpad/load-probe.cjs
// Env: reads .env.local (E2E_* + SUPABASE keys). BASE overridable via LOAD_BASE.

const fs = require("node:fs")
const path = require("node:path")
const { chromium } = require("@playwright/test")
const { createClient } = require("@supabase/supabase-js")
const ws = require("ws")

// ── env ──────────────────────────────────────────────────────────────────────
for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  const t = line.trim()
  if (!t || t.startsWith("#")) continue
  const eq = t.indexOf("=")
  if (eq === -1) continue
  const k = t.slice(0, eq).trim()
  let v = t.slice(eq + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!(k in process.env)) process.env[k] = v
}

const BASE = process.env.LOAD_BASE || "https://joincentral.app"
const N = Number(process.env.LOAD_N || 6)
const MSG_COUNT = Number(process.env.LOAD_MSGS || 12)
const ADMIN = process.env.E2E_ADMIN_EMAIL
const MEMBER = process.env.E2E_MEMBER_EMAIL
const PASS = process.env.E2E_PASSWORD
const MINISTRY = process.env.E2E_MINISTRY_ID
const PREFIX = "E2E::"
if (!ADMIN || !MEMBER || !PASS || !MINISTRY) { console.error("missing E2E_* env"); process.exit(1) }

const OUT = path.join(process.cwd(), "scratchpad", "load-probe-results.jsonl")
fs.writeFileSync(OUT, "")
const log = (rec) => {
  const line = JSON.stringify({ t: new Date().toISOString(), ...rec })
  fs.appendFileSync(OUT, line + "\n")
  console.log(line)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

// ── one session's journey ────────────────────────────────────────────────────
const SHELL_MARKER = "text=Messages" // desktop sidebar label all roles see → shell rendered

async function step(sessionId, page, name, fn, timeoutMs = 45000) {
  const t0 = Date.now()
  try {
    await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("PROBE_TIMEOUT")), timeoutMs)),
    ])
    const ms = Date.now() - t0
    log({ session: sessionId, step: name, ms, ok: true })
    return ms
  } catch (e) {
    const ms = Date.now() - t0
    log({ session: sessionId, step: name, ms, ok: false, error: String(e.message || e).slice(0, 200) })
    return null
  }
}

async function journey(browser, sessionId, email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  page.setDefaultTimeout(45000)

  await step(sessionId, page, "login", async () => {
    await page.goto(`${BASE}/login`, { waitUntil: "load" })
    await page.getByPlaceholder("you@university.edu").fill(email)
    await page.getByPlaceholder("••••••••").fill(PASS)
    await page.getByRole("button", { name: "Sign in" }).click()
    await page.waitForURL(/\/home/, { timeout: 45000 })
  })
  await step(sessionId, page, "home_ready", async () => {
    await page.waitForSelector(SHELL_MARKER, { timeout: 45000 })
  })
  for (const tab of ["announcements", "chats", "directory"]) {
    await step(sessionId, page, `tab_${tab}`, async () => {
      await page.goto(`${BASE}/home?tab=${tab}`, { waitUntil: "load" })
      await page.waitForSelector(SHELL_MARKER, { timeout: 45000 })
    })
  }
  // park on chats for the fan-out phase
  await step(sessionId, page, "park_chats", async () => {
    await page.goto(`${BASE}/home?tab=chats`, { waitUntil: "load" })
    await page.waitForSelector(SHELL_MARKER, { timeout: 45000 })
  })
  return { ctx, page }
}

// responsiveness: JS roundtrip on the page's main thread
async function pulse(sessionId, page, label) {
  const t0 = Date.now()
  try {
    await Promise.race([
      page.evaluate(() => 1 + 1),
      new Promise((_, rej) => setTimeout(() => rej(new Error("EVAL_TIMEOUT")), 5000)),
    ])
    log({ session: sessionId, step: `pulse_${label}`, ms: Date.now() - t0, ok: true })
  } catch {
    log({ session: sessionId, step: `pulse_${label}`, ms: Date.now() - t0, ok: false, error: "page unresponsive >5s" })
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
;(async () => {
  log({ phase: "start", base: BASE, n: N, ministry: MINISTRY })

  // resolve fixture user ids + make the probe group
  const { data: users, error: uerr } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (uerr) throw uerr
  const adminU = users.users.find((u) => u.email === ADMIN)
  const memberU = users.users.find((u) => u.email === MEMBER)
  if (!adminU || !memberU) throw new Error("fixture users not found")

  const { data: group, error: gerr } = await db
    .from("groups")
    .insert({ ministry_id: MINISTRY, name: `${PREFIX}Load Probe 2026-07-20`, type: "my", created_by: adminU.id })
    .select()
    .single()
  if (gerr) throw gerr
  await db.from("group_members").insert([
    { group_id: group.id, user_id: adminU.id },
    { group_id: group.id, user_id: memberU.id },
  ])
  log({ phase: "probe_group_created", group_id: group.id })

  const browser = await chromium.launch()

  // Phase 0 — baseline, alone
  log({ phase: "baseline_start" })
  const base = await journey(browser, "baseline", ADMIN)
  await base.ctx.close()
  log({ phase: "baseline_done" })

  // Phase 1 — N concurrent, staggered 1s (meeting-start shape)
  log({ phase: "concurrent_start" })
  const emails = Array.from({ length: N }, (_, i) => (i % 2 === 0 ? ADMIN : MEMBER))
  const sessions = await Promise.all(
    emails.map(
      (email, i) =>
        new Promise((res) => setTimeout(() => res(journey(browser, `s${i + 1}`, email)), i * 1000)),
    ),
  )
  log({ phase: "concurrent_done" })

  // Phase 2 — message fan-out while all sessions sit live
  log({ phase: "fanout_start", messages: MSG_COUNT })
  for (let m = 0; m < MSG_COUNT; m++) {
    const sender = m % 2 === 0 ? adminU.id : memberU.id
    const t0 = Date.now()
    const { error } = await db.from("messages").insert({
      group_id: group.id,
      sender_id: sender,
      content: `${PREFIX}probe message ${m + 1}/${MSG_COUNT}`,
      message_type: "text",
    })
    log({ step: "msg_insert", i: m + 1, ms: Date.now() - t0, ok: !error, error: error ? String(error.message).slice(0, 120) : undefined })
    // pulse every page between messages
    await Promise.all(sessions.map((s, i) => pulse(`s${i + 1}`, s.page, `m${m + 1}`)))
    await new Promise((r) => setTimeout(r, 1500))
  }
  log({ phase: "fanout_done" })

  // final nav per session — is the app still usable after the burst?
  await Promise.all(
    sessions.map((s, i) =>
      step(`s${i + 1}`, s.page, "final_nav_home", async () => {
        await s.page.goto(`${BASE}/home`, { waitUntil: "load" })
        await s.page.waitForSelector(SHELL_MARKER, { timeout: 45000 })
      }),
    ),
  )

  await browser.close()
  log({ phase: "done" })
  process.exit(0)
})().catch((e) => {
  log({ phase: "fatal", error: String(e.message || e) })
  process.exit(1)
})
