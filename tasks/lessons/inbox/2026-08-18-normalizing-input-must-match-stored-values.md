## Input normalization must match the alphabet of ALREADY-STORED values (2026-08-18)

Invite codes moved to Crockford Base32, whose input rule folds `I`/`L`→`1` and `O`→`0` so a
misread poster still resolves. `joinMinistryByCode` was switched to normalize with it.

Every code already in the database came from `Math.random().toString(36)` — base36, which
uses **all 26 letters**. So a stored code like `MERCYO2`, typed correctly by the user,
normalized to `MERCY02` and no longer matched its own row. ~40.7% of six-char base36 codes
contain at least one of I, L or O (1 − (33/36)^6), so about two in five ministries would
have silently lost their invite code — on the manual-entry path, which was supposed to be
the safe fallback.

The new format was fine. The migration was the bug: a fold is a lossy map, and applying it
to lookups against values minted under a WIDER alphabet silently unmatches them.

**Rule:** when changing how input is normalized before a lookup, check the alphabet of the
values already stored, not just the new generator's. If they differ, either rotate the data
in the same change, or keep a clearly-labelled legacy retry
(`legacyLookupVariant` in `lib/invite-code.ts`) with a delete-me condition stated in the
comment. Never assume new-format validation is safe just because the generator changed —
the rows predate it.
