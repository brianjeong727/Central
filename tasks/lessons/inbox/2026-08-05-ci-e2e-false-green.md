## The CI e2e job reports SUCCESS while running zero tests (2026-08-05)

`e2e (sandbox tenant)` in `.github/workflows/ci.yml` gates every step on a
secrets check:

```yaml
if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && [ -n "$E2E_PASSWORD" ]; then
  echo "enabled=true" >> "$GITHUB_OUTPUT"
else
  echo "enabled=false" >> "$GITHUB_OUTPUT"   # every later step: if: enabled == 'true'
fi
```

When the gate is false, steps 3–11 are skipped and the job still exits 0 — so the
check renders as a **green tick that means nothing**. `gh secret list` returns
empty (the repo is PUBLIC, so no secrets are configured), which means the suite
has never run in CI at all.

Confirmed by step-level inspection, not inferred:

```
2. Gate on sandbox credentials → success
3-11 (checkout … Run Playwright suite) → skipped
12. Complete job → success
```

The tell is DURATION: the job completes in ~5 seconds. A real run installs
Playwright, builds, boots a server, and runs 49 specs.

**Why it matters:** during the 2026-08-04 audit, `mobile-plan-workspace.spec.ts`
had been failing on `main` for a while (a real bug — see
[[nullable-column-vs-ts-string]]), and 3 more specs fail on `main` today. Every PR
in that window merged showing "e2e (sandbox tenant) ✓".

**Rules:**
1. Never read a green check as "the tests ran." Confirm a plausible DURATION, or
   the step list, before trusting an e2e signal — especially one gated on secrets.
2. A conditional-skip gate must not resolve to the same status as a pass. Either
   fail when the prerequisite is absent, or make the skip visibly distinct.
3. When a local spec fails but CI is green, suspect the CI job before suspecting
   the spec.

Open decision: whether to configure the secrets on a public repo (GitHub withholds
secrets from fork PRs, so it is defensible) or make the gate fail loudly instead.
