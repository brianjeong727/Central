## Widening a CHECK can disarm a guard in code you never touched — grep every WRITER, not just the caller you're changing (2026-08-15)

**What happened.** Adding Android push meant `push_subscriptions` had to accept a second
native platform, so `push_subscriptions_keys_check` was widened: NULL `p256dh`/`auth`
became legal for `android-native`, not just `ios-native`. Correct in isolation — a native
device token has no web-push keypair — and the migration was probed against the function
it was written for (`claim_native_push_token`), which passed everything.

The constraint was also, by accident, the only thing stopping a forged row from being
written through a **different** function. `claim_push_endpoint` (the WEB claim) takes a
fully client-supplied endpoint AND platform with no whitelist. Before the widening, the
forgery bounced off `keys_check`. After it:

```
claim_push_endpoint('fcm:FORGED', NULL, NULL, 'android-native', 'ua')  → ALLOWED
```

…and the dispatch route then delivers to an attacker-chosen token. Nothing in the diff
touched `claim_push_endpoint`; the diff removed the invariant it was leaning on.

**The tell.** A CHECK constraint that enumerates values from ONE domain (`platform`) while
gating columns from ANOTHER (`p256dh`/`auth`) is not really a data-integrity rule — it is
an authorization rule wearing a constraint's clothes, and something upstream is depending
on it. Ask: *if this constraint were dropped entirely, which code paths would become
exploitable?* If the answer is "some function I'm not editing," the guard belongs in that
function, explicitly.

**The rule.** Before widening or dropping a CHECK, `grep` for **every writer of the table**
— not just the writer the migration is about — and probe each one against the NEW
constraint. Here that meant both `claim_*` functions; the sibling was the one that broke.
The fix moved the invariant into the function that owns it (platform whitelist + endpoint
namespace + required keypair), so it no longer depends on a constraint that exists for a
different reason.

**Second-order trap, found the same day:** the obvious half-fix is not enough. Whitelisting
the platform and requiring the keypair still allowed
`claim_push_endpoint('apns:<victim token>', <self-made keys>, 'web')` — both gates satisfied,
still reaching the cross-endpoint `DELETE` and unbinding another tenant's device, leaving a
row that can never be pruned (a malformed endpoint fails as a non-`WebPushError`, so
`status = 0` — neither the 404 nor the 410 the dispatch route prunes on). The endpoint
NAMESPACE needed its own guard (`^https://`) so each push lane owns its prefix exclusively.
When two lanes share a table, the discriminator column is not enough — the key has to be
partitioned too.

**And the meta-lesson:** this was found by a RETROACTIVE `rls-reviewer` pass, because the
migration shipped without the mandatory gate. The reviewer also caught the half-fix in its
pre-apply pass, before it reached the database. The gate is mandatory for exactly this
class: a change that is locally correct and remotely breaking.

Related: [[adding-a-defaulted-rpc-param-needs-drop-and-create]]
