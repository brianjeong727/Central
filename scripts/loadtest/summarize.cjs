// Post-run analyzer: joins the fleet workers' NDJSON with the sender log and
// prints the pass/fail table from the plan's thresholds.
//
//   node scripts/loadtest/summarize.cjs --run-id burstA
const fs = require("node:fs")
const path = require("node:path")
const { LOGS_DIR, pct } = require("./lib.cjs")

const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1] }
const RUN_ID = String(flag("--run-id", ""))
if (!RUN_ID) { console.error("--run-id required"); process.exit(1) }

const rows = []
for (const f of fs.readdirSync(LOGS_DIR)) {
  if (!f.startsWith(`${RUN_ID}-`) || !f.endsWith(".ndjson")) continue
  for (const line of fs.readFileSync(path.join(LOGS_DIR, f), "utf8").split("\n")) {
    if (!line.trim()) continue
    try { rows.push(JSON.parse(line)) } catch { /* torn line at kill */ }
  }
}
if (!rows.length) { console.error(`no logs for run-id ${RUN_ID}`); process.exit(1) }

const by = (ev) => rows.filter((r) => r.ev === ev)
const joins = by("joined").filter((r) => String(r.topic).startsWith("chat:"))
const joinFails = by("join_fail")
const fallbacks = by("fallback_engaged")
const recoveries = by("broadcast_recovered")
const sends = by("send")
const recvs = by("recv")
const fallbackRecvs = by("recv_fallback")
const lr = by("lr_write")
const canary = by("canary")
const http = by("http")

const P = (vals, p) => (vals.length ? Math.round(pct(vals, p)) : "—")
const check = (label, value, ok) => console.log(`${ok === null ? "· " : ok ? "✅" : "❌"} ${label}: ${value}`)

console.log(`\n═══ Load-test summary — run ${RUN_ID} ═══\n`)

// joins
const firstTryJoins = joins.filter((j) => (j.retry ?? 0) === 0).length
const uniqueTopicsTried = new Set([...joins, ...joinFails].map((r) => `${r.c}|${r.topic}`)).size
const joinMs = joins.map((j) => j.ms)
check("channel joins (chat:*)", `${joins.length} joined, ${joinFails.length} fails, first-try ${uniqueTopicsTried ? Math.round((100 * firstTryJoins) / uniqueTopicsTried) : 0}%`, uniqueTopicsTried ? firstTryJoins / uniqueTopicsTried >= 0.995 : null)
check("join latency", `p50=${P(joinMs, 50)}ms p95=${P(joinMs, 95)}ms p99=${P(joinMs, 99)}ms`, joinMs.length ? pct(joinMs, 95) < 3000 : null)
check("fallback engagements (trim gate = 0)", `${fallbacks.length} engaged, ${recoveries.length} recovered, ${fallbackRecvs.length} events via fallback`, fallbacks.length === 0)

// delivery: expected = for each probe seq, how many clients were subscribed to the
// group (approximate: distinct clients that received ANY probe in that ladder step)
const sendBySeq = new Map(sends.filter((s) => s.ok).map((s) => [s.seq, s]))
const recvBySeq = new Map()
for (const r of [...recvs, ...fallbackRecvs].filter((r) => r.seq !== undefined)) {
  if (!recvBySeq.has(r.seq)) recvBySeq.set(r.seq, [])
  recvBySeq.get(r.seq).push(r)
}
const audience = new Set([...recvs, ...fallbackRecvs].map((r) => r.c)).size
let delivered = 0, expected = 0
const latencies = []
for (const [seq, send] of sendBySeq) {
  const got = recvBySeq.get(seq) ?? []
  delivered += got.length
  expected += audience
  for (const r of got) latencies.push(r.at - send.ackAt)
}
const lossPct = expected ? (100 * (expected - delivered)) / expected : 0
const ackMs = sends.filter((s) => s.ok).map((s) => s.ms)
check("messages sent", `${sends.length} (${sends.filter((s) => !s.ok).length} insert errors)`, sends.length ? sends.filter((s) => !s.ok).length === 0 : null)
check("insert ack", `p50=${P(ackMs, 50)}ms p95=${P(ackMs, 95)}ms max=${ackMs.length ? Math.max(...ackMs) : "—"}ms`, ackMs.length ? pct(ackMs, 95) < 1000 : null)
check("delivery (audience≈" + audience + ")", `${delivered}/${expected} events, loss ${lossPct.toFixed(2)}%`, expected ? lossPct <= 0.1 : null)
check("delivery latency (ack→recv)", `p50=${P(latencies, 50)}ms p95=${P(latencies, 95)}ms p99=${P(latencies, 99)}ms`, latencies.length ? pct(latencies, 95) < 1500 : null)

// last_read_at writes
const lrMs = lr.filter((r) => r.ok).map((r) => r.ms)
check("last_read_at writes", `${lr.length} (p95=${P(lrMs, 95)}ms, ${lr.filter((r) => !r.ok).length} errors)`, null)

// http
for (const kind of [...new Set(http.map((h) => h.kind))]) {
  const k = http.filter((h) => h.kind === kind)
  const ms = k.filter((h) => h.ok).map((h) => h.ms)
  const errs = k.filter((h) => !h.ok || h.status === 429 || h.status === 503).length
  const limit = kind === "get_chat_list" ? 1200 : kind === "get_chat_previews" ? 1500 : 800
  const gate = kind.startsWith("next_") || kind === "auth_token" ? null : ms.length ? pct(ms, 95) < limit : null
  check(`http ${kind}`, `n=${k.length} p50=${P(ms, 50)}ms p95=${P(ms, 95)}ms errors/429/503=${errs}`, errs > 0 ? false : gate)
}

// canary
const cOk = canary.filter((c) => c.ok).map((c) => c.rpcMs)
if (canary.length) {
  const base = pct(cOk.slice(0, 20), 95)
  const during = cOk.slice(20)
  check("canary (real tenant)", `baseline p95=${base}ms, during p95=${P(during, 95)}ms, fails=${canary.filter((c) => !c.ok).length}`, during.length ? pct(during, 95) < 3 * base : null)
}

// worker health
const statRows = by("stat")
const worstLoop = Math.max(0, ...statRows.map((s) => s.loopP99 ?? 0))
check("worker event-loop p99 (worst)", `${worstLoop}ms`, worstLoop < 1000)
const disconnects = statRows.length ? Math.max(...statRows.map((s) => s.disconnects ?? 0)) : 0
check("socket disconnects", String(disconnects), null)

console.log("")
