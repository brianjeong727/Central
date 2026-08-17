import { test, expect } from "@playwright/test"

// Native launch-splash release (components/native-splash-release.tsx + lib/native-splash.ts).
//
// capacitor.config.ts sets `launchAutoHide: false`, so the plum native splash stays up
// until the web layer calls SplashScreen.hide(). That call used to live ONLY inside
// EntrySplash, which mounts on /home and /login — so any cold launch that routed
// elsewhere (/ministries with no ministry yet, /complete-profile, /pending,
// /pick-ministry, /onboarding, /admin) hung on the static splash forever. This spec is
// the regression guard: every route must reach the release path in the native shell.
//
// The observable signal is the lazily-imported @capacitor/splash-screen chunk being
// fetched — it is requested if and only if hideNativeSplash() runs. No auth needed:
// these are the signed-out entry routes, which is exactly the stranded-user case.

const SHELL_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CentralShell"

const isSplashChunk = (url: string) => /splash/i.test(url)

// Signed-out routes reachable on a cold launch. /ministries and /signup are the ones
// that mount no EntrySplash — they are the actual regression targets.
const ROUTES = ["/", "/login", "/ministries", "/signup"]

test.describe("native splash release", () => {
  test.use({ storageState: { cookies: [], origins: [] }, userAgent: SHELL_UA, viewport: { width: 390, height: 844 } })

  for (const route of ROUTES) {
    test(`releases the native splash on ${route}`, async ({ page }) => {
      const chunks: string[] = []
      const errors: string[] = []
      page.on("request", (r) => { if (isSplashChunk(r.url())) chunks.push(r.url()) })
      page.on("pageerror", (e) => errors.push(e.message))

      await page.goto(route, { waitUntil: "networkidle" })
      // The release is deferred one macrotask so EntrySplash can claim the handoff first.
      await expect.poll(() => chunks.length, { timeout: 10_000 }).toBeGreaterThan(0)
      expect(errors, `page errors on ${route}`).toEqual([])
    })
  }
})

test.describe("web is untouched", () => {
  // Plain web has no native splash — the capacitor bridge must never be pulled in on a
  // route that doesn't mount EntrySplash.
  test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 1440, height: 900 } })

  test("does not load the capacitor splash chunk on /ministries", async ({ page }) => {
    const chunks: string[] = []
    page.on("request", (r) => { if (isSplashChunk(r.url())) chunks.push(r.url()) })

    await page.goto("/ministries", { waitUntil: "networkidle" })
    await page.waitForTimeout(1500)
    expect(chunks).toEqual([])
  })
})
