// /pick-ministry at phone width — the cdesign "Choose Ministry" adoption.
//
// The multi-ministry switcher only renders its full shape for a user in 2+ active
// ministries, and no fixture user is. Rather than grant a lane user membership in the
// OTHER lane's tenant (which would perturb that lane's member counts), this spec stands
// up its own disposable ministry, joins the lane admin to it, and tears both down in
// afterAll — so it is lane-agnostic and leaves no residue in either E2E tenant.
//
// Everything it creates is prefixed E2E:: per the fixtures convention.
import { test, expect } from "@playwright/test"
import { adminState, sandbox, E2E_PREFIX } from "./fixtures"

test.use({ storageState: adminState })

const TEMP_MINISTRY_NAME = `${E2E_PREFIX} Second Ministry`
const TEMP_UNIVERSITY = "Second University"

// Fixed instants so ordering and the rendered stamp are deterministic.
const LEAD_OPENED_AT = "2026-07-20T17:00:00.000Z"
const OTHER_OPENED_AT = "2026-07-12T17:00:00.000Z"

let tempMinistryId = ""
let adminId = ""
let originalMinistryId = ""
let originalRole = ""
// True when this spec had to create the lane membership row itself — cleanup then
// removes it rather than merely clearing the stamp, so the tenant is left as found.
let createdLaneMembership = false

test.beforeAll(async () => {
  const sb = sandbox()
  const db = sb.client
  adminId = await sb.adminUserId()

  // Remember where the admin currently lives so afterAll can put them back —
  // selecting a ministry rewrites profiles.ministry_id + role.
  const { data: before, error: beforeErr } = await db
    .from("profiles").select("ministry_id, role").eq("id", adminId).single()
  if (beforeErr) throw beforeErr
  originalMinistryId = (before as { ministry_id: string }).ministry_id
  originalRole = (before as { role: string }).role

  const { data: created, error: mErr } = await db
    .from("ministries")
    .insert({
      name: TEMP_MINISTRY_NAME,
      university: TEMP_UNIVERSITY,
      size: "small",
      invite_code: `E2E${Date.now().toString().slice(-6)}`,
      created_by: adminId,
      status: "active",
      hidden_from_discovery: true,
    })
    .select("id").single()
  if (mErr) throw mErr
  tempMinistryId = (created as { id: string }).id

  const { error: jErr } = await db.from("user_ministries").insert({
    user_id: adminId, ministry_id: tempMinistryId, role: "member",
    last_opened_at: OTHER_OPENED_AT,
  })
  if (jErr) throw jErr

  // Make the lane tenant the most-recently-opened so the lead card is deterministic.
  //
  // NOTE: the seeded fixture users have NO user_ministries row for their own tenant —
  // seed-e2e.mjs writes profiles.ministry_id directly, and only the join/approval flows
  // ever insert into user_ministries. So this has to INSERT, not just update; a bare
  // update would silently affect 0 rows and the lane tenant would never appear in the
  // switcher at all (that is a real product gap, tracked separately — a user in that
  // state cannot see or switch back into their own ministry).
  const { data: existing } = await db
    .from("user_ministries").select("id")
    .eq("user_id", adminId).eq("ministry_id", sb.ministryId).maybeSingle()

  if (existing) {
    createdLaneMembership = false
    const { error: sErr } = await db
      .from("user_ministries").update({ last_opened_at: LEAD_OPENED_AT })
      .eq("user_id", adminId).eq("ministry_id", sb.ministryId)
    if (sErr) throw sErr
  } else {
    createdLaneMembership = true
    const { error: sErr } = await db.from("user_ministries").insert({
      user_id: adminId, ministry_id: sb.ministryId, role: originalRole,
      last_opened_at: LEAD_OPENED_AT,
    })
    if (sErr) throw sErr
  }
})

test.afterAll(async () => {
  const sb = sandbox()
  const db = sb.client
  if (!adminId) return

  if (tempMinistryId) {
    await db.from("user_ministries").delete().eq("ministry_id", tempMinistryId)
    await db.from("ministries").delete().eq("id", tempMinistryId)
  }
  // Restore the admin's home tenant and clear the stamp we planted.
  if (originalMinistryId) {
    await db.from("profiles")
      .update({ ministry_id: originalMinistryId, role: originalRole })
      .eq("id", adminId)
  }
  if (createdLaneMembership) {
    await db.from("user_ministries")
      .delete().eq("user_id", adminId).eq("ministry_id", sb.ministryId)
  } else {
    await db.from("user_ministries")
      .update({ last_opened_at: null })
      .eq("user_id", adminId).eq("ministry_id", sb.ministryId)
  }
})

test("phone switcher renders both sections and switching restamps recency", async ({ page }) => {
  const sb = sandbox()
  const leadName = await sb.ministryName()
  const adminName = await sb.adminName()

  await page.goto("/pick-ministry")

  // BOTH viewport branches render into the DOM — Tailwind's `hidden` only hides the
  // desktop one visually — so every text query must be scoped to the mobile container
  // or it resolves to two elements and trips strict mode.
  const screen = page.locator("div.md\\:hidden").first()

  // No error surfaced where the cards belong (guards the "column does not exist" class
  // of failure, which renders a plausible-looking page with the list silently missing).
  await expect(screen.getByText(/does not exist|permission denied/i)).toHaveCount(0)

  // Header + both section kickers. CSS uppercases them, so match case-insensitively.
  await expect(screen.getByRole("heading", { name: "Choose a ministry" })).toBeVisible()
  await expect(screen.getByText(/^last opened$/i)).toBeVisible()
  await expect(screen.getByText(/^your other ministries$/i)).toBeVisible()

  // Lead card = most recently opened; the other ministry sits in the row card below it
  // and carries its "Last opened <date>" stamp (device-local, so assert the label only).
  await expect(screen.getByText(leadName, { exact: true })).toBeVisible()
  await expect(screen.getByText(TEMP_MINISTRY_NAME, { exact: true })).toBeVisible()
  await expect(screen.getByText(TEMP_UNIVERSITY, { exact: true })).toBeVisible()
  await expect(screen.getByText(/^Last opened /)).toBeVisible()

  // Footer identity + the always-available exits.
  await expect(screen.getByText(adminName, { exact: true })).toBeVisible()
  await expect(screen.getByRole("button", { name: /join another ministry/i })).toBeVisible()
  await expect(screen.getByRole("button", { name: /sign out/i })).toBeVisible()

  await page.screenshot({ path: "test-results/pick-ministry-mobile.png", fullPage: true })

  // Switch into the non-lead ministry — this is the stamp write.
  //
  // The post-switch destination is NOT always /home: handleSelect sends the browser to
  // /home, but the complete-profile gate intercepts when the profile is missing fields
  // the newly-selected ministry requires — which a freshly-created ministry always is.
  // Both destinations mean the switch succeeded; asserting /home alone would fail on
  // correct behaviour.
  await screen.getByText(TEMP_MINISTRY_NAME, { exact: true }).click()
  await page.waitForURL(/\/(home|complete-profile)/, { timeout: 30_000 })

  // The stamp landed on the RIGHT row: the switched-to membership moved forward, and
  // the other membership's planted instant is untouched (a ministry_id-only filter
  // would have rewritten every row for that tenant).
  const db = sandbox().client
  const { data: rows, error } = await db
    .from("user_ministries").select("ministry_id, last_opened_at").eq("user_id", adminId)
  if (error) throw error
  const stamped = (rows as Array<{ ministry_id: string; last_opened_at: string | null }>)
  const temp = stamped.find((r) => r.ministry_id === tempMinistryId)
  const lead = stamped.find((r) => r.ministry_id === sb.ministryId)
  expect(temp?.last_opened_at).not.toBeNull()
  expect(new Date(temp!.last_opened_at!).getTime()).toBeGreaterThan(new Date(LEAD_OPENED_AT).getTime())
  // Compare as INSTANTS, not strings: Postgres renders timestamptz as "+00:00" while the
  // planted literal used "Z". Same moment, different text — a string compare fails here
  // for a reason that has nothing to do with the code under test.
  expect(new Date(lead!.last_opened_at!).getTime()).toBe(new Date(LEAD_OPENED_AT).getTime())

  // Put the admin back in their home tenant BEFORE re-reading the picker: the switch
  // above left them in the freshly-created ministry, where the complete-profile gate
  // would intercept /pick-ministry. This restores routing only — it does not touch the
  // user_ministries stamps, so the recency order under test is unaffected.
  await db.from("profiles")
    .update({ ministry_id: originalMinistryId, role: originalRole }).eq("id", adminId)

  // And the picker now leads with the just-opened ministry — scoped to the mobile
  // branch so the desktop branch's (unsorted) copy of the same names can't satisfy it.
  await page.goto("/pick-ministry")
  const screen2 = page.locator("div.md\\:hidden").first()
  await expect(screen2.getByText(TEMP_MINISTRY_NAME, { exact: true })).toBeVisible()
  const mobileText = await screen2.innerText()
  expect(mobileText.indexOf(TEMP_MINISTRY_NAME)).toBeLessThan(mobileText.indexOf(leadName))
})
