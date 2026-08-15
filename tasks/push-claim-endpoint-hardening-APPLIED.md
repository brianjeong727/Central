# Harden `claim_push_endpoint` into a web-push-only entry point (APPLIED to prod)

**Applied:** 2026-08-15 to Central prod (`wgqpnilaokfipocsugqo`), migration `claim_push_endpoint_web_only_guards`.
**Branch:** `perf/chat-instant-load` (unrelated workstream — the fix could not wait for a tidier branch; the DB change is already live).
**Origin:** surfaced by a RETROACTIVE `rls-reviewer` pass over the Android push migrations, which had shipped without the mandatory gate. It is a self-inflicted regression: see below.

## What went wrong

The Android work (2026-08-14, PR #302) widened `push_subscriptions_keys_check` so that
NULL `p256dh`/`auth` are legal for `android-native`, not just `ios-native`. Correct in
isolation — a native token has no web-push keypair.

But that CHECK was, **by accident, the only thing stopping a forged native row** from
being written through a *different* function. `claim_push_endpoint` — the WEB push
claim — accepts a fully client-supplied `p_endpoint` AND `p_platform` with no
validation, unlike its sibling `claim_native_push_token` (which whitelists the platform
and derives the `apns:`/`fcm:` prefix server-side). Before the widening, NULL keys were
illegal for `android-native`, so the forgery bounced off the constraint.

Probed as `authenticated` after the widening:

```
claim_push_endpoint('fcm:FORGED', NULL, NULL, 'android-native', 'ua')  → ALLOWED
```

The row then routes through the FCM lane in `app/api/push/dispatch/route.ts`, delivering
to an attacker-chosen device token.

**The lesson, generalised:** widening a CHECK constraint can remove a guarantee that some
*other* code path was silently depending on. Grep for every writer of the table, not just
the one the migration is about. Captured as
`tasks/lessons/inbox/2026-08-15-widening-a-check-can-disarm-a-guard-elsewhere.md`.

## The fix

Three guards in `claim_push_endpoint`, so the invariant lives in the function that owns
it rather than in a constraint that exists for another reason:

```sql
-- 1. web platforms only (native tokens have their own RPC)
IF p_platform IS NULL OR p_platform NOT IN ('web', 'ios-pwa') THEN RAISE EXCEPTION …
-- 2. endpoint namespace: Web Push endpoints are absolute https URLs by spec
IF p_endpoint IS NULL OR p_endpoint !~ '^https://' THEN RAISE EXCEPTION …
-- 3. an undeliverable subscription is not worth storing
IF p_p256dh IS NULL OR length(p_p256dh) = 0 OR p_auth IS NULL OR length(p_auth) = 0 THEN RAISE EXCEPTION …
```

Guard 2 exists because guards 1 + 3 alone were **not enough** (caught in the reviewer's
pre-apply pass): `claim_push_endpoint('apns:<victim token>', <self-made keys>, 'web')`
satisfies both, still reaches the cross-endpoint `DELETE`, unbinds another tenant's
device, and leaves a row that can never be pruned — a malformed endpoint fails as a
non-`WebPushError`, so `status = 0`, which is neither the 404 nor the 410 the dispatch
route prunes on. Each push lane now owns its endpoint namespace exclusively.

Applied as `CREATE OR REPLACE` with a **byte-identical signature**, NOT drop+create, so
`proacl` carries over in place. That specifically avoids repeating the trap the Android
migration fell into: a fresh `CREATE` picks up Supabase's `ALTER DEFAULT PRIVILEGES`
grant to `anon`, and `REVOKE … FROM PUBLIC` does not remove a named-role grant.
`SET search_path` is re-stated because `proconfig` is replaced, not merged.

## Verified post-apply (rollback-wrapped probes, zero residue)

- ACL still exactly `{postgres, authenticated, service_role}`; `anon` absent; anon over HTTP → `401 42501`.
- `proconfig = search_path=public, pg_temp` survived on both claim functions.
- The forged `android-native` row is now refused, with AND without keys — the widened CHECK is no longer load-bearing.
- The `apns:<victim token>` attack raises **before** the DELETE: a seeded victim row in another ministry survives with owner, ministry and user-agent intact. Bypass shapes also refused — `http://`, uppercase `HTTPS://`, and an `'apns:x\nhttps://y'` newline smuggle (Postgres `^` is string-anchored, not line-anchored).
- Real paths intact: `web` and `ios-pwa` subscribe end-to-end through PostgREST; an existing production subscriber re-subscribes; legitimate shared-device handoff still rebinds.
- `claim_native_push_token` bit-for-bit unchanged; legacy 2-arg named call still `204`.
- `e2e/fixtures.ts:280` seeds with the service client and bypasses this RPC, so no spec touches the tightened path.

## Known remaining, NOT fixed here (Brian's call)

- **warn-1 — cross-tenant rebind via the unqualified `DELETE … WHERE endpoint = ?`.** Present in BOTH claim functions and predates all of this. Someone holding a victim's *legitimate* device identifier can rebind it to themselves. Impact is availability + misdelivery of the attacker's own notifications, never a read across tenants; the identifier is not readable via RLS; it self-heals on the victim's next launch. Options: accept-and-document, or gate on `last_seen_at` staleness. **Do NOT narrow to same-ministry** — that breaks genuinely shared-device handoff.
- **note-1 — `anon` holds inert table-level INSERT/UPDATE/DELETE grants on `push_subscriptions`.** All four policies are `TO authenticated`, so it is currently unreachable. Same belt already tightened for announcements in `20260811200407 revoke_anon_writes_on_announcements`. One-liner when convenient.
