// Paced message sender — the fan-out driver. K fleet users round-robin sending
// probe messages into a group on a rate ladder. Every message body is JSON
// {probe:1, seq, sentAt} so receivers can compute loss (seq gaps) and latency.
//
//   node scripts/loadtest/sender.cjs --group <gid> --ladder "0.5x600,1x600,2x600" \
//        [--senders 10] [--run-id burstA]
//
// Aborts (exit 2) if >20% of inserts error in any 30s window.
const { readTokens, userClient, ndjsonLogger, sleep } = require("./lib.cjs")

const args = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i === -1 ? dflt : args[i + 1] }
const GROUP = flag("--group", null)
const LADDER = String(flag("--ladder", "0.5x60")).split(",").map((s) => { const [r, d] = s.split("x").map(Number); return { rate: r, durS: d } })
const SENDERS = Number(flag("--senders", 10))
const RUN_ID = String(flag("--run-id", `send${Date.now()}`))
if (!GROUP) { console.error("--group required"); process.exit(1) }

;(async () => {
  const tokens = readTokens()
  const fleet = Object.entries(tokens).filter(([e]) => e.startsWith("fleet")).slice(0, SENDERS)
  if (fleet.length < SENDERS) throw new Error(`need ${SENDERS} warmed senders, have ${fleet.length}`)
  const clients = fleet.map(([email, t]) => ({ email, userId: t.user_id, sb: userClient(t.access_token) }))
  const out = ndjsonLogger(`${RUN_ID}-sender.ndjson`)

  let seq = 0
  let windowSends = 0, windowErrors = 0
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
      const c = clients[seq % clients.length]
      const mySeq = seq++
      const sentAt = Date.now()
      c.sb.from("messages")
        .insert({ group_id: GROUP, sender_id: c.userId, content: JSON.stringify({ probe: 1, seq: mySeq, sentAt }) })
        .select("id").single()
        .then(({ error }) => {
          windowSends++
          if (error) windowErrors++
          out.log({ ev: "send", seq: mySeq, sentAt, ackAt: Date.now(), ms: Date.now() - sentAt, ok: !error, err: error?.message })
        })
      await sleep(interval)
    }
  }
  console.log(`[sender] ladder complete — ${seq} messages sent`)
  out.log({ ev: "done", total: seq })
  setTimeout(() => process.exit(0), 5000) // let trailing acks land
})().catch((e) => { console.error("FATAL", e.message || e); process.exit(1) })
