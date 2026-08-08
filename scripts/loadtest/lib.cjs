// Shared plumbing for the load-test harness (CommonJS on purpose — runs in Node,
// outside the Next bundler). Everything is hard-scoped to the Load Test tenant.
const fs = require("node:fs")
const path = require("node:path")
const { createClient } = require("@supabase/supabase-js")
const ws = require("ws")

const ROOT = path.resolve(__dirname, "..", "..")
const TOKENS_PATH = path.join(__dirname, ".tokens.json")
const LOGS_DIR = path.join(__dirname, "logs")

const MINISTRY_ID = "f00d1e57-0000-4000-8000-000000000001" // "Load Test 200"
const FLEET_EMAIL = (i) => `fleet${String(i).padStart(3, "0")}@loadtest.test`
const FLEET_SIZE = 200

function loadEnv() {
  const p = path.join(ROOT, ".env.local")
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!(k in process.env)) process.env[k] = v
  }
}

function serviceClient() {
  loadEnv()
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  })
}

// A fleet client: no session machinery — the coordinator owns token lifecycle.
// PostgREST auth rides a global Authorization header; realtime auth is pushed
// explicitly via client.realtime.setAuth(token) before private subscribes.
function userClient(accessToken) {
  loadEnv()
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    realtime: { transport: ws },
  })
}

function readTokens() {
  if (!fs.existsSync(TOKENS_PATH)) throw new Error(`token store missing: ${TOKENS_PATH} — run warm-sessions.cjs first`)
  return JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"))
}
function writeTokens(tokens) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 1))
}

// Only tokens still valid `skew` seconds from now. The store is APPEND-ONLY across
// runs, so a partial warm leaves stale entries behind — picking one at random then
// yields PGRST303 "JWT expired" and silently zeroes out whatever it was feeding
// (this ate the fixture bootstrap on 2026-08-07). Consumers must filter, not trust.
function freshTokens(skew = 60) {
  const now = Math.floor(Date.now() / 1000)
  return Object.fromEntries(
    Object.entries(readTokens()).filter(([, v]) => v && v.expires_at && v.expires_at > now + skew)
  )
}

function ndjsonLogger(name) {
  fs.mkdirSync(LOGS_DIR, { recursive: true })
  const file = path.join(LOGS_DIR, name)
  const stream = fs.createWriteStream(file, { flags: "a" })
  return {
    file,
    log(rec) {
      stream.write(JSON.stringify({ t: Date.now(), ...rec }) + "\n")
    },
    close() {
      stream.end()
    },
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// libuv's threadpool defaults to FOUR threads, and DNS resolution (dns.lookup,
// which fetch uses) runs on it. Under concurrency those lookups queue, and the
// wait lands INSIDE the measured request time — so the probe reports multi-second
// server latency when the server answered in 50ms.
//
// Measured 2026-08-07, same 6rps run, only this variable changed:
//   get_chat_list  p95 5215ms -> 301ms      directory_p1   p95 5773ms -> 706ms
//   next_home_auth p95 8922ms -> 1083ms     client skips   150 -> 0
// A strictly SEQUENTIAL probe was clean throughout (353 reqs, p95 122ms, zero
// stalls >1s), which is what isolated this to the client rather than the server.
//
// libuv reads the variable at process start, BEFORE any JS runs, so setting it on
// process.env here would be too late — we must re-exec. Every fetch-heavy entry
// point calls this first so the fix cannot be forgotten on the command line.
function ensureThreadpool(size = 64) {
  if (process.env.UV_THREADPOOL_SIZE) return
  const { spawnSync } = require("node:child_process")
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env, UV_THREADPOOL_SIZE: String(size) },
  })
  process.exit(r.status ?? 0)
}

// Percentile over a plain number array (nearest-rank).
function pct(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]
}

module.exports = {
  MINISTRY_ID, FLEET_EMAIL, FLEET_SIZE, TOKENS_PATH, LOGS_DIR,
  loadEnv, serviceClient, userClient, readTokens, writeTokens, freshTokens, ndjsonLogger, sleep, pct,
  ensureThreadpool,
}
