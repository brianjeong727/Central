import { test, expect } from "@playwright/test"
import { memberState } from "./fixtures"

// Regression for the Phase 2 role-tier refactor (lib/roles.ts): ~40 inline
// role-array checks across the app were mechanized into isAdminRole /
// isLeaderRole / etc. predicates. This spec pins the observable GATING
// behavior those predicates drive, so a future refactor of lib/roles.ts (or a
// stray re-inlined role array) trips a real test instead of silently
// regressing access control.
//
// Two gates are exercised:
//  1. Settings tab (admin-tier, CLAUDE.md Convention #2 `isAdmin`) — gated at
//     the very top of home-app.tsx (`activeTab === "settings" && isAdmin`),
//     so a non-admin hitting ?tab=settings gets NO SettingsTab mount at all
//     (not a redirect — the content slot for that tab simply never renders).
//  2. Announcements "New announcement" affordance (leader-tier, `isLeaderOrAdmin`)
//     — the tab itself renders for everyone, only the create affordance is
//     conditional.
//
// Note: "General" / "People" as settings-tab-strip labels collide with the
// desktop sidebar nav's own "People" link and other chrome, so this spec
// asserts on admin-EXCLUSIVE strip tabs (Governance, Audit Log — only pushed
// into settings-tab.tsx's TABS array `...(isAdmin ? [...] : [])`) plus a
// page-unique content string, rather than ambiguous shared-vocabulary labels.

test.describe("role gates — admin", () => {
  // Default chromium project storage state is already ADMIN_STATE.

  test("settings tab is reachable and renders the ministry admin surface", async ({ page }) => {
    await page.goto("/home?tab=settings")

    // Admin-only sub-tabs from settings-tab.tsx's TABS array — presence
    // proves the real admin SettingsTab mounted, not a stub/placeholder.
    await expect(page.getByRole("button", { name: "Governance" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Audit Log" })).toBeVisible()

    // Page-unique content string from the General tab's Ministry Profile
    // section — confirms actual settings content rendered, not just chrome.
    await expect(page.getByText("Ministry Identity")).toBeVisible()
  })

  test("announcements tab shows the create affordance", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await expect(page.getByRole("heading", { name: "Announcements" })).toBeVisible()
    await expect(page.getByRole("button", { name: "New announcement" })).toBeVisible()
  })
})

test.describe("role gates — member", () => {
  test.use({ storageState: memberState })

  test("settings tab does NOT render the admin settings surface", async ({ page }) => {
    await page.goto("/home?tab=settings")

    // The gate is at home-app.tsx (`activeTab === "settings" && isAdmin`): no
    // redirect happens, the settings content slot just never mounts. Confirm
    // both the URL stays put (proving this is a render gate, not a bounce)
    // and that none of SettingsTab's admin-exclusive tab-strip buttons or
    // content exist in the DOM.
    await expect(page).toHaveURL(/tab=settings/)

    await expect(page.getByRole("button", { name: "Governance" })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Audit Log" })).toHaveCount(0)
    await expect(page.getByText("Ministry Identity")).toHaveCount(0)
  })

  test("announcements tab renders WITHOUT the create affordance", async ({ page }) => {
    await page.goto("/home?tab=announcements")
    await expect(page.getByRole("heading", { name: "Announcements" })).toBeVisible()
    await expect(page.getByRole("button", { name: "New announcement" })).toHaveCount(0)
  })
})
