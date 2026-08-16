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
// The observable signal is SplashScreen.hide() actually being CALLED, via a stubbed
// Capacitor bridge. No auth needed: these are the signed-out entry routes, which is
// exactly the stranded-user case.
//
// It used to watch for the lazily-imported @capacitor/splash-screen CHUNK being
// fetched, matched as /splash/i against the request URL. That only ever worked in
// DEV, where Next serves module-path-named chunks; a production build content-hashes
// them (`b4e730e52e053025.js`), so no URL contains "splash" and all four route cases
// failed on unmodified main the moment they were run against `next start`. A guard
// that passes only under the dev server is not a guard — it silently stops covering
// the thing it exists for.
//
// Stubbing the bridge is also a STRICTER test: it asserts the contract (the splash is
// released) rather than an implementation detail of how the code got there, so it
// holds whether the release comes from the React effect or the inline first-paint
// script in app/layout.tsx.

const SHELL_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 CentralShell"

const isSplashChunk = (url: string) => /splash/i.test(url)

// Install a fake Capacitor bridge BEFORE any page script runs, and count hide()
// calls. Mirrors what the shell injects; on plain web there is no bridge at all,
// which is what the "web is untouched" case below relies on.
async function stubBridgeCountingHides(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    ;(window as unknown as { __hides: number }).__hides = 0
    ;(window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
      Plugins: {
        SplashScreen: {
          hide: () => {
            ;(window as unknown as { __hides: number }).__hides++
            return Promise.resolve()
          },
          show: () => Promise.resolve(),
        },
      },
    }
  })
}

const hideCount = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as unknown as { __hides: number }).__hides ?? 0)

// Signed-out routes reachable on a cold launch. /ministries and /signup are the ones
// that mount no EntrySplash — they are the actual regression targets.
const ROUTES = ["/", "/login", "/ministries", "/signup"]

test.describe("native splash release", () => {
  test.use({ storageState: { cookies: [], origins: [] }, userAgent: SHELL_UA, viewport: { width: 390, height: 844 } })

  for (const route of ROUTES) {
    test(`releases the native splash on ${route}`, async ({ page, context }) => {
      const errors: string[] = []
      page.on("pageerror", (e) => errors.push(e.message))
      await stubBridgeCountingHides(page)
      // RETURNING user. Without this the first-run branch takes over on the entry
      // routes: EntrySplash claims the splash and releases it through a dynamic
      // import() of the plugin rather than window.Capacitor.Plugins, which a stubbed
      // bridge cannot observe — so /login looked broken when it was working, and `/`
      // did too, because proxy.ts redirects `/` to /login under the shell UA.
      // First-run is covered separately by mobile-entry-b3.spec.ts (items 10a/10b).
      await context.addCookies([
        { name: "central_splash_seen", value: "1", url: "http://localhost:3001" },
      ])

      await page.goto(route, { waitUntil: "networkidle" })
      // The release is deferred one macrotask so EntrySplash can claim the handoff first.
      await expect.poll(() => hideCount(page), { timeout: 10_000 }).toBeGreaterThan(0)
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
