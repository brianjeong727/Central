## `young-adult-cohort.mobile.spec.ts` has been red on main since Profile v2 (2026-08-24)

Found while running the cohort specs around an unrelated fix. The spec drives
`getByRole("button", { name: /edit profile/i })` and times out after 3 minutes: Profile
v2 (`ae09273`) moved mobile editing in-place, and "Edit profile" now renders only in
the DESKTOP branch of `profile-tab.tsx`. That commit added `profile-v2.mobile.spec.ts`
but never updated this one.

Consequence: the young-adult chat MOVE — the thing that spec exists to guard, and which
its own header says shipped broken for months — is currently unguarded at phone width.

Not fixed here (it belongs to the Profile v2 workstream, not to a `/complete-profile`
change), but it is a real red test on `main`, not a flake: it fails the same way every
run, on the locator, before touching anything cohort-related.
