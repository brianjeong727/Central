## A guard gated on `swrData?.enabled` silently DOESN'T RUN — and reads as protection while it doesn't (2026-08-16)

The display-name profanity filter was written the way the chat composer writes it:

```ts
if (modSettings?.enabled) { …moderate… }
```

`modSettings` comes from SWR. On the realistic path for this surface — open Edit, type a
name, hit Save — that SWR has frequently not resolved, so `modSettings` is `undefined`,
the optional chain is falsy, and **the filter is skipped entirely**. No error, no log,
no visible difference. The name saves.

The copied pattern was fine at its origin and wrong here, and the reason is worth
keeping: the composer sends MANY messages over a cache that warms in milliseconds, so a
missed first send is negligible and self-correcting. A display name is saved ONCE,
deliberately, often within a second of the screen opening — precisely the window where
the cache is cold. **The same code has different safety properties depending on how
often the surface is used.** Copying a guard from a high-frequency surface to a
one-shot one silently changes what it guarantees.

Why this is worse than having no filter at all: an absent filter is honest. A filter
that no-ops is a claim of protection that isn't true — it survives code review (the call
is right there), it survives a demo (paste an obvious slur after the page has been open a
while and it blocks correctly), and it fails exactly when someone acts fast.

**Rule: a guard must never be gated on data that may not have arrived.** Either resolve
the dependency at the point of use (`await mutate()` the SWR, then evaluate), or fall
back to the safe default. Here: resolve at save, fall back to `MODERATION_DEFAULTS`
(`enabled: true`) only if that read fails. `x?.enabled` in a security-or-safety position
is a smell — it silently means "off" whenever `x` is late.

**How it was caught, which is the transferable part.** The Tier-2 enforcer flagged the
SHAPE as a low-priority note ("moderation is skipped before the SWR resolves — same shape
as the composer"), and the engineer's own spec for the feature was reported green. Neither
alone would have stopped it. Re-running the spec rather than trusting the report turned
the note into a reproducible failure. A note about a race is worth spending one test run
on, because a race is exactly the class of defect that a self-report cannot see.

See [[screenshot-after-an-edit-can-be-a-stale-compile]] — same root discipline: verify the
claim, don't accept the report.
