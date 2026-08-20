import { test, expect, devices } from "@playwright/test"

// The sign-in → sign-up handoff has to preserve what the user was doing.
//
// A rejected Google sign-in used to redirect to a BARE /login?error=no-account.
// The banner's "Create your account" CTA rebuilds its href from that URL, so a
// user who arrived from an invite link was dropped on a context-free /signup —
// the "How are you joining?" chooser, with no invite attached — and every retry
// returned them to what looked like the start. Reported from the field
// 2026-08-19 as an endless loop back to the create-account page.
//
// These assert the two halves that are reachable without a live Google round
// trip: the CTA carries the context, and that context lands on the member form.

test.use({ storageState: { cookies: [], origins: [] } })

const CODE = "H1HVZ3NEM7"

test("no-account banner CTA carries intent + invite through to signup", async ({ page }) => {
  await page.goto(`/login?error=no-account&intent=join&invite=${CODE}`, { waitUntil: "networkidle" })
  const cta = page.getByRole("link", { name: /create an account/i }).locator("visible=true").first()
  await expect(cta).toBeVisible({ timeout: 20_000 })
  const href = await cta.getAttribute("href")
  expect(href, "the CTA must not drop the invite").toContain(`invite=${CODE}`)
  expect(href).toContain("intent=join")
})

test("signup?intent=join opens the member form, not the role chooser", async ({ page }) => {
  await page.goto(`/signup?intent=join&invite=${CODE}`, { waitUntil: "networkidle" })
  await expect(page.getByText("Create your account.", { exact: false }).locator("visible=true").first())
    .toBeVisible({ timeout: 20_000 })
  // The chooser is the extra hop that made a rejection feel like square one.
  await expect(page.getByText("How are you joining?", { exact: false })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /Google/i }).locator("visible=true").first()).toBeVisible()
})

test("mobile — same handoff", async ({ browser }) => {
  const ctx = await browser.newContext({ ...devices["iPhone 14 Pro"], storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await page.goto(`/signup?intent=join&invite=${CODE}`, { waitUntil: "networkidle" })
  await expect(page.getByText("Create your account.", { exact: false }).locator("visible=true").first())
    .toBeVisible({ timeout: 20_000 })
  await expect(page.getByText("How are you joining?", { exact: false })).toHaveCount(0)
  await ctx.close()
})

// A stranded OAuth code must NOT be labelled a sign-in.
//
// Supabase substitutes the bare Site URL for any redirect_to its allowlist does
// not recognise, so the provider round trip comes back to `/?code=…` with our
// flow marker gone. proxy.ts forwards that into the guarded callback — and it
// used to stamp flow=signin on the way, which made the mint guard tear down
// every fresh signup that arrived this way. At launch the allowlist held the
// apex while the site 307s every visitor to www, so that was EVERY web OAuth:
// the account was created and deleted within three seconds, over and over.
//
// The recovery still has to run (the code must be exchanged and the user given a
// verdict) — it just must not assert something it cannot know.
test("a stranded OAuth code is forwarded as flow=stranded, never signin", async ({ request }) => {
  const res = await request.get("/?code=stranded-code-fixture", { maxRedirects: 0 })
  expect(res.status(), "a code-bearing root request must be forwarded, not rendered").toBe(307)
  const location = res.headers()["location"] ?? ""
  expect(location).toContain("/auth/callback")
  expect(location).toContain("code=stranded-code-fixture")
  expect(location, "a lost marker must never be reported as a sign-in").not.toContain("flow=signin")
  expect(location).toContain("flow=stranded")
})

test("an explicit flow survives the stranded-code recovery untouched", async ({ request }) => {
  const res = await request.get("/?code=fixture&flow=signin", { maxRedirects: 0 })
  expect(res.status()).toBe(307)
  const location = res.headers()["location"] ?? ""
  expect(location, "the recovery only fills in a MISSING flow").toContain("flow=signin")
  expect(location).not.toContain("flow=stranded")
})
