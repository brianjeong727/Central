// Regression coverage for the fund-aware Budget ledger's reimbursement->budget
// bridge (Finance Overhaul — fund-aware ledger). Seeds its own Finance team + a
// church-fund reimbursed split directly via sb.client (bypassing the full
// approve/sign-off UI flow, which is covered by finance-split-allocations.spec.ts),
// then exercises the "Add to budget" affordance end-to-end: click -> pick
// category -> post -> optimistic "In budget" flip -> DB row lands with the
// right fund/receipt_allocation_id/source -> re-post is impossible (button
// gone, even after reload) -> the Budget ledger renders the fund pill -> the
// Allocation overview cards render a per-fund subline.
import { test, expect } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

// Set FUND_SHOT_DIR to capture layout-sanity screenshots on the final green pass.
const SHOT_DIR = process.env.FUND_SHOT_DIR

test.describe("fund-aware budget ledger — reimbursement post-to-budget bridge", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  let financeTeamId = ""
  let churchFundId = ""
  let churchFundSlug = "church"
  let receiptId = ""
  let allocationId = ""
  const SUBMITTER = "E2E Budget Post Probe"
  const EVENT_NAME = `${E2E_PREFIX}Budget Post Probe`
  const AMOUNT = 88.42

  // Granular-status fixtures (a single-source church split walked straight to
  // "approved" — never reimbursed — so the receipt-level rollup should mirror
  // it exactly: "Approved", not the old collapsed "Pending").
  let approvedReceiptId = ""
  let approvedAllocationId = ""
  const APPROVED_SUBMITTER = "E2E Approved Status Probe"
  const APPROVED_EVENT_NAME = `${E2E_PREFIX}Approved Status Probe`
  const APPROVED_AMOUNT = 41.00
  const reviewedAt = new Date()

  // Delete-category fixtures. Categories A/B are created THROUGH THE UI in the
  // test itself; these hold the ids resolved afterwards (for the orphaned-receipt
  // DB assertion + defensive afterAll cleanup).
  let categoryBId = ""
  let categoryOrphanReceiptId = ""
  const CATEGORY_A_NAME = `${E2E_PREFIX}Probe Category A`
  const CATEGORY_B_NAME = `${E2E_PREFIX}Probe Category B`

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()

    const { data: team, error } = await sb.client
      .from("teams")
      .insert({ ministry_id: sb.ministryId, name: `${E2E_PREFIX}Budget Post Test`, description: "e2e", team_type: "finance", created_by: adminId })
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
      .from("finance_funds").select("id, slug").eq("ministry_id", sb.ministryId).eq("slug", "church").maybeSingle()
    if (church) {
      churchFundId = (church as { id: string; slug: string }).id
      churchFundSlug = (church as { id: string; slug: string }).slug
    } else {
      const { data: cf, error: cfe } = await sb.client
        .from("finance_funds")
        .insert({ ministry_id: sb.ministryId, name: "Church", slug: "church", kind: "church", order_index: 0 })
        .select().single()
      if (cfe) throw cfe
      churchFundId = cf.id
    }

    // Seed a receipt that is ALREADY fully reimbursed (direct status write —
    // the approve/sign-off UI lifecycle itself is covered by
    // finance-split-allocations.spec.ts; this spec's job is the post-to-budget
    // bridge on top of a reimbursed split).
    const { data: receipt, error: rce } = await sb.client
      .from("receipts")
      .insert({
        ministry_id: sb.ministryId, team_id: financeTeamId, submitted_by: adminId,
        submitted_by_name: SUBMITTER, event_name: EVENT_NAME,
        category: "Supplies", fund: "church", amount: AMOUNT,
        purchase_date: "2026-07-01", status: "reimbursed",
      })
      .select().single()
    if (rce) throw rce
    receiptId = receipt.id

    const { data: alloc, error: ae } = await sb.client
      .from("receipt_fund_allocations")
      .insert({
        receipt_id: receiptId, ministry_id: sb.ministryId, fund_id: churchFundId, amount: AMOUNT,
        status: "reimbursed", reviewed_by: adminId, reviewed_at: new Date().toISOString(),
        signed_off_by: adminId, signed_off_at: new Date().toISOString(),
      })
      .select().single()
    if (ae) throw ae
    allocationId = alloc.id

    // Second receipt: single church split walked straight to "approved" (never
    // reimbursed) — exercises the granular rollup (receipt.status should mirror
    // the split exactly, not collapse to "pending").
    const { data: approvedReceipt, error: pre } = await sb.client
      .from("receipts")
      .insert({
        ministry_id: sb.ministryId, team_id: financeTeamId, submitted_by: adminId,
        submitted_by_name: APPROVED_SUBMITTER, event_name: APPROVED_EVENT_NAME,
        category: "Supplies", fund: "church", amount: APPROVED_AMOUNT,
        purchase_date: "2026-07-05", status: "approved",
      })
      .select().single()
    if (pre) throw pre
    approvedReceiptId = approvedReceipt.id

    const { data: approvedAlloc, error: pae } = await sb.client
      .from("receipt_fund_allocations")
      .insert({
        receipt_id: approvedReceiptId, ministry_id: sb.ministryId, fund_id: churchFundId, amount: APPROVED_AMOUNT,
        status: "approved", reviewed_by: adminId, reviewed_at: reviewedAt.toISOString(),
      })
      .select().single()
    if (pae) throw pae
    approvedAllocationId = approvedAlloc.id
  })

  test.afterAll(async () => {
    const sb = sandbox()
    if (allocationId) {
      await sb.client.from("budget_entries").delete().eq("receipt_allocation_id", allocationId)
      await sb.client.from("receipt_fund_allocations").delete().eq("id", allocationId)
    }
    if (receiptId) await sb.client.from("receipts").delete().eq("id", receiptId)
    if (approvedAllocationId) await sb.client.from("receipt_fund_allocations").delete().eq("id", approvedAllocationId)
    if (approvedReceiptId) await sb.client.from("receipts").delete().eq("id", approvedReceiptId)
    if (categoryOrphanReceiptId) await sb.client.from("receipts").delete().eq("id", categoryOrphanReceiptId)
    // Defensive: the test deletes category B through the UI and category A is left
    // for the fallback assertion — clean up whatever's left by name, in case a
    // failed assertion left either one behind.
    await sb.client.from("receipt_categories").delete().eq("team_id", financeTeamId).in("name", [CATEGORY_A_NAME, CATEGORY_B_NAME])
    if (financeTeamId) {
      await sb.client.from("team_members").delete().eq("team_id", financeTeamId)
      await sb.client.from("team_roles").delete().eq("team_id", financeTeamId)
      await sb.client.from("teams").delete().eq("id", financeTeamId)
    }
  })

  test("reimbursed split posts to the budget ledger, is idempotent, and shows fund attribution in Budget + Allocation", async ({ page }) => {
    const sb = sandbox()

    await page.goto(`/home?tab=plan&team=${financeTeamId}`)
    await expect(page.getByText("Reimbursements inbox")).toBeVisible({ timeout: 15000 })

    // The seeded receipt is already fully reimbursed → it doesn't "need action" —
    // switch the inbox filter to "All" to find it.
    await page.getByRole("button", { name: /Needs action/ }).click()
    await page.getByRole("menuitemradio", { name: "All" }).click()

    const row = page.getByText(SUBMITTER, { exact: true })
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()

    await expect(page.getByText(`$${AMOUNT.toFixed(2)}`).first()).toBeVisible()
    await expect(page.getByText("Reimbursed", { exact: true }).first()).toBeVisible()

    // Not yet posted — the ghost "Add to budget" affordance shows, not the check.
    await expect(page.getByText("In budget")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Add to budget" })).toBeVisible()

    // ── Post to budget: pick a category, confirm ─────────────────────────────
    await page.getByRole("button", { name: "Add to budget" }).click()
    const categorySelect = page.locator("select")
    await expect(categorySelect).toBeVisible()
    await categorySelect.selectOption({ label: "DG Dinner" })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/1-post-category-picker.png` })
    await page.getByRole("button", { name: "Add to budget" }).click()

    // Optimistic flip -> "In budget" check; the button is gone.
    await expect(page.getByText("In budget")).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole("button", { name: "Add to budget" })).toHaveCount(0)
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/2-reimbursement-in-budget.png` })

    // ── DB assertion: exactly one budget_entries row, correctly attributed ───
    await expect(async () => {
      const { data } = await sb.client
        .from("budget_entries")
        .select("*")
        .eq("receipt_allocation_id", allocationId)
      expect(data?.length).toBe(1)
      const row = data![0] as { fund: string; source: string; amount: number; category: string; receipt_allocation_id: string }
      expect(row.fund).toBe(churchFundSlug)
      expect(row.source).toBe("reimbursement")
      expect(row.receipt_allocation_id).toBe(allocationId)
      expect(row.category).toBe("DG Dinner")
      expect(Number(row.amount)).toBeCloseTo(AMOUNT, 2)
    }).toPass({ timeout: 10000 })

    // ── Re-post is impossible: reload, the check persists, the button never
    //    reappears (postedToBudget derives from the DB, not just local state). ──
    await page.reload()
    await expect(page.getByText("Reimbursements inbox")).toBeVisible({ timeout: 15000 })
    await page.getByRole("button", { name: /^Needs action/ }).click()
    await page.getByRole("menuitemradio", { name: "All" }).click()
    await page.getByText(SUBMITTER, { exact: true }).click()
    await expect(page.getByText("In budget")).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole("button", { name: "Add to budget" })).toHaveCount(0)

    // ── Budget section: the ledger row shows the Church fund pill ────────────
    await page.goto(`/home?tab=plan&team=${financeTeamId}&fsec=budget`)
    await expect(page.getByText("Expense ledger", { exact: true })).toBeVisible({ timeout: 15000 })
    // Scope to the ledger row by its (unique) description text, not the amount —
    // the category-summary pill above the ledger also renders "$88.42" for this
    // category's running total, so an amount-only locator is ambiguous.
    const ledgerDesc = page.getByText(EVENT_NAME)
    await expect(ledgerDesc).toBeVisible({ timeout: 15000 })
    const ledgerRow = ledgerDesc.locator("xpath=ancestor::div[1]")
    await expect(ledgerRow.getByText("Church", { exact: true })).toBeVisible()
    await expect(ledgerRow.getByText(`$${AMOUNT.toFixed(2)}`, { exact: true })).toBeVisible()
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/3-budget-ledger-fund-pill.png` })

    // ── Allocation overview: the stat cards render a per-fund subline ────────
    await page.goto(`/home?tab=plan&team=${financeTeamId}&fsec=allocation`)
    await expect(page.getByText("Annual Allocation")).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Church \$[\d,]+/).first()).toBeVisible({ timeout: 15000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/4-allocation-per-fund-subline.png` })
  })

  test("granular status: an approved-only split shows an Approved chip (not Pending) with the approval date on the rail", async ({ page }) => {
    await page.goto(`/home?tab=plan&team=${financeTeamId}`)
    await expect(page.getByText("Reimbursements inbox")).toBeVisible({ timeout: 15000 })

    // Needs-action (default filter): church-approved needs the president's
    // sign-off, so this row surfaces without switching filters.
    const row = page.locator("button", { hasText: APPROVED_SUBMITTER })
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row.getByText("Approved", { exact: true })).toBeVisible()
    await expect(row.getByText("Pending")).toHaveCount(0)
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/5-inbox-approved-chip.png` })

    await row.click()
    await expect(page.getByText(`$${APPROVED_AMOUNT.toFixed(2)}`).first()).toBeVisible()
    // Rail: the "Approved" node is reached and carries the reviewed_at date
    // underneath it (short "Jul 21"-style format — the file's own formatter).
    const expectedDateLabel = reviewedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible()
    await expect(page.getByText(expectedDateLabel, { exact: true })).toBeVisible()
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/6-rail-approved-date.png` })
  })

  test("Receipts workspace: deleting a category removes it from the strip, falls the active subtab back sanely, and orphans its receipts (category_id -> NULL)", async ({ page }) => {
    const sb = sandbox()

    await page.goto(`/home?tab=plan&team=receipts&rteam=${financeTeamId}`)
    // "Categories" text is ambiguous (sidebar/team list also render it) — gate on
    // the content-header's "Add category" action, which only exists once a team
    // is selected in the Receipts workspace.
    await expect(page.getByRole("button", { name: "Add category" }).first()).toBeVisible({ timeout: 15000 })

    // ── Create category A, then B (UI create — B becomes active) ────────────
    await page.getByRole("button", { name: "Add category" }).first().click()
    await page.getByPlaceholder("e.g. DG Dinners").fill(CATEGORY_A_NAME)
    await page.getByRole("button", { name: "Add category" }).last().click()
    // The eyebrow (content header, "{name} · Church") is unique — the bare name
    // also matches the strip tab AND the mobile filter chip (both render, only
    // one visible per viewport, so a plain getByText is ambiguous).
    await expect(page.getByText(`${CATEGORY_A_NAME} ·`)).toBeVisible({ timeout: 15000 })

    await page.getByRole("button", { name: "Add category" }).first().click()
    await page.getByPlaceholder("e.g. DG Dinners").fill(CATEGORY_B_NAME)
    await page.getByRole("button", { name: "Add category" }).last().click()

    // B is the active subtab (content eyebrow reflects it).
    await expect(page.getByText(`${CATEGORY_B_NAME} ·`)).toBeVisible({ timeout: 15000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/7-two-categories.png` })

    // ── File a receipt directly under B (models "a receipt filed under a
    //    category that later gets deleted") ─────────────────────────────────
    const adminId = await sb.adminUserId()
    const { data: catB } = await sb.client
      .from("receipt_categories").select("id").eq("team_id", financeTeamId).eq("name", CATEGORY_B_NAME).single()
    categoryBId = (catB as { id: string }).id
    const { data: orphanReceipt, error: ore } = await sb.client
      .from("receipts")
      .insert({
        ministry_id: sb.ministryId, team_id: financeTeamId, submitted_by: adminId,
        submitted_by_name: "E2E Category Orphan Probe", event_name: `${E2E_PREFIX}Category Orphan Probe`,
        category_id: categoryBId, category: "Supplies", fund: "church", amount: 9.99,
        purchase_date: "2026-07-06", status: "pending",
      })
      .select().single()
    if (ore) throw ore
    categoryOrphanReceiptId = orphanReceipt.id

    // ── Delete category B via the kebab -> ConfirmDialog ─────────────────────
    await page.getByRole("button", { name: "Category actions" }).click()
    await page.getByRole("button", { name: "Delete category" }).click()
    await expect(page.getByText("Delete category?")).toBeVisible({ timeout: 5000 })
    // Let the modal's entrance animation (animate-backdrop-in/animate-dialog-in)
    // settle to full opacity before the evidence screenshot — otherwise the
    // capture can land mid-fade and look like a rendering bug.
    const confirmBtn = page.getByRole("button", { name: "Delete category" })
    await expect.poll(() => confirmBtn.evaluate(el => getComputedStyle(el).opacity)).toBe("1")
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/8-delete-category-confirm.png` })
    await page.getByRole("button", { name: "Delete category" }).click()

    // B leaves the strip; the active subtab falls back sanely to the only
    // remaining category, A (not a blank/error state).
    await expect(page.getByText(CATEGORY_B_NAME)).toHaveCount(0, { timeout: 15000 })
    await expect(page.getByText(`${CATEGORY_A_NAME} ·`)).toBeVisible({ timeout: 15000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/9-category-deleted-fallback.png` })

    // ── DB assertion: the orphaned receipt survives with category_id NULL ────
    await expect(async () => {
      const { data } = await sb.client.from("receipts").select("category_id").eq("id", categoryOrphanReceiptId).single()
      expect((data as { category_id: string | null } | null)?.category_id).toBeNull()
    }).toPass({ timeout: 10000 })
  })
})
