## An OAuth display name is written ONCE, at mint — auth metadata updates never reach `profiles` (2026-08-15)

`handle_new_user()` sets `profiles.name` to
`COALESCE(raw_user_meta_data->>'name', split_part(email,'@',1))` on the AFTER INSERT
trigger, and **nothing ever revisits it**. `auth.users.raw_user_meta_data`, by contrast,
is overwritten on EVERY sign-in with the current provider's claims. The two drift
permanently, and the profile keeps whatever was true at the instant of the mint.

That produced a bug that looked impossible from the data: a real user's
`raw_user_meta_data` read `{"name": "Caleb S.", "full_name": "Caleb S."}` while his
`profiles.name` read `captkidjr` — the email prefix. Nothing was broken at read time;
the two rows were written years apart in flow terms. He had signed UP with Apple (which
returns a name only on the FIRST authorization ever, and never inside the identity
token — so Supabase had nothing to store and the trigger fell back to the prefix), then
later signed IN with Google, which refreshed the metadata and touched nothing else.

Three things to carry forward:

1. **Never diagnose a display-name bug from `raw_user_meta_data`.** It shows the LAST
   provider to authenticate, not what the profile was built from. Join to `profiles` or
   you will conclude the name is fine.
2. **A mint-time trigger needs a reconcile step at every entry point**, not just signup.
   `lib/profile-name.ts::reconcileProfileName()` runs from both `/auth/callback` and
   `verifyNativeOAuthSession` on sign-IN as well as sign-up — which is the only reason
   accounts minted before it existed repair themselves rather than needing a backfill
   migration.
3. **`provider === "apple"` in `raw_app_meta_data` does not mean the token came from
   Apple.** That field records the FIRST linked provider; the `iss` claim inside
   `raw_user_meta_data` records the most recent one. Caleb's row said `apple` with
   `iss: accounts.google.com`. Read `iss` when you want to know who just signed in.

Related: the "name === email local part" predicate was previously scoped to
`@privaterelay.appleid.com` because the general form re-gated ~200 load-test profiles.
Requiring the name to be a LONE token (no whitespace) is what made it safe to generalise
— every real full name has a space, so the rule catches the fallback and nothing else.
See [[proxy-completeness-gate]].
