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
