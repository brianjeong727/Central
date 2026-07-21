# Load-test harness — 200-connection concurrency burst

Proves launch-day concurrency on the prod project: 200 websockets, the service-start
join spike, and message fan-out in the 202-member chat. Full plan + thresholds:
`context/LOAD_TEST_AND_SUPABASE_UPGRADE.md` §2 Step 3 and the Step-3 plan file.

Everything is hard-scoped to the **Load Test 200** tenant
(`f00d1e57-0000-4000-8000-000000000001`) — except `canary.cjs`, which deliberately
runs in Brian's Sandbox (a real tenant) to measure what actual users feel.

## Files

| File | Role |
|---|---|
| `lib.cjs` | shared env/clients/token-store/NDJSON plumbing |
| `create-fleet-users.cjs` | 200 fleet auth users + canary, profiles wired |
| `swap-memberships.cjs` | ghosts out of the central chat, fleet in (`last_read_at` backfilled) |
| `warm-sessions.cjs` | paced sign-ins → gitignored `.tokens.json` |
| `fleet.cjs` + `fleet-worker.cjs` | the websocket fleet (workers, ramp plan, tripwires, kill switch, token refresher) |
| `sender.cjs` | paced probe-message ladder into a group (seq numbers → loss/latency) |
| `http-burst.cjs` | PostgREST hot-path loops + Next-tier loop + auth-burst sub-scenario |
| `canary.cjs` | real-tenant latency canary (baseline first, alerts at 3×) |
| `summarize.cjs` | pass/fail table from the NDJSON logs |
| `load-probe.cjs` / `login-trace.cjs` | browser-truth probes from Steps 1–2 |

## Order of operations (prod burst — Phase D)

Preconditions: PR #216 (fallback retry) live on prod · auth `/token` per-IP limit
raised in the dashboard · spend cap decision made · `ulimit -n 4096`.

```bash
node scripts/loadtest/create-fleet-users.cjs      # once (idempotent)
node scripts/loadtest/swap-memberships.cjs        # once (idempotent)
node scripts/loadtest/warm-sessions.cjs           # all 200 (after rate-limit raise)

# window opens — every command tags the same --run-id
node scripts/loadtest/canary.cjs --run-id burstA &            # baseline ≥5 min before ramp
node scripts/loadtest/fleet.cjs --run-id burstA \
     --plan "50x120,100x120,200x1800" --open-ratio 0.25       # ramp + hold
node scripts/loadtest/sender.cjs --run-id burstA \
     --group <central-gid> --ladder "0.5x600,1x600,2x600,4x600,8x600"
node scripts/loadtest/http-burst.cjs --run-id burstA --rps 5 --duration 300 \
     --next-rps 1 --auth-burst 50

node scripts/loadtest/summarize.cjs --run-id burstA           # the verdict
```

Abort: `Ctrl-C` on `fleet.cjs` tears all sockets down in <10s; it also auto-aborts
on its own tripwires (fallbacks >2%, disconnects >10%, event-loop stall). The canary
prints explicit ABORT guidance when a real tenant degrades.

DB-side snapshots (before/after, via Supabase MCP): `pg_stat_statements_reset()`,
top statements, `pg_stat_activity` samples, realtime logs.

## Which metrics to trust (co-location caveat — learned in the 20-conn dry run)

Running the socket fleet + sender + http-burst on ONE machine means they share one
undici connection pool. At 20 connections the **realtime path stayed instant**
(join p95 628ms, 1800/1800 delivered, 0 loss) while **every HTTP call read 12–15s
p95** — that's client-side pool queueing on the test box, NOT the server (the server
processed the inserts and broadcast them in ~4ms; only the HTTP *ack* was queued
locally). So:

- **Trust from one machine:** channel-join success/latency, delivery loss, delivery
  latency (ack→recv), fallback engagements, socket disconnects.
- **Do NOT trust from a co-located rig:** insert-ack latency, `http-burst` p95s.
  For the authoritative server-side answer use **`pg_stat_statements` via MCP**
  (true server execution time) + the **canary** (separate tenant/pool) + the ~6
  **Playwright browsers**. For real client-side HTTP p95 at scale, run `http-burst.cjs`
  and `sender.cjs` from a SEPARATE box during Phase D.
- The `last_read_at` write amplification is real regardless (450 writes from 5 open
  clients over 90 messages) — it's the debounce follow-up; on launch day the writes
  hit the DB from 200 separate devices (no shared-pool inflation, but same DB load).
