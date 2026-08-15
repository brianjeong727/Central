## `last_seen_at` measures app launches, not deliverability — it can never justify a delete (2026-08-15)

After the APNs sender stopped pruning on `BadDeviceToken` (see
[[2026-08-15-pruning-on-error-deletes-the-evidence]]), rotated-away tokens became immortal. The
obvious cleanup was a reaper:

```sql
-- rejected
DELETE FROM push_subscriptions
WHERE platform IN ('ios-native','android-native')
  AND last_seen_at < now() - interval '30 days';
```

`last_seen_at` is written only by the `claim_native_push_token` / `claim_push_endpoint` RPCs —
i.e. **on app launch**. So "stale" means *the user hasn't opened the app*, which is precisely the
population push notifications exist to reach. That query silently disables notifications for
every dormant user, then they never open the app again because nothing notifies them.

Proven, not theorised: the one row that looked deadest — an `ios-native` token 32 days stale —
**accepted a real notification** when the dispatch was fired at it. It was a live device the
whole time. Under the OLD prune rule it had already been deleted once.

**The deeper reason no time-based rule works here:** `push_subscriptions` has **no device
identity** (no device id, no `updated_at`). The refinement "only reap a token SUPERSEDED by a
newer one for the same user" was also wrong for the same reason — nothing ties the newer row to
the same *device*. Probed: a live iPad dormant 60 days, next to a daily-use iPhone, gets deleted.

A failure counter is a worse trigger still: an expired `.p8` or a topic mismatch fails EVERY
send, so a "delete after N consecutive failures" rule deletes the entire fleet at once, exactly
when the server is broken. Keep counters as observability; never wire them to a delete.

**Rules:**

- **A "last activity" timestamp is not a liveness signal for the resource.** Ask what actually
  writes the column before treating it as evidence. Here it answers "did the user open the app",
  and was being read as "is this device reachable" — different questions.
- **Deletion needs positive evidence, and only the counterparty can supply it.** `410` /
  `Unregistered` is APNs saying the token is gone. Absence of activity is not.
- **Check the asymmetry before writing a cleanup job.** The dispatcher sends to ALL of a user's
  rows, so under-reaping is LOUD (a duplicate banner) and over-reaping is SILENT (no notification,
  no error). When one direction fails silently, bias hard against it.

Also settled in the same pass, worth keeping: **`APNS_ENV` was set to `sandbox` in production**,
so every TestFlight token was tried against Apple's development host, returned `BadDeviceToken`,
and was deleted. Confirmed from the live log line, not inferred. One deployment always serves BOTH
token populations (Xcode/`/sim` installs are sandbox, TestFlight/App Store are production), so the
sender tries both hosts — but point `APNS_ENV` at whichever population is LARGER, because the
other one pays an extra sequential APNs round-trip per notification.
