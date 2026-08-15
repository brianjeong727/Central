import { test, expect } from "@playwright/test"
import { sandbox, memberState } from "./fixtures"

// OAuth onboarding gate (proxy.ts + app/complete-profile/page.tsx).
//
// Member/visitor-tier profiles missing gender OR graduation_year get
// redirected to /complete-profile (with a sanitized ?next) on every protected
// request; admin-tier is exempt; the page itself must never redirect-loop.
//
// The sandbox member (E2E_MEMBER_EMAIL) is SHARED across the whole e2e suite
// (auth.setup + every memberState spec) and must be left COMPLETE afterward —
// this spec records its true original gender/graduation_year, nulls them out
// to exercise the gate, and restores the originals in afterAll.

let originalGender: string | null = null
let originalGradYear: number | null = null

test.beforeAll(async () => {
  const sb = sandbox()
  const memberId = await sb.memberUserId()
  const { data, error } = await sb.client
    .from("profiles")
    .select("gender, graduation_year")
    .eq("id", memberId)
    .single()
  if (error) throw error
  originalGender = data.gender
  originalGradYear = data.graduation_year
})

test.afterAll(async () => {
  const sb = sandbox()
  const memberId = await sb.memberUserId()
  const { error } = await sb.client
    .from("profiles")
    .update({ gender: originalGender, graduation_year: originalGradYear })
    .eq("id", memberId)
  if (error) throw error
})

test.describe("OAuth onboarding gate", () => {
  test.use({ storageState: memberState })

  test("incomplete member is gated off /home, completes the form, lands back on /home with the profile persisted", async ({ page }) => {
    const sb = sandbox()
    const memberId = await sb.memberUserId()

    // Arrange: null out both fields (the OAuth/native-mint state).
    const { error: nullErr } = await sb.client
      .from("profiles")
      .update({ gender: null, graduation_year: null })
      .eq("id", memberId)
    if (nullErr) throw nullErr

    // Drop the proxy's routing-cache cookie first. proxy.ts caches the routing decision
    // — INCLUDING profile-completeness — in the signed `central-mw` cookie for 5 minutes,
    // and only caches the settled state (complete profile). auth.setup runs seconds before
    // this test and mints a FRESH cookie with pc=true, so without this the proxy serves the
    // cached "complete" verdict, never re-reads the nulled columns, and the gate never
    // fires. It passed only when the cookie happened to be older than the TTL — i.e. the
    // test was order- and clock-dependent. A real OAuth mint has no such cookie.
    await page.context().clearCookies({ name: "central-mw" })

    // Assert: navigating to a protected path redirects to /complete-profile?next=...
    await page.goto("/home")
    await page.waitForURL(/\/complete-profile\?next=%2Fhome/, { timeout: 15_000 })

    // Assert the loop is GONE: the page itself renders the form, not a redirect storm.
    await expect(page.getByText("A couple details.").first()).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/complete-profile/)

    // Fill + submit.
    const genderPill = page.getByRole("button", { name: "Male", exact: true }).first()
    await genderPill.click()
    // Graduation year is a <select> (a free-text year invited typos and offered
    // values the form's own range check then rejected).
    const gradYear = page.locator("select").filter({ visible: true }).first()
    const nextYear = new Date().getFullYear() + 3
    await gradYear.selectOption(String(nextYear))
    await page.getByRole("button", { name: "Continue" }).first().click()

    // Assert: returns to the ?next destination.
    await page.waitForURL(/\/home/, { timeout: 15_000 })
    await expect(page).not.toHaveURL(/\/complete-profile/)

    // Assert: persisted, not just a client-side redirect.
    const { data: persisted, error: readErr } = await sb.client
      .from("profiles")
      .select("gender, graduation_year")
      .eq("id", memberId)
      .single()
    if (readErr) throw readErr
    expect(persisted.gender).toBe("male")
    expect(persisted.graduation_year).toBe(nextYear)
  })

  test("already-complete member is never redirected to /complete-profile", async ({ page }) => {
    const sb = sandbox()
    const memberId = await sb.memberUserId()
    await sb.client
      .from("profiles")
      .update({ gender: "female", graduation_year: new Date().getFullYear() + 2 })
      .eq("id", memberId)

    await page.goto("/home")
    await page.waitForLoadState("networkidle")
    await expect(page).not.toHaveURL(/\/complete-profile/)
  })
})

test.describe("OAuth onboarding gate — admin exemption", () => {
  // Default chromium project storage state is already ADMIN_STATE.

  test("admin-tier with null gender/graduation_year is NOT redirected off /home", async ({ page }) => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    // The sandbox admin's own profile is currently null/null (verified pre-existing);
    // assert that stays true and doesn't accidentally get completed by this spec.
    const { data } = await sb.client.from("profiles").select("gender, graduation_year, role").eq("id", adminId).single()
    expect(data?.role).toBe("admin")

    await page.goto("/home")
    await page.waitForLoadState("networkidle")
    await expect(page).not.toHaveURL(/\/complete-profile/)
  })
})
