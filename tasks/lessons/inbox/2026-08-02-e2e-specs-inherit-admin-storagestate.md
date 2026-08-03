## Every e2e spec is authenticated by default — an "unauthenticated" test must say so (2026-08-02)

`playwright.config.ts` pins `storageState: ADMIN_STATE` on BOTH the `chromium` and `mobile`
projects. So a spec that never calls `test.use({ storageState })` is not neutral — it runs as the
sandbox admin. A test written to check signed-out behavior silently checks signed-IN behavior
instead.

The failure is confusing rather than obvious. Testing that `/login` renders its form, the page
redirected to `/home` (correct behavior for a signed-in user) and the assertion failed with
`resolved to 0 elements` — which reads as "the markup is wrong", not "you are logged in". I lost a
cycle looking at the form before looking at the fixture.

**Why:** the project-level default is invisible from inside the spec file. `adminState` /
`memberState` are exported from `e2e/fixtures.ts` and specs opt IN to the member session, which
creates the false impression that opting in is how sessions get attached at all. There is no
opt-in for "nobody".

**How to apply:**
- A spec asserting signed-out behavior must explicitly clear the session:
  `test.use({ storageState: { cookies: [], origins: [] } })` at the describe level.
- Applies to anything testing: `/login` and `/signup` markup, public routes (`/`, `/ministries`),
  middleware redirects for anonymous users, and any endpoint whose whole point is that it works
  with no cookies (the AASA route, `/.well-known/*`, webhooks).
- The `request` fixture inherits storageState too. It happened not to matter for the AASA route
  (public either way), but do not rely on that — a public endpoint that ALSO behaves differently
  when authenticated would pass a test that never exercised the anonymous path.
- When an assertion fails with `0 elements` on a page you are sure renders, check whether the page
  redirected before blaming the selector. `page.url()` in the failure path answers it instantly.

Related: [[e2e-harness-targets-e2e-port]]
