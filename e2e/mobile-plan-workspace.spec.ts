// Regression coverage for the mobile Plan-tab team-entry rebuild (commit 3a15bd6).
//
// Before this rebuild: tapping a team on mobile opened the settings/roster
// overlay instead of the workspace, the picker was admin-gated (non-admin
// members with 2+ teams had NO way into any workspace), and 'standard'-
// classified teams had no mobile render branch at all. This spec locks in the
// fixed picker (admin + member), the tap-to-enter routing, the settings gear,
// the standard-team MinistryCalendar fallback, the studentOrg branch, and
// confirms desktop is untouched.
//
// NOTE: both the desktop ("hidden md:flex...") and mobile ("md:hidden") trees
// are ALWAYS mounted in the DOM simultaneously — Tailwind hides the inactive
// one via CSS, it doesn't unmount it. Every locator below is narrowed with
// `.filter({ visible: true })` to avoid strict-mode "resolved to N elements"
// violations across the two co-mounted trees (mirrors e2e/mobile-entry-b3.spec.ts).
import { test, expect, type Page } from "@playwright/test"
import { adminState, memberState, sandbox, E2E_PREFIX } from "./fixtures"

function watchConsole(page: Page) {
  const errors: string[] = []
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`)
  })
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`))
  return errors
}

function assertNoErrors(errors: string[]) {
  expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([])
}

const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } as const
const DESKTOP = { viewport: { width: 1440, height: 900 } } as const

// Names deliberately chosen so classifyTeam (app/home/team-type.ts) routes them
// to different workspaces: "Outreach" matches none of the name regexes ->
// "standard" (MinistryCalendar fallback); "Student Org" matches STUDENT_ORG_RE
// -> StudentOrgTeamHome.
const OUTREACH_NAME = `${E2E_PREFIX}Outreach`
const STUDENT_ORG_NAME = `${E2E_PREFIX}Student Org`

test.describe("mobile plan workspace entry (3a15bd6)", () => {
  let adminId: string
  let memberId: string
  let outreachTeamId: string
  let studentOrgTeamId: string
  let outreachMemberRoleId: string
  let studentOrgMemberRoleId: string

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    memberId = await sb.memberUserId()

    // "Outreach" — standard fallback team. President role carries can_plan_events
    // so the MinistryCalendar branch's gate (plan-tab.tsx ~2853/3068: perms must
    // include can_plan_events, or governance write/view) actually renders.
    {
      const { data: team, error } = await sb.client
        .from("teams")
        .insert({ ministry_id: sb.ministryId, name: OUTREACH_NAME, description: "e2e standard team", team_type: "standard", created_by: adminId })
        .select()
        .single()
      if (error) throw error
      outreachTeamId = team.id
      const { data: president, error: pe } = await sb.client
        .from("team_roles")
        .insert({ team_id: team.id, name: "President", permissions: ["can_plan_events", "can_manage_team"], is_president: true })
        .select()
        .single()
      if (pe) throw pe
      const { data: member, error: me } = await sb.client
        .from("team_roles")
        .insert({ team_id: team.id, name: "Member", permissions: ["can_plan_events"], is_president: false })
        .select()
        .single()
      if (me) throw me
      outreachMemberRoleId = member.id
      const { error: tme } = await sb.client
        .from("team_members")
        .insert({ team_id: team.id, user_id: adminId, role_id: president.id, added_by: adminId })
      if (tme) throw tme
    }

    // "Student Org" — matches STUDENT_ORG_RE, routes to StudentOrgTeamHome.
    {
      const { data: team, error } = await sb.client
        .from("teams")
        .insert({ ministry_id: sb.ministryId, name: STUDENT_ORG_NAME, description: "e2e student org team", team_type: "standard", created_by: adminId })
        .select()
        .single()
      if (error) throw error
      studentOrgTeamId = team.id
      const { data: president, error: pe } = await sb.client
        .from("team_roles")
        .insert({ team_id: team.id, name: "President", permissions: ["can_plan_events", "can_view_finances", "can_manage_members", "can_track_attendance", "can_manage_team"], is_president: true })
        .select()
        .single()
      if (pe) throw pe
      const { data: member, error: me } = await sb.client
        .from("team_roles")
        .insert({ team_id: team.id, name: "Member", permissions: ["can_plan_events"], is_president: false })
        .select()
        .single()
      if (me) throw me
      studentOrgMemberRoleId = member.id
      const { error: tme } = await sb.client
        .from("team_members")
        .insert({ team_id: team.id, user_id: adminId, role_id: president.id, added_by: adminId })
      if (tme) throw tme
    }
  })

  test.afterAll(async () => {
    const sb = sandbox()
    for (const id of [outreachTeamId, studentOrgTeamId]) {
      if (!id) continue
      await sb.client.from("team_members").delete().eq("team_id", id)
      await sb.client.from("team_roles").delete().eq("team_id", id)
      await sb.client.from("teams").delete().eq("id", id)
    }
  })

  // ── ADMIN — mobile (390x844) ────────────────────────────────────────────────
  test.describe("admin — mobile", () => {
    test.use({ storageState: adminState, ...MOBILE })

    test("1. picker renders workspaces, Receipts, Add workspace; no Tools/Set/Slides/Schedule text; bottom clearance", async ({ page }) => {
      const errors = watchConsole(page)
      await page.goto("/home?tab=plan")

      await expect(page.getByText("Your workspaces", { exact: true }).filter({ visible: true })).toBeVisible()
      await expect(page.getByText(OUTREACH_NAME, { exact: false }).filter({ visible: true })).toBeVisible()
      await expect(page.getByText(STUDENT_ORG_NAME, { exact: false }).filter({ visible: true })).toBeVisible()
      await expect(page.getByText("Receipts", { exact: true }).filter({ visible: true })).toBeVisible()
      const addWorkspace = page.getByText("Add workspace", { exact: true }).filter({ visible: true })
      await expect(addWorkspace).toBeVisible()

      // No dead Tools grid / static "coming soon" tiles anywhere in the rendered picker.
      const bodyText = await page.locator("body").innerText()
      expect(bodyText).not.toMatch(/\bTools\b/i)
      expect(bodyText).not.toMatch(/\bSet\b/i)
      expect(bodyText).not.toMatch(/\bSlides\b/i)
      expect(bodyText).not.toMatch(/\bSchedule\b/i)

      // Bottom clearance (best-effort, non-fatal): the Add-workspace row (last
      // picker element) should sit above the pill-nav zone (~70px reserved).
      await addWorkspace.scrollIntoViewIfNeeded()
      const box = await addWorkspace.boundingBox()
      const viewportHeight = page.viewportSize()?.height ?? 844
      if (box) {
        console.log(`[bottom-clearance] Add workspace row bottom=${box.y + box.height}, viewport=${viewportHeight}, nav-zone-start=${viewportHeight - 70}`)
        expect.soft(box.y + box.height, "Add workspace row should clear the ~70px bottom pill-nav zone").toBeLessThan(viewportHeight - 70)
      } else {
        console.log("[bottom-clearance] could not read bounding box for Add workspace row")
      }

      assertNoErrors(errors)
    })

    test("2. tap team card body enters the workspace (not the settings/roster view)", async ({ page }) => {
      const errors = watchConsole(page)
      await page.goto("/home?tab=plan")
      await page.getByText(OUTREACH_NAME, { exact: false }).filter({ visible: true }).click()

      await expect.poll(() => page.url()).toContain(`team=${outreachTeamId}`)
      // The settings/roster overlay (TeamDetailOverlay) is NOT what opened — its
      // "Roles" section header must not be present.
      await expect(page.getByText("Roles", { exact: true }).filter({ visible: true })).toHaveCount(0)

      assertNoErrors(errors)
    })

    test("3. '← All workspaces' chip returns to the picker and clears ?team=", async ({ page }) => {
      const errors = watchConsole(page)
      await page.goto("/home?tab=plan")
      await page.getByText(OUTREACH_NAME, { exact: false }).filter({ visible: true }).click()
      await expect.poll(() => page.url()).toContain(`team=${outreachTeamId}`)

      const backChip = page.getByText("All workspaces", { exact: false }).filter({ visible: true })
      await expect(backChip).toBeVisible()
      await backChip.click()

      await expect.poll(() => page.url()).not.toContain("team=")
      await expect(page.getByText("Your workspaces", { exact: true }).filter({ visible: true })).toBeVisible()

      assertNoErrors(errors)
    })

    test("4. gear on a team card opens the settings view (Roles/Leadership/Members)", async ({ page }) => {
      const errors = watchConsole(page)
      await page.goto("/home?tab=plan")

      const gear = page.getByTitle("Team settings").filter({ visible: true }).first()
      await expect(gear).toBeVisible()
      await gear.click()

      await expect(page.getByText("Roles", { exact: true }).filter({ visible: true })).toBeVisible()
      await expect(page.getByText("Leadership", { exact: true }).filter({ visible: true })).toBeVisible()
      await expect(page.getByText("Members", { exact: true }).filter({ visible: true })).toBeVisible()

      assertNoErrors(errors)
    })

    test("5. standard-team branch renders MinistryCalendar", async ({ page }) => {
      const errors = watchConsole(page)
      await page.goto("/home?tab=plan")
      await page.getByText(OUTREACH_NAME, { exact: false }).filter({ visible: true }).click()
      await expect.poll(() => page.url()).toContain(`team=${outreachTeamId}`)

      await expect(page.getByText("Upcoming", { exact: true }).filter({ visible: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "Month" }).filter({ visible: true })).toBeVisible()
      await expect(page.getByRole("button", { name: "List" }).filter({ visible: true })).toBeVisible()
      // Confirms this is the calendar fallback, NOT the studentOrg board.
      await expect(page.getByRole("button", { name: "Meeting Notes" }).filter({ visible: true })).toHaveCount(0)

      assertNoErrors(errors)
    })

    test("6. student-org-named team renders the mobile hub (Planning/Ministry drill-in rows)", async ({ page }) => {
      // B-1: the mobile sub-tab strip is replaced by the Daybreak hub — grouped
      // Planning/Ministry row cards that drill into the existing section surfaces.
      const errors = watchConsole(page)
      await page.goto("/home?tab=plan")
      await page.getByText(STUDENT_ORG_NAME, { exact: false }).filter({ visible: true }).click()
      await expect.poll(() => page.url()).toContain(`team=${studentOrgTeamId}`)

      // Hub landing — section labels + drill-in rows (not the old strip buttons).
      await expect(page.getByText("Planning", { exact: true }).filter({ visible: true })).toBeVisible()
      await expect(page.getByText("Ministry", { exact: true }).filter({ visible: true })).toBeVisible()
      const eventsRow = page.getByRole("button", { name: /Events/ }).filter({ visible: true }).first()
      await expect(eventsRow).toBeVisible()

      // Drilling into a row reveals the section content + a back-to-hub affordance.
      await eventsRow.click()
      await expect(page.getByRole("button", { name: STUDENT_ORG_NAME }).filter({ visible: true })).toBeVisible()

      assertNoErrors(errors)
    })
  })

  // ── MEMBER — mobile (390x844) ───────────────────────────────────────────────
  test.describe("member — mobile (locked-out case)", () => {
    test.use({ storageState: memberState, ...MOBILE })

    test.beforeAll(async () => {
      const sb = sandbox()
      const { error } = await sb.client.from("team_members").insert([
        { team_id: outreachTeamId, user_id: memberId, role_id: outreachMemberRoleId, added_by: adminId },
        { team_id: studentOrgTeamId, user_id: memberId, role_id: studentOrgMemberRoleId, added_by: adminId },
      ])
      if (error) throw error
    })

    test.afterAll(async () => {
      const sb = sandbox()
      await sb.client.from("team_members").delete().eq("user_id", memberId).in("team_id", [outreachTeamId, studentOrgTeamId])
    })

    test("7. picker renders for the non-admin member with both cards; no Add workspace; no gear", async ({ page }) => {
      const errors = watchConsole(page)
      await page.goto("/home?tab=plan")

      await expect(page.getByText("Your workspaces", { exact: true }).filter({ visible: true })).toBeVisible()
      await expect(page.getByText(OUTREACH_NAME, { exact: false }).filter({ visible: true })).toBeVisible()
      await expect(page.getByText(STUDENT_ORG_NAME, { exact: false }).filter({ visible: true })).toBeVisible()

      await expect(page.getByText("Add workspace", { exact: true }).filter({ visible: true })).toHaveCount(0)
      await expect(page.getByTitle("Team settings").filter({ visible: true })).toHaveCount(0)

      assertNoErrors(errors)
    })

    test("8. member taps a team card and enters the workspace", async ({ page }) => {
      const errors = watchConsole(page)
      await page.goto("/home?tab=plan")
      await page.getByText(OUTREACH_NAME, { exact: false }).filter({ visible: true }).click()

      await expect.poll(() => page.url()).toContain(`team=${outreachTeamId}`)
      await expect(page.getByText("All workspaces", { exact: false }).filter({ visible: true })).toBeVisible()
      await expect(page.getByText("Upcoming", { exact: true }).filter({ visible: true })).toBeVisible()

      assertNoErrors(errors)
    })
  })

  // ── DESKTOP — admin (1440x900) — must be unchanged ──────────────────────────
  test.describe("desktop — admin, unchanged", () => {
    test.use({ storageState: adminState, ...DESKTOP })

    test("9. desktop picker/workspace renders normally; no mobile picker or back-chip leak", async ({ page }) => {
      const errors = watchConsole(page)
      await page.goto("/home?tab=plan")

      await expect(page.getByText("Which workspace are you entering?", { exact: true }).filter({ visible: true })).toBeVisible()
      // Mobile-only plain "Your workspaces" label (no " · N" suffix) must not be
      // the visible one at this viewport (desktop's own copy has a count suffix).
      await expect(page.getByText("Your workspaces", { exact: true }).filter({ visible: true })).toHaveCount(0)

      await page.getByText(OUTREACH_NAME, { exact: false }).filter({ visible: true }).click()
      await expect.poll(() => page.url()).toContain(`team=${outreachTeamId}`)
      await expect(page.getByText("Upcoming", { exact: true }).filter({ visible: true })).toBeVisible()

      // The mobile-only "← All workspaces" back chip must not leak onto desktop.
      await expect(page.getByText("All workspaces", { exact: false }).filter({ visible: true })).toHaveCount(0)

      assertNoErrors(errors)
    })
  })
})
