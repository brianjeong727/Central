## Probe the service, don't reason about its semantics (2026-08-18)

Working on the native OAuth latency fix, two of us independently concluded — from reading
`lib/oauth-account-guard.ts` — that stamping the Apple display name AFTER
`enforceOAuthAccountPolicy` would wipe the `central_signup` marker. The reasoning looked
airtight: the guard writes `{...existingMeta, central_signup: true}` to the DB via
`admin.auth.admin.updateUserById` but never assigns back to the in-memory
`user.user_metadata`, so a later spread of that stale object would omit the marker. The
predicted consequence was severe (a marker-less account deleted by signin-strict teardown
within 24h), so it went into a code comment as established fact.

It was wrong. `updateUserById` **MERGES** top-level `user_metadata` keys; only an explicit
`null` deletes one. A throwaway-user probe settled it in one call: writing `{name}` alone
left `central_signup: true` intact.

The placement decision (stamp BEFORE the guard) survived on better grounds — it is safe
under both merge and replace semantics, it reproduces the pre-change ordering, and the
guard provably never reads `name`. But the codebase had briefly acquired a confident,
false mechanism in an auth file, which is the worst place for one: the next person to touch
that ordering would have trusted it.

**The rule:** when a decision turns on how an EXTERNAL service behaves — GoTrue, PostgREST,
Storage, a Capacitor plugin — probe it. Do not derive it from our calling code, however
clearly our code reads. Our source shows what we send, never what the service does with it.
A one-call throwaway probe is cheaper than a wrong comment, and far cheaper than the change
that comment later licenses.

Corollary for comments: a comment asserting external behaviour should say how it was
established. "Probed 2026-08-18: updateUserById merges top-level keys" ages honestly;
"stamping after would clobber the marker" does not.

Related: [[search-path-pin-does-not-propagate]] — same shape, a Postgres behaviour that had
to be probed rather than reasoned about.
