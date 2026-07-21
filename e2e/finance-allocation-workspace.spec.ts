// Regression coverage for the Finance Workspace redesign's Allocation surface +
// the reimbursement-inbox quick-Approve gating + the Reimbursements nav badge.
// Seeds its own Finance team + two additional (external) funds alongside the
// shared Church fund, so the Allocation grid renders three FundCards with real
// math (one deliberately over budget). Allocation rows are seeded under an
// isolated far-future fiscal year ("2099-2100") so the math assertions never
// collide with real ministry budget data in the current fiscal year.
import { test, expect } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

const SHOT_DIR = process.env.ALLOC_SHOT_DIR
const FISCAL_YEAR = "2099-2100"
const CATEGORY_NAME = `${E2E_PREFIX}Alloc Coverage Category`

test.describe("finance workspace redesign — Allocation surface + inbox gating + nav badge", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  let financeTeamId = ""
  let churchFundId = ""
  let grantAFundId = ""
  let grantBFundId = ""
  const GRANT_A_NAME = `${E2E_PREFIX}Grant Fund A`
  const GRANT_B_NAME = `${E2E_PREFIX}Grant Fund B`

  // Inbox-gating fixtures (also exercises the nav badge decrementing).
  let churchSingleReceiptId = ""
  let churchSingleAllocationId = ""
  const CHURCH_SINGLE_SUBMITTER = "E2E Gating Church Single"

  let externalSingleReceiptId = ""
  const EXTERNAL_SINGLE_SUBMITTER = "E2E Gating External Single"

  let multiReceiptId = ""
  const MULTI_SUBMITTER = "E2E Gating Multi Split"

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()

    const { data: team, error } = await sb.client
      .from("teams")
      .insert({ ministry_id: sb.ministryId, name: `${E2E_PREFIX}Alloc Workspace Test`, description: "e2e", team_type: "finance", created_by: adminId })
      .select().single()
    if (error) throw error
    financeTeamId = team.id

    const { data: role, error: re } = await sb.client
      .from("team_roles")
      .insert({ team_id: financeTeamId, name: "President", permissions: ["can_view_finances"], is_president: true })
      .select().single()
    if (re) throw re
    await sb.client.from("team_members").insert({ team_id: financeTeamId, user_id: adminId, role_id: role.id, added_by: adminId })

    const { data: church } = await sb.client
      .from("finance_funds").select("id").eq("ministry_id", sb.ministryId).eq("slug", "church").maybeSingle()
    churchFundId = church?.id
    if (!churchFundId) {
      const { data: cf, error: cfe } = await sb.client
        .from("finance_funds")
        .insert({ ministry_id: sb.ministryId, name: "Church", slug: "church", kind: "church", order_index: 0 })
        .select().single()
      if (cfe) throw cfe
      churchFundId = cf.id
    }

    const { data: grantA, error: gae } = await sb.client
      .from("finance_funds")
      .insert({ ministry_id: sb.ministryId, name: GRANT_A_NAME, slug: `e2e-alloc-a-${Date.now()}`, kind: "external", order_index: 1 })
      .select().single()
    if (gae) throw gae
    grantAFundId = grantA.id

    const { data: grantB, error: gbe } = await sb.client
      .from("finance_funds")
      .insert({ ministry_id: sb.ministryId, name: GRANT_B_NAME, slug: `e2e-alloc-b-${Date.now() + 1}`, kind: "external", order_index: 2 })
      .select().single()
    if (gbe) throw gbe
    grantBFundId = grantB.id

    // A custom budget category (so the ledger's category filter chip has a
    // stable, prefixed label to click).
    await sb.client.from("budget_categories").insert({ ministry_id: sb.ministryId, name: CATEGORY_NAME, created_by: adminId })

    // Isolated-FY allocations: Church over budget, Grant A/B under budget.
    const allocRows = [
      { ministry_id: sb.ministryId, fiscal_year: FISCAL_YEAR, category: CATEGORY_NAME, fund: "church", allocated_amount: 100, created_by: adminId },
      { ministry_id: sb.ministryId, fiscal_year: FISCAL_YEAR, category: CATEGORY_NAME, fund: grantA.slug, allocated_amount: 50, created_by: adminId },
      { ministry_id: sb.ministryId, fiscal_year: FISCAL_YEAR, category: CATEGORY_NAME, fund: grantB.slug, allocated_amount: 40, created_by: adminId },
    ]
    const { error: mbe } = await sb.client.from("ministry_budgets").insert(allocRows)
    if (mbe) throw mbe

    // Actual spend (manual ledger entries) inside the isolated FY's date window
    // (2099-06-01 .. 2100-05-31): Church spends over its $100 allocation.
    const { error: bee } = await sb.client.from("budget_entries").insert([
      { ministry_id: sb.ministryId, entry_date: "2099-07-01", category: CATEGORY_NAME, description: "e2e alloc church spend", amount: 130, source: "manual", fund: "church", created_by: adminId },
      { ministry_id: sb.ministryId, entry_date: "2099-07-02", category: CATEGORY_NAME, description: "e2e alloc grant-a spend", amount: 20, source: "manual", fund: grantA.slug, created_by: adminId },
    ])
    if (bee) throw bee

    // ── Inbox-gating fixtures ────────────────────────────────────────────────
    // Single-split, pending, church fund → quick-Approve eligible.
    const { data: churchSingle, error: cse } = await sb.client
      .from("receipts")
      .insert({
        ministry_id: sb.ministryId, team_id: financeTeamId, submitted_by: adminId,
        submitted_by_name: CHURCH_SINGLE_SUBMITTER, event_name: `${E2E_PREFIX}Gating Church Single`,
        category: "Supplies", fund: "church", amount: 15.00,
        purchase_date: "2026-07-10", status: "pending",
      })
      .select().single()
    if (cse) throw cse
    churchSingleReceiptId = churchSingle.id
    const { data: churchSingleAlloc, error: csae } = await sb.client
      .from("receipt_fund_allocations")
      .insert({ receipt_id: churchSingleReceiptId, ministry_id: sb.ministryId, fund_id: churchFundId, amount: 15.00, status: "pending" })
      .select().single()
    if (csae) throw csae
    churchSingleAllocationId = churchSingleAlloc.id

    // Single-split, pending, EXTERNAL fund → must NOT show quick Approve.
    const { data: externalSingle, error: ese } = await sb.client
      .from("receipts")
      .insert({
        ministry_id: sb.ministryId, team_id: financeTeamId, submitted_by: adminId,
        submitted_by_name: EXTERNAL_SINGLE_SUBMITTER, event_name: `${E2E_PREFIX}Gating External Single`,
        category: "Supplies", fund: grantA.slug, amount: 22.00,
        purchase_date: "2026-07-11", status: "pending",
      })
      .select().single()
    if (ese) throw ese
    externalSingleReceiptId = externalSingle.id
    const { error: esae } = await sb.client
      .from("receipt_fund_allocations")
      .insert({ receipt_id: externalSingleReceiptId, ministry_id: sb.ministryId, fund_id: grantAFundId, amount: 22.00, status: "pending" })
    if (esae) throw esae

    // Two pending church splits on one receipt → multi-split, must NOT show
    // quick Approve either.
    const { data: multiReceipt, error: mre } = await sb.client
      .from("receipts")
      .insert({
        ministry_id: sb.ministryId, team_id: financeTeamId, submitted_by: adminId,
        submitted_by_name: MULTI_SUBMITTER, event_name: `${E2E_PREFIX}Gating Multi Split`,
        category: "Supplies", fund: "church", amount: 30.00,
        purchase_date: "2026-07-12", status: "pending",
      })
      .select().single()
    if (mre) throw mre
    multiReceiptId = multiReceipt.id
    const { error: mae } = await sb.client
      .from("receipt_fund_allocations")
      .insert([
        { receipt_id: multiReceiptId, ministry_id: sb.ministryId, fund_id: churchFundId, amount: 15.00, status: "pending" },
        { receipt_id: multiReceiptId, ministry_id: sb.ministryId, fund_id: churchFundId, amount: 15.00, status: "pending" },
      ])
    if (mae) throw mae
  })

  test.afterAll(async () => {
    const sb = sandbox()
    if (churchSingleAllocationId) {
      await sb.client.from("budget_entries").delete().eq("receipt_allocation_id", churchSingleAllocationId)
      await sb.client.from("receipt_fund_allocations").delete().eq("id", churchSingleAllocationId)
    }
    if (churchSingleReceiptId) await sb.client.from("receipts").delete().eq("id", churchSingleReceiptId)
    if (externalSingleReceiptId) {
      await sb.client.from("receipt_fund_allocations").delete().eq("receipt_id", externalSingleReceiptId)
      await sb.client.from("receipts").delete().eq("id", externalSingleReceiptId)
    }
    if (multiReceiptId) {
      await sb.client.from("receipt_fund_allocations").delete().eq("receipt_id", multiReceiptId)
      await sb.client.from("receipts").delete().eq("id", multiReceiptId)
    }
    await sb.client.from("budget_entries").delete().eq("ministry_id", sb.ministryId).eq("category", CATEGORY_NAME)
    await sb.client.from("ministry_budgets").delete().eq("ministry_id", sb.ministryId).eq("fiscal_year", FISCAL_YEAR).eq("category", CATEGORY_NAME)
    await sb.client.from("budget_categories").delete().eq("ministry_id", sb.ministryId).eq("name", CATEGORY_NAME)
    if (grantAFundId) await sb.client.from("finance_funds").delete().eq("id", grantAFundId)
    if (grantBFundId) await sb.client.from("finance_funds").delete().eq("id", grantBFundId)
    if (financeTeamId) {
      await sb.client.from("team_members").delete().eq("team_id", financeTeamId)
      await sb.client.from("team_roles").delete().eq("team_id", financeTeamId)
      await sb.client.from("teams").delete().eq("id", financeTeamId)
    }
  })

  test("Allocation is the landing section; three FundCards render correct math incl. over-budget, chevron expands per-fund editors, an edit persists, TOTAL sums", async ({ page }) => {
    const sb = sandbox()

    // ── Deep-link default: no ?fsec= param lands on Allocation ──────────────
    await page.goto(`/home?tab=plan&team=${financeTeamId}`)
    await expect(page.getByText("Annual Allocation")).toBeVisible({ timeout: 15000 })

    // Switch to the isolated fiscal year seeded above.
    await page.locator("button", { hasText: /^\d{4}-\d{4}$/ }).click()
    await page.getByRole("menuitemradio", { name: FISCAL_YEAR }).click()

    // ── Three FundCards, correct math ────────────────────────────────────────
    await expect(page.getByText("Church", { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(GRANT_A_NAME, { exact: true })).toBeVisible()
    await expect(page.getByText(GRANT_B_NAME, { exact: true })).toBeVisible()
    // Church: alloc $100, spent $130 → over by $30 (danger state).
    await expect(page.getByText("Over by $30")).toBeVisible()
    // Grant A: alloc $50, spent $20 → $30 left.
    await expect(page.getByText("$30 left")).toBeVisible()
    // Grant B: alloc $40, spent $0 → $40 left.
    await expect(page.getByText("$40 left")).toBeVisible()
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/1-allocation-landing-fundcards.png` })

    // ── TOTAL footer sums across funds: allocated 190, spent 150, remaining 40 ──
    // Scoped to the footer row itself — with only one seeded category, its own
    // collapsed-row "Allocated" figure is numerically identical to the footer's
    // total, so an unscoped page-wide text match is ambiguous (strict-mode).
    const totalFooterRow = page.getByText("Total", { exact: true }).locator("xpath=ancestor::div[1]")
    await expect(totalFooterRow.getByText("$190.00", { exact: true })).toBeVisible()
    await expect(totalFooterRow.getByText("$150.00", { exact: true })).toBeVisible()
    await expect(totalFooterRow.getByText("$40.00", { exact: true })).toBeVisible()
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/2-allocation-grid-collapsed.png` })

    // ── Chevron expands the per-fund editor for our category ────────────────
    // Allocation editing is desktop-only — the mobile-summary block (hidden via
    // CSS, still present in the DOM) renders the same category label with no
    // chevron, so .first() disambiguates to the desktop grid instance (it's
    // the first of the two in DOM order).
    const catLabel = page.getByText(CATEGORY_NAME, { exact: true }).first()
    const gridRow = catLabel.locator("xpath=ancestor::div[2]")
    const outerRow = catLabel.locator("xpath=ancestor::div[3]")
    await gridRow.getByRole("button", { name: "Expand fund split" }).click()
    await expect(outerRow.locator('input[type="number"]').first()).toBeVisible({ timeout: 10000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/3-allocation-row-expanded.png` })

    // Per-fund editors in fund order (Church, Grant A, Grant B) with their
    // "spent $X" captions.
    const perFundInputs = outerRow.locator('input[type="number"]')
    await expect(perFundInputs).toHaveCount(3)
    await expect(perFundInputs.nth(0)).toHaveValue("100")
    await expect(perFundInputs.nth(1)).toHaveValue("50")
    await expect(perFundInputs.nth(2)).toHaveValue("40")
    await expect(outerRow.getByText("spent $130.00")).toBeVisible()
    await expect(outerRow.getByText("spent $20.00")).toBeVisible()
    await expect(outerRow.getByText("spent $0.00")).toBeVisible()

    // ── An edit persists (DB assert on ministry_budgets) ─────────────────────
    await perFundInputs.nth(0).fill("120")
    await perFundInputs.nth(0).blur()
    await expect(async () => {
      const { data } = await sb.client
        .from("ministry_budgets")
        .select("allocated_amount")
        .eq("ministry_id", sb.ministryId).eq("fiscal_year", FISCAL_YEAR).eq("category", CATEGORY_NAME).eq("fund", "church")
        .maybeSingle()
      expect(Number((data as { allocated_amount: number } | null)?.allocated_amount)).toBe(120)
    }).toPass({ timeout: 10000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/4-allocation-edit-saved.png` })

    // Reload + reselect the FY + re-expand — the edit survives a fresh load.
    await page.reload()
    await expect(page.getByText("Annual Allocation")).toBeVisible({ timeout: 15000 })
    await page.locator("button", { hasText: /^\d{4}-\d{4}$/ }).click()
    await page.getByRole("menuitemradio", { name: FISCAL_YEAR }).click()
    const catLabel2 = page.getByText(CATEGORY_NAME, { exact: true }).first()
    await expect(catLabel2).toBeVisible({ timeout: 15000 })
    await catLabel2.locator("xpath=ancestor::div[2]").getByRole("button", { name: "Expand fund split" }).click()
    await expect(catLabel2.locator("xpath=ancestor::div[3]").locator('input[type="number"]').first()).toHaveValue("120", { timeout: 10000 })
  })

  test("Budget ledger category filter chips filter the ledger to that category's rows", async ({ page }) => {
    await page.goto(`/home?tab=plan&team=${financeTeamId}&fsec=budget`)
    await expect(page.getByText("Expense ledger", { exact: true })).toBeVisible({ timeout: 15000 })

    // Our seeded ledger rows are visible unfiltered.
    await expect(page.getByText("e2e alloc church spend")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("e2e alloc grant-a spend")).toBeVisible()

    // Click the category chip for our prefixed category — filters the ledger
    // down to just this category's rows.
    const chip = page.locator("button").filter({ hasText: CATEGORY_NAME }).first()
    await expect(chip).toBeVisible()
    await chip.click()
    await expect(page.getByText("e2e alloc church spend")).toBeVisible()
    await expect(page.getByText("e2e alloc grant-a spend")).toBeVisible()
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/5-ledger-category-filter-active.png` })

    // Toggle off — the chip is a filter, not a permanent narrowing.
    await chip.click()
  })

  test("Reimbursements nav badge shows the pending count and decrements after approve; quick Approve appears only for single-split church receipts", async ({ page }) => {
    await page.goto(`/home?tab=plan&team=${financeTeamId}&fsec=reimbursements`)
    await expect(page.getByText("Reimbursements inbox")).toBeVisible({ timeout: 15000 })

    async function readBadgeCount(): Promise<number> {
      const btn = page.getByRole("button", { name: /^Reimbursements/ })
      const spans = btn.locator("span")
      const n = await spans.count()
      if (n < 2) return 0
      const txt = (await spans.nth(1).textContent())?.trim() ?? ""
      return /^\d+$/.test(txt) ? parseInt(txt, 10) : 0
    }

    // The badge's own SWR fetch lands slightly after the inbox list itself —
    // wait for a settled nonzero count rather than reading on the first paint.
    let initialBadge = 0
    await expect.poll(async () => { initialBadge = await readBadgeCount(); return initialBadge }, { timeout: 15000 }).toBeGreaterThan(0)
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/6-reimbursements-nav-badge.png` })

    // ── Quick-approve gating: church-single shows Approve; external-single and
    //    multi-split rows open the detail (chevron) instead. Rows render "Name ·
    //    Team" on one combined line and the row root is a plain div (not a
    //    button), so anchor on each fixture's (unique) dollar amount instead —
    //    ancestor::div[1] is the row's own flex container (hosts this row's own
    //    Approve button / chevron, nothing from a sibling row). ────────────────
    const churchRow = page.getByText("$15.00", { exact: true }).locator("xpath=ancestor::div[1]")
    await expect(churchRow.getByRole("button", { name: "Approve" })).toBeVisible({ timeout: 15000 })

    const externalRow = page.getByText("$22.00", { exact: true }).locator("xpath=ancestor::div[1]")
    await expect(externalRow.getByRole("button", { name: "Approve" })).toHaveCount(0)

    const multiRow = page.getByText("$30.00", { exact: true }).locator("xpath=ancestor::div[1]")
    await expect(multiRow.getByRole("button", { name: "Approve" })).toHaveCount(0)
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/7-quick-approve-gating.png` })

    // ── Approve the eligible church-single row and confirm the badge decrements ──
    await churchRow.getByRole("button", { name: "Approve" }).click()
    await page.locator("select").selectOption({ label: "DG Dinner" })
    await page.getByRole("button", { name: "Approve & post" }).click()
    await expect(page.getByText("Approved · added to budget ledger")).toBeVisible({ timeout: 10000 })

    await expect(async () => {
      const now = await readBadgeCount()
      expect(now).toBe(initialBadge - 1)
    }).toPass({ timeout: 10000 })
  })
})
