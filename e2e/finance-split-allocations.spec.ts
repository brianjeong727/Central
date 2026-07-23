// Regression coverage for Finance Overhaul P1 — split allocations. Seeds its own
// Finance team + external fund + a splittable receipt directly via sb.client (the
// e2e sandbox ministry has no seeded Finance team), then exercises the
// Reimbursements inbox as the single E2E admin (admin-tier bypasses server-side
// capability per computeFinanceCapability, so no separate treasurer/president/
// deacon actors are needed to reach the surface).
//
// FIXED (was broken as of 1c7872c): getReimbursementInbox / transitionAllocation /
// exportReceiptsCSV / the member split view all used a PostgREST embed hint
// `finance_funds!fund_id(...)`, but receipt_fund_allocations.fund_id is only part
// of the COMPOSITE FK `rfa_fund_same_ministry` (fund_id, ministry_id) ->
// finance_funds(id, ministry_id), so the embed silently returned no fund data and
// every receipt got `allocations: []`. The fix resolves fund name + kind via a
// SEPARATE query + Map (the file's established pattern, cf. teamNames/categoryNames),
// not an embed. This spec now asserts the CORRECT behavior — the pending allocation
// surfaces under "Needs action", the split renders on the receipt detail, and the
// per-allocation transition affordances appear — so it guards that fix.
import { test, expect } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

const SHOT_DIR = process.env.FIN_SHOT_DIR

test.describe("finance overhaul P1 — split allocations", () => {
  test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

  let financeTeamId = ""
  let cmuFundId = ""
  let churchFundId = ""
  let receiptId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()

    const { data: team, error } = await sb.client
      .from("teams")
      .insert({ ministry_id: sb.ministryId, name: `${E2E_PREFIX}Finance Split Test`, description: "e2e", team_type: "finance", created_by: adminId })
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
    const { data: cmu, error: cmue } = await sb.client
      .from("finance_funds")
      .insert({ ministry_id: sb.ministryId, name: `${E2E_PREFIX}CMU Grant`, slug: `e2e-cmu-${Date.now()}`, kind: "external", order_index: 1 })
      .select().single()
    if (cmue) throw cmue
    cmuFundId = cmu.id

    // Splittable receipt, default single Church allocation (mirrors submitReceipt's behavior).
    const { data: receipt, error: rce } = await sb.client
      .from("receipts")
      .insert({
        ministry_id: sb.ministryId, team_id: financeTeamId, submitted_by: adminId,
        submitted_by_name: "E2E Submitter", event_name: `${E2E_PREFIX}Coffeehouse Split`,
        category: "Supplies", fund: "church", amount: 111.17,
        purchase_date: "2026-07-01", status: "pending",
      })
      .select().single()
    if (rce) throw rce
    receiptId = receipt.id
    const { error: ae } = await sb.client
      .from("receipt_fund_allocations")
      .insert({ receipt_id: receiptId, ministry_id: sb.ministryId, fund_id: churchFundId, amount: 111.17, status: "pending" })
    if (ae) throw ae
  })

  test.afterAll(async () => {
    const sb = sandbox()
    if (receiptId) {
      // The church split now posts to the budget ledger at approve-time (U1) —
      // clean up its budget_entries row before deleting the allocation/receipt.
      const { data: allocs } = await sb.client.from("receipt_fund_allocations").select("id").eq("receipt_id", receiptId)
      const allocIds = ((allocs ?? []) as { id: string }[]).map(a => a.id)
      if (allocIds.length) await sb.client.from("budget_entries").delete().in("receipt_allocation_id", allocIds)
      await sb.client.from("receipt_fund_allocations").delete().eq("receipt_id", receiptId)
      await sb.client.from("receipts").delete().eq("id", receiptId)
    }
    if (cmuFundId) await sb.client.from("finance_funds").delete().eq("id", cmuFundId)
    if (financeTeamId) {
      await sb.client.from("team_members").delete().eq("team_id", financeTeamId)
      await sb.client.from("team_roles").delete().eq("team_id", financeTeamId)
      await sb.client.from("teams").delete().eq("id", financeTeamId)
    }
  })

  test("reimbursements inbox surfaces the split; full edit-split -> approve -> sign-off -> request -> reimburse lifecycle", async ({ page }) => {
    await page.goto(`/home?tab=plan&team=${financeTeamId}&fsec=reimbursements`)
    await expect(page.getByText("Reimbursements inbox")).toBeVisible({ timeout: 15000 })

    // The seeded pending Church allocation surfaces under "Needs action" (default
    // filter) — admin canApprove, church-pending needs approval. Rows now render
    // "Name · Team" on one combined line (deliverable 5), so anchor on the
    // (unique, single-text-node) dollar amount rather than the submitter name.
    const row = page.getByText("$111.17", { exact: true }).locator("xpath=ancestor::div[1]")
    await expect(row).toBeVisible({ timeout: 15000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/1-needs-action-row.png` })
    await row.click()

    // Detail opens with receipt-level fields...
    await expect(page.getByText("Coffeehouse Split")).toBeVisible()
    await expect(page.getByText("$111.17").first()).toBeVisible()

    // ...and the allocation split now renders: the Church fund chip, the "Edit split"
    // affordance (all allocations pending + canApprove), and the per-allocation
    // Approve/Reject transition buttons.
    await expect(page.getByText("Funding split")).toBeVisible()
    await expect(page.getByText("Church", { exact: true })).toBeVisible()
    await expect(page.getByText("Edit split")).toBeVisible()
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible()
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/2-detail-split-renders.png` })

    // ── Edit split: Church $71.17 + the seeded external CMU fund $40.00 ──────
    await page.getByText("Edit split").click()
    const fundSelects = page.locator("select")
    const amountInputs = page.locator('input[type="number"]')
    await amountInputs.first().fill("71.17")
    await page.getByRole("button", { name: "Add funding source" }).click()
    await fundSelects.nth(1).selectOption({ label: `${E2E_PREFIX}CMU Grant` })
    await amountInputs.nth(1).fill("40.00")
    await expect(page.getByText("$111.17 / $111.17")).toBeVisible()
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/3-split-editor-balanced.png` })
    await page.getByRole("button", { name: "Save split" }).click()

    // Split editor closes; both allocation source rows now render. (Generous
    // timeout — the split-save server action's first hit in a dev session pays
    // Next's on-demand route-compile cost on top of the write + rollup recompute.)
    await expect(page.getByRole("button", { name: "Saving…" })).toHaveCount(0, { timeout: 20000 })
    await expect(page.getByText("Edit split")).toBeVisible({ timeout: 20000 })
    await expect(page.getByText("Church", { exact: true })).toBeVisible()
    await expect(page.getByText(`${E2E_PREFIX}CMU Grant`)).toBeVisible()
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/4-split-saved-two-sources.png` })

    // Scope waits per-card by the (unique) split amount — the stepper always
    // renders "Submitted/Approved/Reimbursed" as step LABELS regardless of actual
    // status (just dimmed), so a bare `getByText("Reimbursed")` is true even
    // before any action runs. The one thing that's reliably absent once a row
    // leaves a stage is that stage's action button, scoped to its own card.
    // Scope actions per-card via the ancestor allocation-row container (3 divs up
    // from the amount span: chip+amount wrapper -> header row -> the card itself —
    // verified against the rendered DOM: div[3] is exactly {Reject, Approve} /
    // {Reject, File grant request}, i.e. this card's own two action buttons).
    const churchAmount = page.getByText("$71.17", { exact: true })
    const cmuAmount = page.getByText("$40.00", { exact: true })
    const churchCard = churchAmount.locator("xpath=ancestor::div[3]")
    const cmuCard = cmuAmount.locator("xpath=ancestor::div[3]")

    // ── Approve the Church allocation: one motion (U1) — a category confirm
    //    (pre-matched, then explicitly set) -> approve + post to the ledger. ───
    await churchCard.getByRole("button", { name: "Approve" }).click()
    const churchCategorySelect = churchCard.locator("select")
    await expect(churchCategorySelect).toBeVisible()
    await churchCategorySelect.selectOption({ label: "DG Dinner" })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/4b-church-approve-category-confirm.png` })
    await churchCard.getByRole("button", { name: "Approve & post" }).click()
    await expect(churchCard.getByRole("button", { name: "Reject" })).toHaveCount(0, { timeout: 10000 })
    await expect(churchCard.getByRole("button", { name: "Sign off" })).toBeVisible({ timeout: 15000 })
    await churchCard.getByRole("button", { name: "Sign off" }).click()
    await expect(churchCard.getByRole("button", { name: "Decline" })).toHaveCount(0, { timeout: 10000 })
    await expect(churchCard.getByText("Reimbursed", { exact: true }).first()).toBeVisible()
    // U5: a fresh church approval posts at approve-time — no fallback "Add to
    // budget" ghost affordance ever shows for it; it's already "In budget".
    await expect(churchCard.getByText("In budget")).toBeVisible({ timeout: 10000 })
    await expect(churchCard.getByRole("button", { name: "Add to budget" })).toHaveCount(0)
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/5-church-reimbursed.png` })

    // ── External (CMU) allocation: File grant request → Confirm reimbursed ───
    await cmuCard.getByRole("button", { name: "File grant request" }).click()
    await expect(cmuCard.getByRole("button", { name: "Reject" })).toHaveCount(0, { timeout: 10000 })
    await expect(cmuCard.getByRole("button", { name: "Confirm reimbursed" })).toBeVisible()
    await cmuCard.getByRole("button", { name: "Confirm reimbursed" }).click()
    await expect(cmuCard.getByRole("button", { name: "Decline" })).toHaveCount(0, { timeout: 10000 })
    // External funds don't route through the approve->post motion — U5's
    // fallback "Add to budget" affordance still shows for them.
    await expect(cmuCard.getByRole("button", { name: "Add to budget" })).toBeVisible({ timeout: 10000 })
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/6-both-sources-reimbursed.png` })

    // ── Settings → Funds section (independent of the broken join — uses
    // getFinanceFunds, not the receipt_fund_allocations embed) renders correctly. ──
    await page.goto("/home?tab=settings&stab=workspace")
    await expect(page.getByRole("heading", { name: "Funding sources" })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(`${E2E_PREFIX}CMU Grant`)).toBeVisible()
    await expect(page.getByText("Church", { exact: true }).first()).toBeVisible()
    if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/7-settings-funds-ok.png` })
  })
})
