## A cleanup path that deletes on error erases both the registration and the evidence (2026-08-15)

Push notifications "didn't work" for a TestFlight user across several debugging
passes. The delivery path looked healthy at every checkpoint:

- the Postgres trigger fired — `net._http_response` showed 98 POSTs, all `200`
- the route resolved the recipient — `recipients: 1`
- and the response said `sent: 0, failed: 0, pruned: 0`

`failed: 0` is what made it unreadable. Nothing failed because there was nothing
left to try: an earlier dispatch had returned `failed:1, pruned:1` and DELETED the
user's `push_subscriptions` row. The app re-registered on next launch, the next
message pruned it again, and in between every dispatch reported a clean zero.

**The prune was the bug.** APNs `BadDeviceToken` was classified as "device is
dead", alongside `Unregistered`/410. But BadDeviceToken means *this token is not
valid for the host or topic you asked* — almost always a SERVER-side mismatch. One
deployment serves both token populations at once (an Xcode/`/sim` install
registers a SANDBOX token, TestFlight registers a PRODUCTION one), so whichever
host `APNS_ENV` names, the other population is rejected on arrival.

**Rules:**

- **Never delete a user's registration in response to an error the SERVER might be
  causing.** Deleting on `Unregistered`/410 is right — that is the device's own
  verdict. Deleting on a "wrong host/topic" error destroys a live registration on
  a config mistake, and the cost is asymmetric: keeping a dead row costs one failed
  send per message, deleting a live one costs every notification that user will
  ever receive.
- **A cleanup path that fires on error is self-concealing.** After it runs, the
  symptom changes from "failure" to "nothing to do", so the next observation looks
  healthy. If a counter can reach zero by having destroyed its own input, it cannot
  be read as success.
- **Never discard the provider's reason code.** `sendApnsNotification` returned
  only `{ok, prune}`; the `ApnsError.reason` was caught and dropped, so no log
  anywhere said *why*. A boolean is not a diagnosis. Log the reason (never the
  token or key).
- **`sent:0, failed:0` with `recipients:N` is a contradiction, not a pass.** N
  recipients resolved and zero send attempts means every subscription was filtered
  or missing — always worth an explicit branch, not a silent zero.

Diagnostic that finally cracked it: re-firing the dispatch for an ALREADY-SENT
message via `net.http_post` with the url/secret from `app_config`. It reproduces a
real send with no new user-visible message, and the response body carries the
counters.

Related: [[2026-08-06-missing-fixture-reads-as-app-hang]]
