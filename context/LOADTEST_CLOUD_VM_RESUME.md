# Load Test — PAUSED: cloud-VM run to finish the send/HTTP path

> Status as of 2026-07-21 (late night). The 200-user concurrency burst (Step 3 of
> `LOAD_TEST_AND_SUPABASE_UPGRADE.md`) is **partially done**. The realtime/fan-out/DB
> risk is PROVEN healthy. The send-path + HTTP-hot-path measurement is BLOCKED by a
> single-home-IP limitation and is being moved to a cloud VM. This doc is the resume
> point. Plan of record: `~/.claude/plans/fluttering-launching-coral.md`.

---

## TL;DR — where we are

- **Preconditions all met:** Supabase on **Pro**, spend cap **OFF**, auth sign-in rate
  limit raised to **600/5min** (took a while to propagate). PRs #216 (broadcast-fallback
  retry) + #217 (load-test harness) are **merged to main**.
- **What's PROVEN (real evidence, 160 concurrent live clients against prod):**
  - Channel joins: 320, **0 failures**, p95 523ms — the service-start join spike is fine.
  - **Fallback engagements: 0** — this is the gate for the Phase E publication trim; it's green.
  - Message delivery: **3,680 / 3,680, zero loss** — realtime fan-out to ~160 subscribers is flawless.
  - DB never stressed: peaked **23 of 60** connections, 0 lock waits, `last_read_at` writes 19ms,
    `get_chat_list` 70ms, message insert ≤4.7s server-side even under the client-side pile-up.
  - → The scariest risk (the fan-out that likely caused the CCSF board-meeting freeze) is retired.
- **What is NOT yet proven:** the **message-send path** and **HTTP hot paths** at high concurrency.
  Not because they failed on the server — because **one home network cannot simulate 200 users**.

## Why it's blocked (the finding — don't re-learn this the hard way)

Running the fleet from Brian's home wifi hit the wall TWICE:
1. First abort: Brian (on the same wifi) saw "nothing loading" on prod. The **shared residential
   uplink** was saturated by the fleet; his browser starved. DB was totally healthy.
2. Second abort: the sender's inserts **queued 90 seconds** (`ms: 90109`) then timed out, while the
   fleet's established websockets kept receiving fine (9,760 delivered, 0 disconnects) and the DB sat
   at 23/60. **The home router's connection table / uplink is the bottleneck**, not Supabase.

The clincher: during the failure, `fetch()` to **joincentral.app** (Vercel) stayed **fast (p95 79ms,
0 errors)** while every **Supabase PostgREST** call timed out (28–295s). 160 websockets all to
`*.supabase.co` from one IP through one home router exhausts local connection capacity; new outbound
Supabase connections queue behind them. **Real launch day = 200 users on 200 different IPs/devices/
networks, so this concentration artifact does not exist for them.** It is purely a test-rig property.

**Rule for the resume:** never run the >~40-socket fleet from a residential network. Use a datacenter
VM (proper uplink, huge connection table). One good VM is very likely enough (evidence points to the
home router, not Supabase per-IP throttling — DB was idle and Vercel calls were fast throughout).

---

## HOW TO RESUME (cloud VM)

### 0. SSH key (already generated on Brian's Mac)
- Private: `~/.ssh/loadtest_ed25519` · Public below (add to the VM):
  ```
  ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINGBYPzLnPX2TSihuAU7UsHL0EWXvOGEDHVcfW+5W/dD central-loadtest
  ```

### 1. Provision one cheap Ubuntu box (Brian's action — needs his cloud account + card)
- Any provider. **Ubuntu 24.04**, cheapest size (~$6/mo tier; we use it ~1 hr), region **near
  us-east-1** (e.g. DigitalOcean NYC — Supabase project is us-east-1). Add the SSH key above. Get the IP.
- Cost: **under $1 for the session**, or $0 on a free-tier / new-account credit.
- ⚠️ Running the harness requires copying `.env.local` (contains the Supabase **service-role key**) to
  the VM. It's a throwaway box destroyed after — but consider **rotating the service-role key** post-run.

### 2. Stand up the harness on the VM (Claude drives over SSH from Brian's Mac)
```bash
VM=<ip>
SSH="ssh -i ~/.ssh/loadtest_ed25519 -o StrictHostKeyChecking=accept-new root@$VM"
# node 20
$SSH 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs'
# copy harness + env (from the s1 worktree)
cd "/Users/brianjeong/Desktop/CENTRAL OS/central-s1"
scp -i ~/.ssh/loadtest_ed25519 -r scripts/loadtest root@$VM:/root/loadtest
scp -i ~/.ssh/loadtest_ed25519 .env.local root@$VM:/root/loadtest/.env.local   # note: real file, not the symlink
$SSH 'cd /root/loadtest && npm init -y >/dev/null && npm i @supabase/supabase-js ws >/dev/null && ulimit -n 65535'
```
- `lib.cjs` computes paths from `__dirname`/`ROOT`; it expects `.env.local` at repo-root. On the VM the
  layout differs (`/root/loadtest/.env.local`), so **either** put `.env.local` where `lib.cjs`'s
  `ROOT = path.resolve(__dirname,'..','..')` resolves, **or** tweak `lib.cjs` ROOT for the VM. Simplest:
  place harness at `/root/central/scripts/loadtest/` and `.env.local` at `/root/central/.env.local`.
- Playwright (`load-probe.cjs`) is NOT needed for the burst; skip installing it. Core deps are just
  `@supabase/supabase-js` + `ws`.

### 3. Warm 200 fresh sessions FROM THE VM's IP (clean rolling window)
```bash
$SSH 'cd /root/central && node scripts/loadtest/warm-sessions.cjs --count 200 --pace 350'
```
- 600/5min limit should now be propagated → 200 warms in ~70s. `.tokens.json` lands on the VM.
- (The Mac's `.tokens.json` has 160 tokens tied to earlier warms; the VM warms its own.)

### 4. Reset DB stats, run the FULL burst, sample from Brian's Mac via Supabase MCP
```bash
# Mac: mcp__supabase__execute_sql  ->  select pg_stat_statements_reset();
$SSH 'cd /root/central && ulimit -n 65535; nohup bash scripts/loadtest/... '   # see burst driver below
```
- Reuse the burst shape from `scratchpad/burstD.sh` (archived idea; scratchpad is gitignored so it may
  be gone — recreate): canary 30s baseline → fleet `--plan "50x90,100x90,200x900"` (now the full **200**,
  not 160) `--workers 8 --open-ratio 0.25 --stagger 55` → at the 200 step, sender
  `--ladder "0.5x150,1x150,2x180,4x180,8x150"` into central gid **`2c67fabd-b2de-4f00-8698-ec55e4c5bef1`**
  → `http-burst --rps 5 --duration 600 --next-rps 1 --auth-burst 50` (auth-burst is now safe from the
  VM's own IP and actually tests the campus-NAT shape).
- **Watch from the Mac** via Supabase MCP during the run: `pg_stat_activity` backend count (vs **60**),
  lock waits, `pg_stat_statements` mean/max for msg_insert / last_read / get_chat_list. Canary runs on
  the VM now (clean network) so its numbers are finally trustworthy.
- Kill switch: `Ctrl-C` / SIGINT the `fleet.cjs` on the VM (teardown <2s). Auto-abort tripwires already
  built into fleet.cjs (fallbacks >2%, disconnects >10%, event-loop stall).

### 5. Summarize + snapshot
```bash
$SSH 'cd /root/central && node scripts/loadtest/summarize.cjs --run-id burstCloud'   # pass/fail table
# Mac MCP: after-snapshot of pg_stat_statements + get_logs (realtime, postgres) + advisors
```

### 6. Pass thresholds (from the plan) — for the 200-conn, cap-OFF run
socket connect ≥99.5% p95<2s · channel join ≥99.5% first-try p95<3s · **fallback engagements 0** ·
delivery loss ≤0.1% · delivery latency ack→recv p95<1.5s · insert-ack p95<1s · get_chat_list p95<1.2s,
page-1 selects p95<800ms, zero 429/503 · DB backends <60% of pool, no lock storms.

### 7. Teardown
- Destroy the VM (Brian, in the cloud console). Delete `.env.local` from it first (or just nuke the box).
- **Rotate the Supabase service-role key** if desired (it was on the VM).
- Fleet fixtures in the **Load Test 200** tenant (`f00d1e57-0000-4000-8000-000000000001`, 200 users,
  202-member central chat) STAY — reusable. `.tokens.json` is gitignored on both boxes.

---

## After the burst → the remaining phases (unchanged)
- **Phase E — publication trim:** gated on 0 fallbacks at 200 (already 0 at 160; re-confirm at 200).
  `ALTER PUBLICATION supabase_realtime DROP TABLE public.messages, public.message_reactions;` off-hours,
  rls-reviewer pre-check, then burst B (same join spike, short ladder) to compare `realtime.list_changes`
  + join p95 before/after. Rollback = `ALTER PUBLICATION ... ADD TABLE` (instant).
- **Phase F — report + launch checklist:** capacity vs launch shape · spend-cap ON/OFF rec · **auth rate
  limit: RAISE IT DAYS BEFORE ONBOARDING (propagation lag is real — it did not take effect for ~1hr
  tonight; campus-NAT means 200 students share ~1 IP)** · `last_read_at` debounce (measured cheap at
  19ms server-side — LOW priority, not a blocker) · trim status · go/no-go. Update the context doc +
  memory. Propose CLAUDE.md realtime-table rewrite (it still lists retired channels
  `group-messages-*`/`reactions-*`/`home-app-recent-chats`; reality is the `chat:{gid}` broadcast hub).

## Key facts / IDs (so the resume needs no re-derivation)
- Supabase project `wgqpnilaokfipocsugqo` (us-east-1, Postgres 17, **max_connections=60**).
- Load Test tenant `f00d1e57-0000-4000-8000-000000000001` — central chat gid
  `2c67fabd-b2de-4f00-8698-ec55e4c5bef1` (202 members), 5 DG groups, 9k historical messages.
- Fleet login users: `fleet001..fleet200@loadtest.test` + `loadtest.admin@` / `loadtest.member@`
  (all password = `E2E_PASSWORD` in `.env.local`). Canary: `canary@loadtest.test` in Brian's Sandbox
  (`6c68111b-0248-45ba-9ab1-169ee33f62c9`).
- Harness: `scripts/loadtest/` on main — `fleet.cjs`/`fleet-worker.cjs`, `sender.cjs`, `http-burst.cjs`,
  `canary.cjs`, `warm-sessions.cjs`, `create-fleet-users.cjs`, `swap-memberships.cjs`, `summarize.cjs`,
  `lib.cjs`, `README.md` (has the co-location caveat).
- Metric trust: realtime metrics (joins/delivery/loss) are machine-agnostic. Client HTTP/insert-ack
  numbers were co-location-inflated on the home box — the VM fixes this; still cross-check server truth
  via `pg_stat_statements`.
