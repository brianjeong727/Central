## The reaction e2e specs fail each other when run in one command (2026-08-22)

`e2e/chat-reaction-tooltip.spec.ts`, `chat-reaction-details.mobile.spec.ts` and
`chat-reaction-preview.spec.ts` all pass **individually** and fail **in combination** — a different
test each run, which is the signature of shared state rather than a defect. Observed three runs:
once the tooltip's clipping test, once its keyboard-route test, once the Notifications toggle test
in the details spec (which has nothing to do with reactions at all).

**This is not caused by whatever you just changed.** Verified the boring way while restyling the
reaction pill: reverting `app/home/tabs/message-row.tsx` to `origin/main` and re-running the same
three specs together reproduced the same two failures. The change was innocent; the suite was not.

What they share: one sandbox tenant, the same admin and member profiles, and reaction rows on
groups they each seed. The details spec also writes the admin's `profiles.notification_settings`.
Locators like `[data-bottom-anchored] button` filtered by emoji-plus-digit are tenant-wide, so
another spec's leftover chat can satisfy them.

**Until this is fixed, when a reaction spec fails in a batch: re-run it alone before believing it.**
A red that goes green in isolation is telling you about the fixtures, not the code.

The real fix is fixture isolation — a per-spec group prefix that every locator is scoped to, the way
`e2e/mobile-overflow-sweep` scopes to `[data-open-groups]` — and cleanup that runs even when a test
throws. Worth doing before the next reaction feature adds a fourth spec to the pile.

Related: [[verify-a-negative-test-after-the-dev-server-recompiles]] — the other way an e2e result
lies about which code it is describing.
