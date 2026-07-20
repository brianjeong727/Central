import { test, expect } from "@playwright/test"

// Compact sidebar toggle — rail-bottom button collapses the 264px context panel
// to a rail-only shell. The pref persists per-user in profiles.compact_sidebar
// (NOT localStorage), so it must survive a full reload. The spec restores the
// expanded state at the end so other specs' panel assertions stay valid.

test.describe("compact sidebar — desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  // Resolves var(--shell-offset) as consumed by descendants of the shell root —
  // proves the .shell-compact re-declaration reaches the fixed overlays
  // (composer dismiss, chat settings, plan event) that align to it.
  const shellOffsetPx = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
      const host = document.querySelector('[class*="md:h-screen"]')!
      const probe = document.createElement("div")
      probe.style.position = "fixed"
      probe.style.left = "var(--shell-offset)"
      host.appendChild(probe)
      const x = probe.getBoundingClientRect().x
      probe.remove()
      return x
    })

  test("toggle collapses panel, persists across reload, re-expands", async ({ page }) => {
    await page.goto("/home")

    // Expanded baseline: context panel renders the Home-section item list.
    const overviewItem = page.getByRole("button", { name: "Overview" })
    await expect(overviewItem).toBeVisible({ timeout: 20_000 })
    expect(await shellOffsetPx(page)).toBe(340) // rail 72 + panel 264 + 4
    await page.screenshot({ path: "test-results/compact-sidebar-expanded.png" })

    // Collapse: panel unmounts, toggle flips to "Expand sidebar".
    await page.getByRole("button", { name: "Collapse sidebar" }).click()
    await expect(overviewItem).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible()
    // Rail itself stays (nav buttons still present). .first() — the hidden
    // mobile bottom-nav renders a same-name button, tripping strict mode.
    await expect(page.getByRole("button", { name: "Messages" }).first()).toBeVisible()
    expect(await shellOffsetPx(page)).toBe(76) // rail 72 + 4 — overlays hug the rail
    await page.screenshot({ path: "test-results/compact-sidebar-compact.png" })

    // Give the fire-and-forget profiles write a beat, then prove DB persistence:
    // a full reload must come back compact (no localStorage in this app).
    await page.waitForTimeout(1500)
    await page.reload()
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible({ timeout: 20_000 })
    await expect(overviewItem).toHaveCount(0)

    // Re-expand and confirm the panel returns (also restores state for other specs).
    await page.getByRole("button", { name: "Expand sidebar" }).click()
    await expect(overviewItem).toBeVisible()
    await page.waitForTimeout(1500)
  })
})
