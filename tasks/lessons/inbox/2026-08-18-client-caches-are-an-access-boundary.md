## A client-side cache is an access-control surface, not just a perf trick (2026-08-18)

Caching chat transcripts outside React (`app/home/chat-thread-cache.ts`) made reopening
a room instant. It also, in its first cut, kept painting a room's history to someone who
had just left it or been removed from it.

**The mechanism is worth memorising because it is not obvious: RLS reports "you can see
nothing here" as an EMPTY ARRAY, not an error.** So the natural-looking guard

```ts
if (server.length === 0) return local   // "nothing came back, keep what we had"
```

is precisely the line that turns a cache into a leak. Every revalidation after access
loss returned `[]`, kept the cached transcript, and the write-through then re-stamped it
fresh so the TTL never expired it either.

Rules that came out of it, applicable to ANY client cache of tenant data:

1. **An empty successful response is a signal, not a non-event.** Decide explicitly what
   it means before writing the cache. Here the ratified rule is "the server wins for the
   time range it reports on" — an empty window clears the room, except for rows the user
   has not sent yet.
2. **Every path that drops access must evict.** We had two user-facing leave paths and
   only wired one; `chat-permissions.ts` exists so those two can never diverge on *who
   may* leave, and the cache has to be held to the same standard on *what leaving does*.
   Removal-by-an-admin and group-deleted-by-someone-else have NO local signal at all —
   those need a set-difference against the refreshed membership list.
3. **An in-flight fetch outlives an eviction.** A request issued before the eviction
   lands ~200ms after it and writes the transcript straight back. Guard writes with an
   epoch bumped on evict.
4. **Never cache optimistic rows.** They are live UI state, not facts. Cached, an
   `optimistic-*` row is "already known" on the next open, so the rule meant to protect
   in-flight sends keeps it FOREVER, beside the real server copy — "tap send, tap back"
   duplicated a message permanently.
5. **Instant paint can outrun a safety filter.** Blocked senders were filtered at render
   time from a cold SWR. While the transcript took ~700ms of round trips this never
   showed; painting at frame 0 made a previously-unreachable leak reachable. Any filter
   that protects a user must be *settled* before the thing it filters can paint.

**And a testing lesson:** gate on SETTLED, not on `isLoading`. SWR flips `isLoading` back
to true for every error retry, so gating UI on it means a permanently-failing query holds
that UI hostage forever rather than for one round trip. `data !== undefined || error !==
undefined` is the honest predicate — and it only works if the fetcher actually THROWS;
ours swallowed the query error and returned `[]`, which made a failed lookup
indistinguishable from "you have blocked nobody", failing open.
