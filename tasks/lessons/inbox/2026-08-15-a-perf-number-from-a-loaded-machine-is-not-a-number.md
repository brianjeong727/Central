## A perf number from a loaded machine is not a number — verify the MECHANISM, not the clock (2026-08-15)

**What happened.** Chat loading was reported as ~10s on mobile. Measured it properly
first (production build, 4× CPU throttle, 6 Mbps/60ms) and got a clean baseline:
first API request at **+2,759 ms**, chat list usable at **3,589 ms**, while the
Postgres query for 50 messages was **6 ms**. Landed the fix, re-measured, and got
**9,224 ms** — apparently 2.5× WORSE.

It was not worse. `uptime` showed **load average 20.57**, and slot **s2 was running
its own Playwright suite** on the same machine. The tell was inside the numbers: the
JS chunks had downloaded *faster* (341ms vs 1153ms) while every API call *tripled*
(700ms → 2200ms). A real regression in server-seeded data cannot make the network
slower and the bundle faster at the same time — that shape is contention, not code.

I was one step from reporting a regression that did not exist.

**The rule.** On a machine that runs three slot worktrees plus their dev servers and
e2e suites, wall-clock is a shared resource and any single timing is unfalsifiable.
Before believing a perf delta:

- `uptime` and `pgrep -f playwright` FIRST. Load > ~4 on this box ⇒ timings are noise.
- Prefer **load-independent evidence of the mechanism**. Here that was: does the list
  appear in the SSR HTML (`curl` + grep for `unread_count`/`is_central_chat` — fields
  only the new mapper emits, distinguishing it from the pre-existing ChatPreview
  seed), and did `get_chat_list` go from 2 requests to 1. Both are counts and
  presence checks; neither moves with CPU load.
- If a timing is genuinely needed, take the **minimum** of several runs, not the mean
  — the minimum is the least contaminated by other tenants.

**Corollary — local SSR timings are structurally pessimistic.** This machine's Next
server talks to remote Supabase at 400-800ms RTT; on Vercel it is same-region single
digits. So moving a fetch from client to server looks bad locally and is strongly
positive in production. Never judge an SSR change on a laptop's absolute numbers.

**Same trap, second form:** three e2e specs "failed" in the same window. Two passed
in isolation; the third passed with `--timeout=120000` (19.2s of work against a 30s
budget). All three were the machine, not the diff — but the only way to know was to
re-run them isolated rather than reason about whether the diff could plausibly cause
it. **Re-run before you explain.**

Related: [[the-shipped-artifact-embeds-the-config-not-reads-it]]
