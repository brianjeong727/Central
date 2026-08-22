import { test, expect } from "@playwright/test"
import { adminState, sandbox } from "./fixtures"

// Custom join codes turn instant join into request-to-join. The whole point of the
// trade is that guessing a memorable code gets you a QUEUE ENTRY rather than a
// membership — so the assertions that matter are: the code can be claimed, the link
// resolves, a stranger's tap creates a request and NOT a member, and approval is what
// admits them, through the same write instant join uses.
//
// The code is UNIQUE PER RUN. Re-running with the code already stored would leave the
// Save button correctly disabled (nothing changed), and the suite would fail for a
// reason that is not a defect.
const CUSTOM = `E2EC${Date.now().toString(36).toUpperCase().slice(-6)}`

test.use({ storageState: adminState })

test.describe("custom invite code → request to join", () => {
  // Put the tenant back on a generated code. Leaving it custom would flip every other
  // spec's ministry into request-to-join and break joins they assume are instant.
  test.afterAll(async () => {
    const sb = sandbox()
    await sb.client
      .from("ministries")
      .update({ invite_code_is_custom: false })
      .eq("id", sb.ministryId)
  })

  test("an admin claims a custom code, and the card changes what it says the code DOES", async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto("/home?tab=settings&stab=workspace", { waitUntil: "networkidle" })
    await page.waitForTimeout(2000)

    await page.getByRole("button", { name: /choose your own code|change code/i }).first().click()

    const field = page.locator("#custom-code")
    await expect(field).toBeVisible({ timeout: 20_000 })
    await field.fill(CUSTOM)

    await page.getByRole("button", { name: "Save code", exact: true }).click()

    // The cost is named BEFORE committing: a new code IS a new link (the link is
    // derived from the code, never stored), so every poster and QR carrying the old
    // one dies the instant this saves.
    await expect(page.getByText(`/j/${CUSTOM}`, { exact: false })).toBeVisible({ timeout: 10_000 })
    await page.getByRole("button", { name: /yes, change it/i }).click()

    await expect(page.getByText(/people who enter it ask to join/i)).toBeVisible({ timeout: 20_000 })
  })

  test("the form refuses what the server would refuse", async ({ page }) => {
    await page.goto("/home?tab=settings&stab=workspace", { waitUntil: "networkidle" })
    await page.waitForTimeout(2000)
    await page.getByRole("button", { name: /choose your own code|change code/i }).first().click()
    const field = page.locator("#custom-code")
    await expect(field).toBeVisible({ timeout: 20_000 })

    // Same predicate the action runs, so the form and the server cannot disagree.
    await field.fill("ABC")
    await expect(page.getByText(/at least 6 characters/i)).toBeVisible()

    await field.fill("CENTRAL")
    await expect(page.getByText(/reserved/i)).toBeVisible()
  })

  test("a stranger's tap creates a REQUEST, and approval is what admits them", async ({ browser }) => {
    test.setTimeout(240_000)
    const sb = sandbox()

    // A GENUINE stranger. The e2e member already belongs to this ministry, so /j/
    // would redirect them home and the request path would never run. Minted here and
    // torn down in `finally`, so the shared tenant is left as it was found.
    const email = `e2e-requester-${Date.now()}@example.com`
    const password = "e2e-Requester-Pass-1"
    const { data: created, error: createErr } = await sb.client.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name: "Reqi Tester" },
    })
    expect(createErr, `could not mint a requester: ${createErr?.message}`).toBeNull()
    const requesterId = created!.user!.id
    // handle_new_user creates the profile; it must carry NO ministry, which is the
    // condition the whole flow is about.
    //
    // gender + graduation_year are set for a boring reason worth writing down: proxy's
    // profile-completeness gate bounces an incomplete member-tier user to
    // /complete-profile from any non-exempt path, and /j/ is not exempt. A real
    // invitee meets that gate too and comes back via ?next — but this spec is about
    // the REQUEST flow, and routing it through a second gate would make a failure here
    // ambiguous between the two.
    await sb.client
      .from("profiles")
      .update({ ministry_id: null, gender: "male", graduation_year: 2027 })
      .eq("id", requesterId)

    try {
      // EXPLICITLY empty, not merely unspecified. A bare browser.newContext() came up
      // as the signed-in admin (the file-level storageState reaches it), so the
      // "stranger" was the admin and /j/ redirected them straight to /home.
      const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      const page = await ctx.newPage()
      await page.goto("/login")
      await page.getByPlaceholder("you@university.edu").fill(email)
      await page.getByPlaceholder("••••••••").fill(password)
      await page.getByRole("button", { name: "Sign in" }).click()
      await page.waitForTimeout(5000)

      await page.goto(`/j/${CUSTOM}`, { waitUntil: "networkidle" })
      await page.waitForTimeout(2000)

      const ask = page.getByRole("button", { name: /ask to join/i }).first()
      await expect(ask, "a custom code must offer ASK, not JOIN").toBeVisible({ timeout: 20_000 })
      await ask.click()
      await expect(page.getByText(/asked to join/i)).toBeVisible({ timeout: 20_000 })

      // A second tap is idempotent. 23505 on the partial unique index means they
      // double-tapped, which is success — never an error to show a person.
      await page.goto(`/j/${CUSTOM}`, { waitUntil: "networkidle" })
      await page.waitForTimeout(1500)
      const again = page.getByRole("button", { name: /ask to join/i }).first()
      if (await again.count()) {
        await again.click()
        await expect(page.getByText(/asked to join/i)).toBeVisible({ timeout: 20_000 })
      }

      // THE ASSERTION THAT MATTERS: a queue entry, and NOT a membership.
      const { data: reqs } = await sb.client
        .from("ministry_join_requests")
        .select("id, status")
        .eq("ministry_id", sb.ministryId)
        .eq("user_id", requesterId)
      expect(reqs?.length, "one request, not one per tap").toBe(1)
      expect(reqs![0].status).toBe("pending")

      const { data: prof } = await sb.client
        .from("profiles").select("ministry_id").eq("id", requesterId).maybeSingle()
      expect(prof?.ministry_id, "guessing a memorable code must not grant membership").toBeNull()

      // ── Approval ──
      const adminCtx = await browser.newContext({ storageState: adminState })
      const adminPage = await adminCtx.newPage()
      await adminPage.goto("/home?tab=settings&stab=workspace", { waitUntil: "networkidle" })
      await adminPage.waitForTimeout(3000)

      await expect(adminPage.getByText("Waiting to join", { exact: false })).toBeVisible({ timeout: 20_000 })
      // The name RESOLVES. Through RLS this row would render blank — profiles SELECT
      // is ministry-scoped and the requester is outside it — which is the entire
      // reason the queue is served by a service-role action.
      await expect(
        adminPage.getByText("Reqi Tester", { exact: false }),
        "the queue must show a person, not a uuid",
      ).toBeVisible({ timeout: 20_000 })

      await adminPage.getByRole("button", { name: /^approve$/i }).first().click()
      await adminPage.waitForTimeout(5000)

      const { data: after } = await sb.client
        .from("profiles").select("ministry_id, role").eq("id", requesterId).maybeSingle()
      expect(after?.ministry_id, "approval is what admits them").toBe(sb.ministryId)
      expect(after?.role).toBe("member")

      // Through the SHARED admit path, not a second copy of the write — so
      // user_ministries is mirrored exactly as instant join mirrors it.
      const { data: um } = await sb.client
        .from("user_ministries").select("role")
        .eq("user_id", requesterId).eq("ministry_id", sb.ministryId)
      expect(um?.length, "user_ministries must be written too").toBe(1)

      await ctx.close()
      await adminCtx.close()
    } finally {
      await sb.client.from("ministry_join_requests").delete().eq("user_id", requesterId)
      await sb.client.from("user_ministries").delete().eq("user_id", requesterId)
      await sb.client.from("profiles").delete().eq("id", requesterId)
      await sb.client.auth.admin.deleteUser(requesterId)
    }
  })
})
