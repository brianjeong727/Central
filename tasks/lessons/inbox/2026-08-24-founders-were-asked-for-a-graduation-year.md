## A pastor registering a ministry was asked for their graduating class (2026-08-24)

**The trap.** `handle_new_user` hardcodes `role = 'member'` for EVERY new account —
deliberately, because the metadata role was forgeable and used to grant admin. A
ministry founder's real role (pastor/deacon/elder) is not written until
`submitMinistryApplication` runs at the very END of the registration wizard. So for
the whole of registration, a pastor is member-tier with no gender and no graduation
year — indistinguishable, to the completeness gate, from a student who just signed up.

`/onboarding` and `/register-ministry` were gate-exempt, so the happy path worked. Any
step outside them did not: the native shell reopening at `/home`, a link from an email,
coming back to an abandoned wizard. All of those hit `/complete-profile` and demanded a
graduating class from someone who has not been a student in twenty years — as the first
thing a new church sees of Central.

**The rule that fixes it.** The gate now waits until the user is actually IN a ministry
(`mid &&`). Nothing is lost by waiting: the only reason the cohort is collected up front
is so `autoAddUserToChats` can seat a member in their class chat at JOIN time, and since
2026-08-24 `/complete-profile` calls `changeClassChat` itself — so a member who joins
without a cohort gets the central chat, is gated on the very next request, and is seated
then. The founder is promoted out of member-tier by the wizard and is never asked.

**The second half: one predicate, one rule.** The member/visitor check lived in
`proxy.ts` only (`isMemberTier(role) && memberProfileIncomplete(...)`), so the PAGE never
knew the rule existed — reaching `/complete-profile` by any other route showed a pastor a
class-year picker and "Enter a valid graduation year" with no way past. The role check now
lives INSIDE `memberProfileIncomplete`, which both callers share. That module's own header
already said three places must agree or the result is "a REDIRECT LOOP or a dead end" —
and this was the dead end, sitting in the half of the rule that was never shared.

**Generalise.** When a predicate is shared "so the two can never disagree", every clause
of it must be inside. A caller-side `X && sharedPredicate(...)` is a private clause with a
public name, and it fails in exactly the direction the sharing was meant to prevent.

**Known, accepted:** the short-circuit means a non-member-tier profile is never asked for
a name either, even one derived from an email. That matches the gate's pre-existing
behaviour (admins were always exempt), and Profile → name is editable, so it is not a
dead end.

**Verified red first.** Both new cases in `e2e/young-adult-gate.spec.ts` fail on the
previous code with the real symptom — "founder mid-registration hitting /home landed on:
/complete-profile", "pastor deep-linking the form landed on: /complete-profile".
