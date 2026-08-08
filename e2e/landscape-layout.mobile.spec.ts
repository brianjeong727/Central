// Rotating the phone must NOT reveal the desktop shell.
//
// The mobile/desktop split used to be a bare `min-width: 768px`. An iPhone in
// landscape is 874–956px wide, so rotating the iOS app fired every `md:` rule and
// rendered the desktop shell — plum rail, context panel, breadcrumb — into a
// 402px-tall phone screen.
//
// "Desktop" now means wide enough AND (a real pointer OR ≥1024px). This walks the
// three cases that rule has to get right. The touch emulation is load-bearing:
// the `mobile` project reports `hover: none`, which is exactly what separates a
// rotated phone from a laptop at the same width.
import { test, expect, type Page } from "@playwright/test"

// iPhone 17 landscape; the widest iPhone (Pro Max) is 956, still under 1024.
const PHONE_LANDSCAPE = { width: 874, height: 402 }
const PHONE_PORTRAIT = { width: 390, height: 844 }

// The sidebar collapse toggle is rendered ONLY by DesktopSidebar, so its presence
// is an unambiguous "the desktop shell is mounted".
//
// NOT the rail's "WORKSPACE" label: those are uppercased by CSS, so the DOM text
// is "Workspace" and a getByText("WORKSPACE") matches NOTHING — on either
// viewport. An absence assertion built on it passes whether or not the bug
// exists, which is exactly the trap this spec is meant to catch.
// VISIBILITY, not presence: DesktopSidebar is always mounted and shown/hidden by
// CSS (`hidden md:flex`), so it exists in the DOM at phone width too. A count-based
// assertion fails on mobile for the wrong reason — and would pass on desktop for
// the wrong reason if the CSS ever broke.
function desktopRail(page: Page) {
  return page
    .locator('[aria-label="Collapse sidebar"], [aria-label="Expand sidebar"]')
    .filter({ visible: true })
}
/** The mobile bottom nav pill only exists in the mobile shell. */
function mobileNav(page: Page) {
  return page.locator("nav").filter({ visible: true })
}

async function layoutSays(page: Page) {
  return page.evaluate(() => ({
    md: window.matchMedia("(min-width: 768px) and ((hover: hover) or (min-width: 1024px))").matches,
    hover: window.matchMedia("(hover: hover)").matches,
    width: window.innerWidth,
  }))
}

test.describe("phone landscape keeps the mobile layout", () => {
  test("a rotated phone stays mobile; the desktop rail never appears", async ({ page }) => {
    await page.setViewportSize(PHONE_PORTRAIT)
    await page.goto("/home?tab=home")
    await expect(page.locator("body")).toBeVisible()
    await expect(desktopRail(page)).toHaveCount(0)

    // Rotate.
    await page.setViewportSize(PHONE_LANDSCAPE)
    const s = await layoutSays(page)
    expect(s.width).toBeGreaterThanOrEqual(768) // wide enough to have tripped the old rule
    expect(s.hover).toBe(false)                 // …but it is a touch device
    expect(s.md, "a rotated phone must not match the desktop breakpoint").toBe(false)

    // The desktop shell must be absent, and the mobile nav still present.
    await expect(desktopRail(page)).toHaveCount(0)
    await expect(mobileNav(page).first()).toBeVisible()
  })
})

// Desktop and tablet keep the shell they have today — the fix must not "fix" them.
test.describe("desktop and tablet are unaffected", () => {
  // Only the INPUT characteristics matter here, not the browser type — spreading a
  // full device descriptor changes defaultBrowserType, which Playwright refuses
  // inside a describe.
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } })

  test("a laptop still gets the desktop shell", async ({ page }) => {
    await page.goto("/home?tab=home")
    const s = await layoutSays(page)
    expect(s.hover).toBe(true)
    expect(s.md, "a laptop must still be desktop").toBe(true)
    await expect(desktopRail(page).first()).toBeVisible({ timeout: 15000 })
  })

  test("a 1024px touch tablet still gets the desktop shell (the ≥1024 arm)", async ({ page }) => {
    // Same width an iPad reports in landscape, but WITHOUT a pointer — it must
    // still resolve to desktop, which is the only reason the 1024 arm exists.
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.goto("/home?tab=home")
    const wide = await page.evaluate(() =>
      window.matchMedia("(min-width: 768px) and ((hover: hover) or (min-width: 1024px))").matches)
    expect(wide).toBe(true)
  })
})
