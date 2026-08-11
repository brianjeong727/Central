// One fleet worker: hosts a slice of clients, each mimicking the real app's realtime
// footprint (see app/home/chat-broadcast.ts): private broadcast topic chat:{gid} per
// member group, own-memberships postgres_changes, and — for "open chat" clients —
// the typing channel plus a last_read_at write on every received central-chat message.
// Hub-faithful failure handling: fallback engages on join failure AND broadcast is
// retried with capped backoff (mirrors the fixed app behavior).
//
// Spawned by fleet.cjs with env: MANIFEST (path), RANGE ("start:end"), WORKER_ID,
// RUN_ID, CENTRAL_GID. IPC: {type:"refresh",email,token} | {type:"shutdown"}.
const fs = require("node:fs")
const { monitorEventLoopDelay } = require("node:perf_hooks")
const { userClient, ndjsonLogger } = require("./lib.cjs")

const manifest = JSON.parse(fs.readFileSync(process.env.MANIFEST, "utf8"))
const [start, end] = process.env.RANGE.split(":").map(Number)
const WORKER_ID = process.env.WORKER_ID
const CENTRAL_GID = process.env.CENTRAL_GID
const slice = manifest.slice(start, end)
const out = ndjsonLogger(`${process.env.RUN_ID}-w${WORKER_ID}.ndjson`)

const loopDelay = monitorEventLoopDelay({ resolution: 20 })
loopDelay.enable()

const clients = new Map() // email -> {sb, channels: Map<topic, ch>, entry state}
// churn* are tracked SEPARATELY from disconnects on purpose: a churned socket is an
// intentional drop, and folding it into `disconnects` would trip fleet.cjs's >10%
// tripwire and abort a healthy run. Real unexpected drops must stay visible.
let stats = { connected: 0, joined: 0, joinFails: 0, fallbacks: 0, recoveries: 0, recv: 0, disconnects: 0, lrWrites: 0,
              churnDrops: 0, churnRejoins: 0, churnRejoinFails: 0 }

function log(rec) { out.log({ w: WORKER_ID, ...rec }) }

function subscribeChatTopic(state, gid) {
  const topic = `chat:${gid}`
  const t0 = Date.now()
  const attempt = (retryAttempt) => {
    const ch = state.sb
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "INSERT" }, (msg) => {
        stats.recv++
        const rec = msg?.payload?.record
        if (rec && typeof rec.content === "string" && rec.content.startsWith('{"probe"')) {
          try {
            const probe = JSON.parse(rec.content)
            log({ ev: "recv", c: state.email, gid, seq: probe.seq, at: Date.now() })
          } catch { /* not a probe */ }
        }
        if (state.open && gid === CENTRAL_GID && rec) {
          const lr0 = Date.now()
          state.sb.from("group_members").update({ last_read_at: new Date().toISOString() })
            .eq("group_id", gid).eq("user_id", state.userId)
            .then(({ error }) => {
              stats.lrWrites++
              log({ ev: "lr_write", c: state.email, ms: Date.now() - lr0, ok: !error })
            })
        }
      })
      .on("broadcast", { event: "UPDATE" }, () => { stats.recv++ })
      .on("broadcast", { event: "DELETE" }, () => { stats.recv++ })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          stats.joined++
          log({ ev: "joined", c: state.email, topic, ms: Date.now() - t0, retry: retryAttempt })
          // A churned client is only truly "back" once a chat topic re-subscribes —
          // that's when the phone can receive again. Timing startClient()'s return
          // instead measured ~2ms of local setup and told us nothing.
          if (state.rejoinT0) {
            stats.churnRejoins++
            log({ ev: "churn_rejoin", c: state.email, ms: Date.now() - state.rejoinT0 })
            state.rejoinT0 = null
          }
          if (state.fallbacks.has(gid)) {
            state.sb.removeChannel(state.fallbacks.get(gid))
            state.fallbacks.delete(gid)
            stats.recoveries++
            log({ ev: "broadcast_recovered", c: state.email, gid })
          }
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          stats.joinFails++
          log({ ev: "join_fail", c: state.email, topic, status, retry: retryAttempt, ms: Date.now() - t0 })
          state.sb.removeChannel(ch)
          state.channels.delete(topic)
          if (!state.fallbacks.has(gid)) {
            stats.fallbacks++
            log({ ev: "fallback_engaged", c: state.email, gid })
            const fb = state.sb.channel(`chat-fallback:${gid}`)
              .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${gid}` }, (p) => {
                stats.recv++
                const content = p.new?.content
                if (typeof content === "string" && content.startsWith('{"probe"')) {
                  try { log({ ev: "recv_fallback", c: state.email, gid, seq: JSON.parse(content).seq, at: Date.now() }) } catch { /* */ }
                }
              })
              .subscribe()
            state.fallbacks.set(gid, fb)
          }
          const delay = Math.min(2000 * 2 ** retryAttempt, 60000)
          setTimeout(() => { if (!state.closed) attempt(retryAttempt + 1) }, delay)
        }
      })
    state.channels.set(topic, ch)
  }
  attempt(0)
}

// rejoinT0 is set at state CREATION, not after the await — subscribeChatTopic can
// reach SUBSCRIBED before an assignment made after `await startClient()` lands.
async function startClient(row, rejoinT0 = null) {
  const state = {
    email: row.email, userId: row.user_id, open: row.open, sb: userClient(row.access_token),
    channels: new Map(), fallbacks: new Map(), closed: false,
    // Kept so churn can rebuild this client after its "backgrounded" gap. `token`
    // tracks the coordinator's refreshes so a rejoin never uses a stale JWT.
    row, token: row.access_token, rejoinT0,
  }
  clients.set(row.email, state)
  const t0 = Date.now()
  await state.sb.realtime.setAuth(row.access_token)
  // Socket lifecycle telemetry via the underlying WebSocket-ish conn (realtime-js
  // 2.x has no public onOpen/onClose). Best-effort — never fatal.
  const conn = state.sb.realtime.conn
  if (conn) {
    conn.addEventListener?.("open", () => { stats.connected++; log({ ev: "socket_open", c: row.email, ms: Date.now() - t0 }) })
    conn.addEventListener?.("close", () => { if (!state.closed) { stats.disconnects++; log({ ev: "socket_close", c: row.email }) } })
  }

  for (const gid of row.groups) subscribeChatTopic(state, gid)

  const om = state.sb.channel(`own-memberships-${row.user_id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "group_members", filter: `user_id=eq.${row.user_id}` }, () => {})
    .subscribe((status) => {
      if (status === "SUBSCRIBED") log({ ev: "joined", c: row.email, topic: "own-memberships", ms: Date.now() - t0 })
    })
  state.channels.set("own-memberships", om)

  if (row.open && row.groups.includes(CENTRAL_GID)) {
    const ty = state.sb.channel(`typing-${CENTRAL_GID}`).on("broadcast", { event: "typing" }, () => {}).subscribe()
    state.channels.set("typing", ty)
  }
}

let shuttingDown = false

// ── Socket churn: simulate phones backgrounding and resuming ──────────────────
// iOS suspends a websocket when the app backgrounds and the client rejoins on
// resume. During a service, 200 phones lock/unlock continuously, so the realtime
// layer sees CONTINUOUS reconnect churn — a different stress from the one-time
// cold join spike the ramp already covers. This drops a client the way a suspend
// does (no clean unsubscribe) and rejoins it after an offline gap.
function teardown(state, { intentional }) {
  state.closed = intentional // suppresses the disconnect counter for churn only
  for (const ch of state.channels.values()) { try { state.sb.removeChannel(ch) } catch { /* */ } }
  for (const fb of state.fallbacks.values()) { try { state.sb.removeChannel(fb) } catch { /* */ } }
  state.channels.clear()
  state.fallbacks.clear()
  try { state.sb.realtime.disconnect() } catch { /* */ }
}

async function churnClient(email, offlineMs) {
  const state = clients.get(email)
  if (!state || state.churning || shuttingDown) return
  state.churning = true
  const row = { ...state.row, access_token: state.token }
  teardown(state, { intentional: true })
  clients.delete(email)
  stats.churnDrops++
  log({ ev: "churn_drop", c: email, offlineMs })

  setTimeout(async () => {
    if (shuttingDown) return
    const t0 = Date.now()
    try {
      // churn_rejoin is logged by subscribeChatTopic once a topic reaches SUBSCRIBED.
      await startClient(row, t0)
    } catch (e) {
      stats.churnRejoinFails++
      log({ ev: "churn_rejoin_fail", c: email, err: String(e.message).slice(0, 120) })
    }
  }, offlineMs)
}

;(async () => {
  log({ ev: "worker_start", clients: slice.length })
  for (const row of slice) {
    if (shuttingDown) break
    await startClient(row)
    await new Promise((r) => setTimeout(r, Number(process.env.STAGGER_MS || 50)))
  }
  log({ ev: "worker_ready" })
})()

process.on("message", (m) => {
  if (m.type === "refresh") {
    const state = clients.get(m.email)
    if (state) { state.token = m.token; void state.sb.realtime.setAuth(m.token) }
  } else if (m.type === "churn") {
    // Coordinator names how many to cycle; we pick which, so the victims are
    // spread across this worker's slice rather than always the same clients.
    const pool = [...clients.keys()].filter((e) => !clients.get(e).churning)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    for (const email of pool.slice(0, m.count)) {
      // Jitter the offline gap: phones don't resume in lockstep, and a synchronized
      // rejoin would manufacture a thundering herd the real world doesn't have.
      const offline = m.minOfflineMs + Math.floor(Math.random() * (m.maxOfflineMs - m.minOfflineMs))
      void churnClient(email, offline)
    }
  } else if (m.type === "shutdown") {
    shuttingDown = true
    for (const state of clients.values()) teardown(state, { intentional: true })
    log({ ev: "worker_shutdown" })
    out.close()
    setTimeout(() => process.exit(0), 1500)
  }
})

setInterval(() => {
  const p99 = Math.round(loopDelay.percentile(99) / 1e6)
  loopDelay.reset()
  if (process.send) process.send({ type: "stat", w: WORKER_ID, ...stats, loopP99: p99, clients: clients.size })
  log({ ev: "stat", ...stats, loopP99: p99 })
}, 5000)
