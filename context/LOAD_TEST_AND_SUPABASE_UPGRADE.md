# Handoff — Load-Testing for 200 Users + Supabase Upgrade

> Written 2026-07-20 for the next session. Two linked workstreams before Central goes live for ~200 people (a few weeks out): (1) **load-test / simulate 200 concurrent users** to catch the class of bug that froze the CCSF board meeting, and (2) **upgrade Supabase to Pro** (with a sequencing wrinkle about moving the project to a personal org before grad). Nothing below has been executed yet — this is the plan + the verified facts to act on it.

---

## 0. Why this exists — the triggering event

At a testing meeting, a few CCSF board members logged in and **the site froze** — DB + codebase couldn't handle even a handful of concurrent people. Before onboarding day (~200 people, in a few weeks) we need to prove Central survives real concurrency.

**Key reframe:** a freeze with *a few* people is NOT a 200-user scale problem — it's a **bug-class problem** (unbounded query, realtime fan-out, connection exhaustion, or an O(n²) path). Upgrading Supabase raises capacity ceilings but will **NOT** fix a bad query. That bug is still a bug at 200 users on Pro. Both workstreams are needed; neither substitutes for the other.

Related: memory `project_scale_readiness.md` — scale-readiness waves shipped 2026-07-19 (`feat/perf-wave1`, 4 live migrations, 3 security holes closed). PENDING there: publication trim AFTER prod deploy; **"Supabase Pro must be active BEFORE onboarding day."**

---

## 1. Verified Supabase facts (pulled live from MCP + docs on 2026-07-20)

- **Project:** `wgqpnilaokfipocsugqo` — name "Central", region `us-east-1`, Postgres 17, status ACTIVE_HEALTHY.
- **Organization:** `riqmbdwxufdwiotudrvk` — name "brianjeong727's Org", **plan = `free`** (this is the thing to upgrade).
- The project ref `wgqpnilaokfipocsugqo` is **hardcoded across the codebase** (CLAUDE.md, Vercel env `NEXT_PUBLIC_SUPABASE_URL`/keys). Anything that preserves the ref (plan upgrade, project transfer between orgs, account email change) is safe. **Recreating the project in a new account is NOT — it changes the ref/URL/keys and breaks everything. Never do that.**

### Free vs Pro Realtime limits (from Supabase docs, verified)

| Limit | Free | Pro | Pro (no spend cap) |
|---|---|---|---|
| Concurrent connections | **200** | 500 | 10,000 |
| Messages / sec | **100** | 500 | 2,500 |
| Channel joins / sec | **100** | 500 | 2,500 |
| Channels / connection | 100 | 100 | 100 |
| Realtime messages / month (quota) | 2M | 5M | 5M |

Pricing: Pro plan $25/mo base; peak connections $10 per 1,000 over quota; messages $2.50 per 1M over quota. Compute: Free = smallest shared instance; Pro = dedicated Small instance (big step up, and the relevant one for the "freeze").

### Why Free cannot carry 200 active users (the analysis)

- **supabase-js opens ONE websocket per browser**, multiplexing all channel subscriptions over it. So 200 active users ≈ **200 concurrent connections = exactly the Free ceiling, zero headroom.** Peak-connection billing counts every real socket: refreshes, background tabs, 2nd devices, reconnect blips stack on top → real peak >200 → connection 201 gets `too_many_connections` and realtime **silently dies** for those users (chats stop updating, unread badges freeze) while the page still looks alive.
- **Burst walls trip even below 200 users:**
  - *Channel joins/sec (100):* Central subscribes each user to ≥2 channels on home-load (`home-app-recent-chats` + `own-memberships-{userId}`). When a service starts and everyone opens the app in the same ~5–10s, that's ~400 joins in a burst → refused joins → realtime never connects for a chunk of people.
  - *Messages/sec (100):* Postgres-changes fan out **per recipient**. One message in a busy 200-member church chat = up to ~200 delivered events → blows past 100/sec instantly → `tenant_events` → clients force-disconnected → reconnect storm.
- **Compute is the likely board-meeting freeze culprit.** A freeze with only a few people can't be a realtime-msg-cap hit (you can't reach 100 msg/s with a handful of people unless something's looping). It points to an **unbounded query / O(n²) path saturating the shared Free CPU.** Pro's dedicated instance helps a lot but does not fix a bad query.

**Conclusion:** Pro is *necessary* (Free fails on connections alone at 200) but *not sufficient* (the query bug survives). For a synchronized 200-person event, consider **spend cap OFF** so a message/connection burst can't get throttled — but know which limit you'd hit first.

### Central realtime channels (context for the fan-out math)
From CLAUDE.md Architecture → Realtime: `group-messages-{groupId}`, `reactions-{groupId}`, `home-app-recent-chats` (per user, filtered to own group IDs), `read-receipts-{groupId}` (only <30-member chats), `own-memberships-{userId}` (per user), `typing-{groupId}` (broadcast). Each active user holds **≥2 persistent channels just sitting on Home**, more when in a chat. The <30/≥30-member read-receipt threshold (Convention #18) already exists to escape O(members²) receipt fan-out at scale — good, but doesn't cover message fan-out.

---

## 2. Load-test plan — the RIGHT shape

The original idea was "200 bots impersonating real members replay a full year of announcements/chats/events/finance/governance." Good instinct (must load-test before launch), **wrong packaging** — it conflates three distinct tests. Splitting them is cheaper, faster, and catches more. Bots replaying a year is the worst tool for most of it.

Run in this order:

### Step 1 — Reproduce the board-meeting freeze FIRST (highest value)
Before building any bot fleet: a **handful of concurrent real sessions** doing what the board did, and confirm today's `perf-wave1` work actually killed the freeze. If it's still broken, 200 bots just say "still broken" with more noise. This is the bug-hunt, not the scale test. **Trace the freeze to the specific query** (unbounded select / missing pagination / O(n²) / subscription loop). *This is the single most valuable thing to do next.*

### Step 2 — Data VOLUME (no bots needed)
Seed a year's worth of rows — announcements, chats/messages, events, finance history — **directly via SQL through the Supabase MCP**, in minutes. Tests: pagination, unbounded selects, queries fine at 50 rows that die at 5,000. Cheap; do it.

### Step 3 — CONCURRENCY burst (the launch-day test)
200 people active *at once* = about simultaneous **connections**, not historical data. 200 websockets each on multiple channels, 200 sessions hammering home-load + chat paths, RLS per-request, connection pool, Supabase concurrent-realtime caps.
- Tool: **k6** for API/DB hot paths; a **smaller Playwright fleet** (we already have a Playwright harness from the orchestration overhaul — Phase 1, PR #143) for real browser/websocket behavior.
- Shape: a 15–30 min burst of the hot loops — login → load home → open chat → send message → react → RSVP. Add a "**everyone opens at service start**" synchronized spike to specifically probe the joins/sec wall.
- A "year of activity" adds nothing here; ~10 min of realistic concurrent load tells you everything.
- **Must run on Pro**, off-hours (see cautions) — otherwise you're measuring free-tier throttles, not your code.

### Step 4 — Edge-case / workflow bugs (scripted, not random)
Governance changes, finance approve→sign-off, event planning. **Random bot behavior is a terrible way to find these** — produces noise, not repro steps. Use scripted E2E flows (existing Playwright harness) with a few driven browsers over the weird paths. Far better per hour.

---

## 3. Cautions before ANY version runs

- **Brian's Sandbox lives in the PRODUCTION Supabase project** (`6c68111b-0248-45ba-9ab1-169ee33f62c9`, `is_sandbox=true`). A 200-client test hammers the same DB / pool / realtime cluster your real ministry uses. **Run off-hours.**
- **Pro must be active BEFORE the concurrency test**, not just before launch — else you partly measure free-tier throttles and results don't reflect launch day. (Hitting a cap is useful data, but you want to know *which* cap.)
- **Do NOT use the real church member list.** Synthetic members behave identically for load. Real emails risk Supabase sending real auth emails to your congregation and put their PII into test fixtures for zero benefit.
- **Disable push triggers during seeding** (per the sandbox playbook / memory `project_personal_sandbox`) — else a "year of activity" seed becomes a notification storm.
- Seed real fixtures, play end-to-end, **leave fixtures in place**, hand back a "how to test it yourself" section (STANDING MANDATE, memory `project_personal_sandbox`).

---

## 4. Supabase upgrade + "keep it after I graduate" (sequencing)

Brian's concern: his Supabase is "connected to my school" and he wants it on personal so it survives graduation. **Finding:** the org is already named "brianjeong727's Org" (personal-named) on Free, and his account email in-session is a personal Gmail (brianjeong13@gmail.com) — so the *project location* probably isn't school-controlled. The real graduation risk is usually one of:

1. **Login identity is school-tied** (most common). If he signs in with a `.edu` email or school Google/GitHub, losing that at grad locks him out even though the org is personal. Fix (do before losing school access): Account settings → set primary email to personal Gmail; if GitHub login, ensure it uses a kept personal email; confirm he's **Owner** of the org.
2. **Project genuinely under a school-owned org.** Then use Supabase's built-in **Transfer Project** (Project Settings → General → Transfer Project) into his personal org. Free→Free is clean/near-instant; needs Owner/Admin on both orgs.

**Sequencing rule:** if a transfer is needed, **transfer FIRST, then upgrade to Pro** — so the paid plan lands on the org he'll keep, not the school's. All of {plan upgrade, project transfer, email change} **preserve the project ref/URL/keys**, so code + Vercel env stay intact. Only recreating the project would break things.

**OPEN QUESTION for Brian (was pending when session reset):** which situation is he in? He needs to check: (a) what email/login method is on his Supabase *account*, and (b) under Organization → Members, is he the **Owner**? That determines whether it's a 2-min email change or a project transfer. Get this answer before upgrading.

---

## 5. Recommended next-session order of operations

1. Confirm the account/org ownership question (§4 open question) → do email fix or project transfer if needed.
2. **Upgrade the org he'll keep to Pro** (required before onboarding day; required before the concurrency test).
3. **Reproduce + trace the board-meeting freeze** (§2 Step 1) — find the actual query. Highest value.
4. SQL-seed a year of data volume (§2 Step 2).
5. Concurrency burst on Pro, off-hours (§2 Step 3).
6. Scripted E2E over governance/finance edge cases (§2 Step 4).
7. Don't forget the pending publication trim after prod deploy (memory `project_scale_readiness`).
