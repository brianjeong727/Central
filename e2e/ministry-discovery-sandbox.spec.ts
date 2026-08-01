import { test, expect } from "@playwright/test"

// Test tenants must never appear in public ministry discovery — and REAL ministries
// must never be filtered out with them.
//
// `getPublicMinistries` (app/actions/ministry.ts) runs on the SERVICE-ROLE client, so
// RLS is not a backstop — its `.not("hidden_from_discovery", "is", true)` filter is the
// only thing standing between a signed-out visitor and every test tenant in the project.
// It used to filter on `status = 'active'` alone, which listed Brian's Sandbox, Load
// Test 200 and Crossroads to the whole internet.
//
// The both-directions assertion is the point. `hidden_from_discovery` and `is_sandbox`
// answer DIFFERENT questions — is_sandbox means "super may write-as here" and is TRUE of
// Central, a real ministry. An earlier pass gated on is_sandbox and correctly hid the
// test tenants while also delisting Central. Asserting only the negative would have
// called that a pass.
//
// Assertions are scoped to the browse LIST, never whole-page text: "Central" appears in
// the brand wordmark and the "DISCOVER · CENTRAL" eyebrow on every render, so a
// body.innerText check false-positives.

const TEST_TENANTS = ["Load Test 200", "Brian's Sandbox", "Crossroads College Ministry", "E2E Sandbox", "E2E Sandbox 2"]
// Real ministries that happen to be super-testable (Central) must stay discoverable.
const REAL_MINISTRIES = ["ACF", "Central"]

test.describe("ministry discovery hides test tenants", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("signed-out browse list hides test tenants but keeps real ministries", async ({ page }) => {
    await page.goto("/ministries", { waitUntil: "networkidle" })

    // The browse list renders client-side; wait for the section itself, not a timeout.
    const heading = page.getByText("Ministries you can join", { exact: false })
    await expect(heading).toBeVisible({ timeout: 15_000 })

    // Row names are the only h-weight text in the list; read them as discrete rows so a
    // brand-wordmark match elsewhere on the page can't pollute the assertion.
    const listText = await page.evaluate(() => {
      const body = document.body.innerText
      const start = body.toUpperCase().indexOf("MINISTRIES YOU CAN JOIN")
      if (start < 0) return ""
      const rest = body.slice(start)
      const end = rest.indexOf("Leading a ministry")
      return end > 0 ? rest.slice(0, end) : rest
    })

    expect(listText, "browse section should have rendered").not.toEqual("")
    for (const name of TEST_TENANTS) {
      expect(listText, `${name} must not be listed publicly`).not.toContain(name)
    }
    for (const name of REAL_MINISTRIES) {
      expect(listText, `${name} is a real ministry and must stay discoverable`).toContain(name)
    }
  })
})
