## Node's 4-thread libuv pool makes any concurrent HTTP measurement lie (2026-08-07)

**Symptom.** The load-test HTTP probe reported `get_chat_list` p95 5215ms, `directory_p1`
p95 5773ms, `next_home_auth` p95 8922ms — against a server that was actually answering in
~50ms. For three weeks this was written off in `scripts/loadtest/README.md` as "undici
connection-pool queueing, don't trust co-located HTTP numbers," and it nearly caused a
whole cloud-VM re-run to be planned around a client bug.

**Cause.** libuv's threadpool defaults to **4 threads**. `dns.lookup` runs on it, and
`fetch` uses `dns.lookup`. Under concurrency the DNS lookups queue, and that wait is
billed *inside* the measured request time — so client queueing is indistinguishable from
server latency in the numbers.

**Fix.** `UV_THREADPOOL_SIZE=64`. Same 6rps run, only that variable changed: p95s above
became 301ms / 706ms / 1083ms and client skips went 150 → 0. libuv reads the variable at
process start, *before* any JS runs, so setting `process.env.UV_THREADPOOL_SIZE` inside
the script is too late — you must re-exec (`ensureThreadpool()` in
`scripts/loadtest/lib.cjs`).

**The diagnostic that generalizes — this is the real lesson.** Run the same probe
strictly sequentially (concurrency 1). Sequential was clean: 353 requests, p50 48ms, p95
122ms, p99 333ms, zero stalls >1s. **Fast at concurrency 1 and slow at concurrency N is a
CLIENT symptom, not a server one.** The second tell: the stalls hit Supabase *and* Vercel
simultaneously — two unrelated hosts degrading in lockstep is never the servers.

**Corollaries for any load-measuring code.**
- A probe must **bound in-flight work and SKIP rather than queue.** If it queues, its own
  backlog is recorded as latency. Skips should be counted and reported separately so
  "the client couldn't keep up" never masquerades as "the server was slow."
- Never accept a performance explanation you haven't isolated. "Co-location caveat" was a
  plausible story that matched the evidence and was still wrong; one sequential run
  falsified it in 75 seconds.
- An append-only token store silently poisons things too: 154 expired JWTs from a prior
  run meant a random pick returned PGRST303 and zeroed the fixture bootstrap, so the
  write probes no-op'd while reporting success. Filter by `expires_at`, don't trust the
  store (`freshTokens()`).

Related: [[loadtest-split-box-topology]], `context/LOADTEST_CLOUD_VM_RESUME.md`.
