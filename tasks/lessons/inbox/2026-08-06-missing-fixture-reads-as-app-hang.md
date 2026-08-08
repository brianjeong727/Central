## A missing test fixture reads exactly like an app hang (2026-08-06)

Five finance specs were red on `main` — `budget-fund-post` ×3,
`finance-allocation-workspace`, `finance-split-allocations` — every one of them
timing out at 30s on the same line:

```
Error: locator.selectOption: Test timeout of 30000ms exceeded.
  - waiting for locator('select')
    - locator resolved to <select>…</select>
    50 × waiting for element to be visible and enabled
```

That message reads as "the app rendered a disabled control" — a UI bug. It wasn't.
The `<select>` was visible and enabled the whole time. Playwright ALSO waits for
the requested **option** to exist, and reports that wait using the element's
actionability wording. The specs call `selectOption({ label: "DG Dinner" })`, and
the E2E tenant had **zero** `budget_categories`, so that option never appeared.

`budget-fund-post` had moved to isolated per-test categories (its own comment says
"no shared 'DG Dinner'") but three hardcoded `selectOption({label:"DG Dinner"})`
calls were left behind. Nothing created the row — not the specs, not
`scripts/seed-e2e.mjs`. Proven by inserting that single category and re-running:
**11/11 passed.**

**The rules this earns:**

1. **`selectOption` timing out does not mean the control is broken.** Check the
   option exists before you touch app code — `select` actionability and option
   existence share one error message.
2. **A fixture three spec files depend on belongs in the seed script, not a
   `beforeAll`.** It is tenant baseline, like the seeded users. `seed-e2e.mjs`
   already seeds `gender`/`graduation_year` for exactly this reason ("so a fresh
   re-seed stays green") — the same logic applies to any row a spec selects by a
   hardcoded label.
3. **When you stop depending on shared data, delete the references in the same
   pass.** This was a half-finished refactor: the isolation was added, the old
   hardcoded lookups were not removed, and the suite stayed green only until the
   tenant was re-seeded without that row.

Related: [[e2e-auth-rate-limit-looks-like-a-regression]].
