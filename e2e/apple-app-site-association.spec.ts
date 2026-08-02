// The apple-app-site-association (AASA) contract.
//
// This file is what authorizes iOS Password AutoFill inside the native WKWebView
// shell (see app/.well-known/apple-app-site-association/route.ts). Apple's fetcher
// is unforgiving and SILENT: any redirect, any auth gate, or a Content-Type other
// than application/json means the domain simply fails to validate, autofill stays
// broken in the app, and nothing anywhere reports an error.
//
// The realistic regression is proxy.ts: its matcher intercepts everything not
// explicitly excluded, so a future edit to that negative lookahead would re-gate
// this path and quietly kill autofill. These assertions exist to catch that.
//
// Runs unauthenticated ON PURPOSE — no storageState. Apple fetches this with no
// cookies, so that is the only meaningful way to test it.
import { test, expect } from "@playwright/test"

const AASA_PATH = "/.well-known/apple-app-site-association"

test.describe("apple-app-site-association", () => {
  // Override the chromium project's default storageState (playwright.config.ts pins
  // ADMIN_STATE on every project). Apple fetches the AASA with no cookies at all, so
  // an authenticated run would not be testing the thing that matters — and /login
  // redirects to /home for a signed-in user, hiding the form entirely.
  test.use({ storageState: { cookies: [], origins: [] } })

  test("served unauthenticated as JSON, with no redirect and no auth gate", async ({ request }) => {
    // maxRedirects: 0 — a 3xx here is a FAILURE, not something to follow. Apple
    // does not follow redirects, so a "working" URL that only works after a hop
    // is a broken AASA.
    const res = await request.get(AASA_PATH, { maxRedirects: 0 })

    expect(res.status(), "must be a bare 200 — no redirect, no login bounce").toBe(200)
    expect(res.headers()["content-type"] ?? "", "Apple rejects any non-JSON content type")
      .toContain("application/json")
    expect(res.headers()["location"], "must not redirect").toBeUndefined()
  })

  test("declares exactly one webcredentials appID for the shell bundle", async ({ request }) => {
    const body = await (await request.get(AASA_PATH, { maxRedirects: 0 })).json()

    // webcredentials is the half that enables password autofill. applinks is
    // deliberately ABSENT — adding it would turn every joincentral.app URL into a
    // Universal Link and change how iOS opens them.
    expect(Object.keys(body)).toEqual(["webcredentials"])

    const apps: string[] = body.webcredentials.apps
    expect(apps).toHaveLength(1)
    // <10-char Apple Team ID>.<bundle id from capacitor.config.ts>
    expect(apps[0]).toMatch(/^[A-Z0-9]{10}\.app\.joincentral$/)
  })

  test("the login form still carries the attributes autofill keys off", async ({ page }) => {
    await page.goto("/login")

    // Both viewport branches render simultaneously (hidden md:block / md:hidden),
    // so scope to the visible one — and assert there is exactly one of each, since
    // a duplicate id/name pair in the same form is what confuses password managers.
    const email = page.locator('input[type="email"][name="email"]').filter({ visible: true })
    const password = page.locator('input[name="password"]').filter({ visible: true })

    await expect(email).toHaveCount(1)
    await expect(password).toHaveCount(1)
    await expect(email).toHaveAttribute("autocomplete", "email")
    await expect(password).toHaveAttribute("autocomplete", "current-password")
  })
})
