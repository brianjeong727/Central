// Regression coverage for the fund-aware Budget ledger's approve-time post-to-budget
// bridge (Finance Workspace Redesign — U1/U5). Seeds its own Finance team + three
// receipt fixtures directly via sb.client (bypassing the full approve/sign-off UI
// flow, which is covered by finance-split-allocations.spec.ts):
//   A) a fresh single-split PENDING church receipt — exercises the new one-motion
//      quick-Approve -> category confirm -> post -> Undo flow (U1).
//   B) a PRE-EXISTING reimbursed, un-posted split — exercises the U5 fallback
//      "Add to budget" affordance (the only surviving case for it).
//   C) a single-source church split walked straight to "approved" (never
//      reimbursed) — the granular-rollup probe.
import { test, expect } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

// Set FUND_SHOT_DIR to capture layout-sanity screenshots on the final green pass.
const SHOT_DIR = process.env.FUND_SHOT_DIR

test.describe("fund-aware budget ledger — approve-time post-to-budget bridge", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  let financeTeamId = ""
  let churchFundId = ""
  let churchFundSlug = "church"

  // Fixture A — fresh single-split pending church receipt (quick-Approve eligible).
  let quickReceiptId = ""
  let quickAllocationId = ""
  const QUICK_SUBMITTER = "E2E Quick Approve Probe"
  const QUICK_EVENT_NAME = `${E2E_PREFIX}Quick Approve Probe`
  const QUICK_AMOUNT = 88.42

  // Fixture B — already reimbursed, never posted (U5 fallback).
  let fallbackReceiptId = ""
  let fallbackAllocationId = ""
  const FALLBACK_SUBMITTER = "E2E Fallback Post Probe"
  const FALLBACK_EVENT_NAME = `${E2E_PREFIX}Fallback Post Probe`
  const FALLBACK_AMOUNT = 52.10

  // Fixture C — granular-status probe (single-source church split walked straight
  // to "approved" — never reimbursed — so the receipt-level rollup should mirror
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

    // Fixture A — fresh pending, single church split.
    const { data: quickReceipt, error: qre } = await sb.client
      .from("receipts")
      .insert({
        ministry_id: sb.ministryId, team_id: financeTeamId, submitted_by: adminId,
        submitted_by_name: QUICK_SUBMITTER, event_name: QUICK_EVENT_NAME,
        category: "Supplies", fund: "church", amount: QUICK_AMOUNT,
        purchase_date: "2026-07-01", status: "pending",
      })
      .select().single()
    if (qre) throw qre
    quickReceiptId = quickReceipt.id

    const { data: quickAlloc, error: qae } = await sb.client
      .from("receipt_fund_allocations")
      .insert({ receipt_id: quickReceiptId, ministry_id: sb.ministryId, fund_id: churchFundId, amount: QUICK_AMOUNT, status: "pending" })
      .select().single()
    if (qae) throw qae
    quickAllocationId = quickAlloc.id

    // Fixture B — already reimbursed, never posted.
    const { data: fallbackReceipt, error: fre } = await sb.client
      .from("receipts")
      .insert({
        ministry_id: sb.ministryId, team_id: financeTeamId, submitted_by: adminId,
        submitted_by_name: FALLBACK_SUBMITTER, event_name: FALLBACK_EVENT_NAME,
        category: "Supplies", fund: "church", amount: FALLBACK_AMOUNT,
        purchase_date: "2026-07-01", status: "reimbursed",
      })
      .select().single()
    if (fre) throw fre
    fallbackReceiptId = fallbackReceipt.id

    const { data: fallbackAlloc, error: fae } = await sb.client
      .from("receipt_fund_allocations")
      .insert({
        receipt_id: fallbackReceiptId, ministry_id: sb.ministryId, fund_id: churchFundId, amount: FALLBACK_AMOUNT,
        status: "reimbursed", reviewed_by: adminId, reviewed_at: new Date().toISOString(),
        signed_off_by: adminId, signed_off_at: new Date().toISOString(),
      })
      .select().single()
    if (fae) throw fae
    fallbackAllocationId = fallbackAlloc.id

    // Fixture C — single church split walked straight to "approved" (never reimbursed).
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
    if (quickAllocationId) {
      await sb.client.from("budget_entries").delete().eq("receipt_allocation_id", quickAllocationId)
      await sb.client.from("receipt_fund_allocations").delete().eq("id", quickAllocationId)
    }
    if (quickReceiptId) await sb.client.from("receipts").delete().eq("id", quickReceiptId)
    if (fallbackAllocationId) {
      await sb.client.from("budget_entries").delete().eq("receipt_allocation_id", fallbackAllocationId)
      await sb.client.from("receipt_fund_allocations").delete().eq("id", fallbackAllocationId)
    }
    if (fallbackReceiptId) await sb.client.from("receipts").delete().eq("id", fallbackReceiptId)
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

  test("quick Approve on the row opens a category confirm, posts to the ledger in one motion, and Undo fully reverts it", async ({ page }) => {
    const sb = sandbox()

    // Default finance landing is now Allocation (U-deliverable 1) — deep-link to
    // Reimbursements explicitly.
    await page.goto(`/home?tab=plan&team=${financeTeamId}&fsec=reimbursements`)
    await expect(page.getByText("Reimbursements inbox")).toBeVisible({ timeout: 15000 })

    // The fresh single-split pending church receipt surfaces under Needs action
    // with a quick Approve button (not a chevron-to-detail affordance). Rows now
    // render "Name · Team" on one combined line (deliverable 5), so anchor on the
    // (unique, single-text-node) dollar amount rather than the submitter name —
    // the same technique finance-split-allocations.spec.ts already relies on.
    // ancestor::div[1] is the row's own flex container (name/fund-pills/amount/
    // status/action — the same div that hosts this row's Approve button).
    const quickAmount = page.getByText(`$${QUICK_AMOUNT.toFixed(2)}`, { exact: true })
    await expect(quickAmount).toBeVisible({ timeout: 15000 })
    const quickRow = quickAmount.locator("xpath=ancestor::div[1]")
    await expect(quickRow.getByRole("button", { name: "Approve" })).toBeVisible()
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/0-inbox-polished-row.png` })

    // ── Quick Approve: inline category confirm (pre-matched, then explicitly set) ──
    await quickRow.getByRole("button", { name: "Approve" }).click()
    const categorySelect = page.locator("select")
    await expect(categorySelect).toBeVisible()
    await categorySelect.selectOption({ label: "DG Dinner" })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/1-quick-approve-category-confirm.png` })
    await page.getByRole("button", { name: "Approve & post" }).click()

    // One motion: optimistic status flip to Approved + the Undo toast, in the
    // same click.
    await expect(quickRow.getByText("Approved", { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText("Approved · added to budget ledger")).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole("button", { name: "Undo" })).toBeVisible()
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/2-undo-toast.png` })

    // ── DB assertion: the split is approved and posted to the ledger ─────────
    await expect(async () => {
      const { data: allocRows } = await sb.client.from("receipt_fund_allocations").select("status").eq("id", quickAllocationId)
      expect(allocRows?.[0]?.status).toBe("approved")
      const { data } = await sb.client.from("budget_entries").select("*").eq("receipt_allocation_id", quickAllocationId)
      expect(data?.length).toBe(1)
      const row = data![0] as { fund: string; source: string; amount: number; category: string; receipt_allocation_id: string }
      expect(row.fund).toBe(churchFundSlug)
      expect(row.source).toBe("reimbursement")
      expect(row.receipt_allocation_id).toBe(quickAllocationId)
      expect(row.category).toBe("DG Dinner")
      expect(Number(row.amount)).toBeCloseTo(QUICK_AMOUNT, 2)
    }).toPass({ timeout: 10000 })

    // ── Undo: reverts the split to pending and deletes the ledger row ────────
    await page.getByRole("button", { name: "Undo" }).click()
    await expect(quickRow.getByText("Pending", { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(quickRow.getByRole("button", { name: "Approve" })).toBeVisible({ timeout: 15000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/2b-after-undo-back-to-pending.png` })

    await expect(async () => {
      const { data: allocRows } = await sb.client.from("receipt_fund_allocations").select("status").eq("id", quickAllocationId)
      expect(allocRows?.[0]?.status).toBe("pending")
      const { data } = await sb.client.from("budget_entries").select("id").eq("receipt_allocation_id", quickAllocationId)
      expect(data?.length ?? 0).toBe(0)
    }).toPass({ timeout: 10000 })

    // ── Re-approve (proves Undo left the split cleanly re-approvable), leave it
    //    posted this time, and confirm the ledger row renders correctly. ───────
    await quickRow.getByRole("button", { name: "Approve" }).click()
    await expect(categorySelect).toBeVisible()
    await categorySelect.selectOption({ label: "DG Dinner" })
    await page.getByRole("button", { name: "Approve & post" }).click()
    // Wait for the Undo toast (only fires once the ledger POST has actually
    // completed server-side) — waiting on the optimistic "Approved" text alone
    // races the navigation below against the still-in-flight post request.
    await expect(page.getByText("Approved · added to budget ledger")).toBeVisible({ timeout: 15000 })
    await expect(quickRow.getByText("Approved", { exact: true })).toBeVisible()

    await page.goto(`/home?tab=plan&team=${financeTeamId}&fsec=budget`)
    await expect(page.getByText("Expense ledger", { exact: true })).toBeVisible({ timeout: 15000 })
    const ledgerDesc = page.getByText(QUICK_EVENT_NAME)
    await expect(ledgerDesc).toBeVisible({ timeout: 15000 })
    const ledgerRow = ledgerDesc.locator("xpath=ancestor::div[1]")
    await expect(ledgerRow.getByText("Church", { exact: true })).toBeVisible()
    await expect(ledgerRow.getByText(`$${QUICK_AMOUNT.toFixed(2)}`, { exact: true })).toBeVisible()
    await expect(ledgerRow.getByText("Reimbursement", { exact: true })).toBeVisible()
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/3-budget-ledger-posted-row.png` })
  })

  test("U5 fallback: 'Add to budget' still posts a pre-existing reimbursed, un-posted split", async ({ page }) => {
    const sb = sandbox()

    await page.goto(`/home?tab=plan&team=${financeTeamId}&fsec=reimbursements`)
    await expect(page.getByText("Reimbursements inbox")).toBeVisible({ timeout: 15000 })

    // The seeded receipt is already fully reimbursed → it doesn't "need action" —
    // switch the inbox filter to "All" to find it.
    await page.getByRole("button", { name: /Needs action/ }).click()
    await page.getByRole("menuitemradio", { name: "All" }).click()

    // Anchor on the (unique) dollar amount — rows now render "Name · Team" on one
    // combined line, so an exact submitter-name match no longer resolves.
    const fallbackAmount = page.getByText(`$${FALLBACK_AMOUNT.toFixed(2)}`, { exact: true })
    const row = fallbackAmount.locator("xpath=ancestor::div[1]")
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.click()

    await expect(page.getByText(`$${FALLBACK_AMOUNT.toFixed(2)}`).first()).toBeVisible()
    await expect(page.getByText("Reimbursed", { exact: true }).first()).toBeVisible()

    // Not yet posted — the ghost "Add to budget" affordance shows, not the check.
    await expect(page.getByText("In budget")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Add to budget" })).toBeVisible()

    // ── Post to budget: pick a category, confirm ─────────────────────────────
    await page.getByRole("button", { name: "Add to budget" }).click()
    const categorySelect = page.locator("select")
    await expect(categorySelect).toBeVisible()
    await categorySelect.selectOption({ label: "DG Dinner" })
    await page.getByRole("button", { name: "Add to budget" }).click()

    // Optimistic flip -> "In budget" check; the button is gone.
    await expect(page.getByText("In budget")).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole("button", { name: "Add to budget" })).toHaveCount(0)

    // ── DB assertion: exactly one budget_entries row, correctly attributed ───
    await expect(async () => {
      const { data } = await sb.client
        .from("budget_entries")
        .select("*")
        .eq("receipt_allocation_id", fallbackAllocationId)
      expect(data?.length).toBe(1)
      const row = data![0] as { fund: string; source: string; amount: number; category: string; receipt_allocation_id: string }
      expect(row.fund).toBe(churchFundSlug)
      expect(row.source).toBe("reimbursement")
      expect(row.receipt_allocation_id).toBe(fallbackAllocationId)
      expect(row.category).toBe("DG Dinner")
      expect(Number(row.amount)).toBeCloseTo(FALLBACK_AMOUNT, 2)
    }).toPass({ timeout: 10000 })

    // ── Re-post is impossible: reload, the check persists, the button never
    //    reappears (postedToBudget derives from the DB, not just local state). ──
    await page.reload()
    await expect(page.getByText("Reimbursements inbox")).toBeVisible({ timeout: 15000 })
    await page.getByRole("button", { name: /^Needs action/ }).click()
    await page.getByRole("menuitemradio", { name: "All" }).click()
    await page.getByText(`$${FALLBACK_AMOUNT.toFixed(2)}`, { exact: true }).locator("xpath=ancestor::div[1]").click()
    await expect(page.getByText("In budget")).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole("button", { name: "Add to budget" })).toHaveCount(0)
  })

  test("granular status: an approved-only split shows an Approved chip (not Pending) with the approval date on the rail", async ({ page }) => {
    await page.goto(`/home?tab=plan&team=${financeTeamId}&fsec=reimbursements`)
    await expect(page.getByText("Reimbursements inbox")).toBeVisible({ timeout: 15000 })

    // Needs-action (default filter): church-approved needs the president's
    // sign-off, so this row surfaces without switching filters. The row's root
    // is a plain div (not a button — deliverable 5's redesign dropped the old
    // button-per-row wrapper), so anchor on the (unique) dollar amount instead.
    const approvedAmount = page.getByText(`$${APPROVED_AMOUNT.toFixed(2)}`, { exact: true })
    const row = approvedAmount.locator("xpath=ancestor::div[1]")
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
    const categoryBId = (catB as { id: string }).id
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
