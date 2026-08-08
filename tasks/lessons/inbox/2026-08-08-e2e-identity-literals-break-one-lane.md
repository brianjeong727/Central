## Never hardcode a sandbox identity in an e2e spec — derive it (2026-08-08)

**What happened.** `e2e/chat-nicknames.mobile.spec.ts` hardcoded
`const MEMBER = "E2E Member 2"`. There are TWO sandbox lanes — "E2E Sandbox"
(E2E Admin / E2E Member) and "E2E Sandbox 2" (E2E Admin 2 / E2E Member 2) — and a
slot's `.env.local` picks one. So that spec passed on lane 2 and failed **four
tests** on lane 1, on a slot where nothing about nicknames was broken.

It cost real time: the failures landed in the middle of an unrelated change and
looked like a regression from it. Ten minutes went into proving the roster
rendered correctly before noticing the roster showed "E2E Member" and the spec
wanted "E2E Member 2".

**The rule.** `e2e/fixtures.ts` already exports `ministryName()`, `adminName()`
and `memberName()` for exactly this, and its own comment says specs asserting on
displayed identity must derive rather than hardcode. Use them. A literal identity
string in a spec is a lane-specific landmine.

**The tell:** a failing assertion whose expected and actual differ only by a
trailing " 2" (or whose actual is the un-suffixed name) is this, not your code.

**Corollary:** a suite that is normally red on one lane trains everyone to ignore
red, and a real regression then lands in that noise and gets waved off — which is
the reason the fixtures grew those helpers in the first place.
