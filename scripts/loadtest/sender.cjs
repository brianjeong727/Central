// Paced message sender — the fan-out driver. K fleet users round-robin sending
// probe messages into a group on a rate ladder. Every message body is JSON
// {probe:1, seq, sentAt} so receivers can compute loss (seq gaps) and latency.
//
//   node scripts/loadtest/sender.cjs --group <gid> --ladder "0.5x600,1x600,2x600" \
//        [--senders 10] [--run-id burstA]
//
// Aborts (exit 2) if >20% of inserts error in any 30s window.
const { freshTokens, userClient, ndjsonLogger, sleep, ensureThreadpool } = require("./lib.cjs")
ensureThreadpool()

const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1] }
const GROUP = flag("--group", null)
const LADDER = String(flag("--ladder", "0.5x60")).split(",").map((s) => { const [r, d] = s.split("x").map(Number); return { rate: r, durS: d } })
const SENDERS = Number(flag("--senders", 10))
const RUN_ID = String(flag("--run-id", `send${Date.now()}`))
if (!GROUP) { console.error("--group required"); process.exit(1) }

;(async () => {
  const tokens = freshTokens()
  const fleet = Object.entries(tokens).filter(([e]) => e.startsWith("fleet")).slice(0, SENDERS)
  if (fleet.length < SENDERS) throw new Error(`need ${SENDERS} UNEXPIRED senders, have ${fleet.length} — run warm-sessions.cjs`)
  const clients = fleet.map(([email, t]) => ({ email, userId: t.user_id, sb: userClient(t.access_token) }))
  const out = ndjsonLogger(`${RUN_ID}-sender.ndjson`)

  let seq = 0
  let windowSends = 0, windowErrors = 0
  // Sized to the real service time: message INSERT measured 765ms mean server-side at
  // 200 subscribers (the AFTER-ROW broadcast trigger fans out in-transaction), so the
  // top ladder rung of 8/s needs ~7 concurrent. 16 leaves headroom without letting a
  // backlog form; beyond it we record backpressure instead of inflating latency.
  const MAX_INFLIGHT = Number(flag("--max-inflight", 16))
  let inflight = 0
  let skipped = 0
  setInterval(() => {
    if (windowSends >= 10 && windowErrors / windowSends > 0.2) {
      console.error(`[sender] ABORT: ${windowErrors}/${windowSends} inserts failed in 30s window`)
      out.log({ ev: "abort", windowSends, windowErrors })
      process.exit(2)
    }
    windowSends = 0; windowErrors = 0
  }, 30000)

  for (const step of LADDER) {
    console.log(`[sender] ${step.rate} msg/s for ${step.durS}s`)
    out.log({ ev: "step", rate: step.rate, durS: step.durS })
    const interval = 1000 / step.rate
    const until = Date.now() + step.durS * 1000
    while (Date.now() < until) {
      // Bounded, not fire-and-forget. Unbounded .then() meant the offered rate kept
      // firing regardless of service time, so inserts piled into undici's queue and
      // the QUEUE WAIT landed inside the measured ms — 90,055ms acks while the server
      // was completing inserts in <6s (2026-08-12). That same 90s signature in July
      // was read as home-router saturation; it is this. A skipped send is recorded as
      // backpressure, so "client couldn't keep up" never masquerades as server latency.
      if (inflight >= MAX_INFLIGHT) {
        skipped++
        out.log({ ev: "send_skipped", seq: seq++, reason: "client_backpressure", inflight })
        await sleep(interval)
        continue
      }
      const c = clients[seq % clients.length]
      const mySeq = seq++
      const sentAt = Date.now()
      inflight++
      c.sb.from("messages")
        .insert({ group_id: GROUP, sender_id: c.userId, content: JSON.stringify({ probe: 1, seq: mySeq, sentAt }) })
        .select("id").single()
        .then(({ error }) => {
          inflight--
          windowSends++
          if (error) windowErrors++
          out.log({ ev: "send", seq: mySeq, sentAt, ackAt: Date.now(), ms: Date.now() - sentAt, ok: !error, err: error?.message })
        })
      await sleep(interval)
    }
  }
  console.log(`[sender] ladder complete — ${seq - skipped} sent, ${skipped} skipped (client backpressure)`)
  if (skipped) console.error(`[sender] ${skipped} sends skipped — offered load exceeded what the client could issue; latencies remain valid.`)
  out.log({ ev: "done", total: seq, sent: seq - skipped, skipped })
  setTimeout(() => process.exit(0), 5000) // let trailing acks land
})().catch((e) => { console.error("FATAL", e.message || e); process.exit(1) })
