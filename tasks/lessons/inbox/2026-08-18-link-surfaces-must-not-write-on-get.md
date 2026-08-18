## A link that joins must never write on GET (2026-08-18)

Building `/j/<CODE>` (the one-scan invite link), the first draft joined the user as soon
as the page loaded — the "seamless" reading of the feature.

`joinMinistryByCode` is not additive. It does
`profiles.update({ ministry_id, role })` (`app/actions/ministry.ts`), so it MOVES the
caller's tenant and resets their role to `member`. Joining on mount therefore meant that
merely OPENING a link — from a text, an email, a QR sticker placed over a real one — would
relocate an existing member to another ministry, demote them, auto-enroll them in that
ministry's chats, and strand them as an "Unknown" member of their old one. No click
required.

The existing `/ministries` code-join was safe from this only by accident of interaction
design: the code must be TYPED, and `inviteCode` is `useState("")` never seeded from a
URL param. Turning that same action into a link converted an intentional act into a
navigation side effect.

**Rule:** any surface reachable by URL that calls a state-changing action must require an
explicit tap first, and when the action is destructive-by-replacement it must name what is
being replaced ("You're currently in A. Joining B makes it your active church"). Ask of any
new route: *if someone sent this URL to a user who did not want it, what happens?* If the
answer is anything but "they see a page", the write is in the wrong place.

Guarded by `e2e/invite-join-link.spec.ts` — it asserts `profiles.ministry_id` is unchanged
after the GET, and only changes after the tap.
