import { test, expect } from "@playwright/test"
import { sandbox, memberState } from "./fixtures"

// /j/<CODE> — the one-scan invite join link. See
// .claude/task-context/invite-join-link/context.md for the ratified spec and
// .claude/task-context/invite-join-link/review-design.md for the security review
// this feature was built against.
//
// This spec mutates ONLY the E2E sandbox ministry's own invite_code/staff_invite_code
// columns and the E2E member's own gender field — both restored in afterAll/afterEach.
// It never touches any other ministry's rows (Tester hard rule).

const VALID_CODE = "TESTCADE01"  // 10 chars, Crockford-safe (no I/L/O/U)
const STAFF_CODE = "STAFFCADE1"  // 10 chars, Crockford-safe
const UNKNOWN_CODE = "ZZZZZZZZZZ" // well-formed, matches nothing

let originalInviteCode: string | null = null
let originalStaffCode: string | null = null
let originalGender: string | null = null

test.beforeAll(async () => {
  const sb = sandbox()
  const { data, error } = await sb.client
    .from("ministries")
    .select("invite_code, staff_invite_code")
    .eq("id", sb.ministryId)
    .single()
  if (error) throw error
  originalInviteCode = data.invite_code
  originalStaffCode = data.staff_invite_code

  const { error: setErr } = await sb.client
    .from("ministries")
    .update({ invite_code: VALID_CODE, staff_invite_code: STAFF_CODE })
    .eq("id", sb.ministryId)
  if (setErr) throw setErr

  const memberId = await sb.memberUserId()
  const { data: prof, error: profErr } = await sb.client
    .from("profiles")
    .select("gender")
    .eq("id", memberId)
    .single()
  if (profErr) throw profErr
  originalGender = prof.gender
})

test.afterAll(async () => {
  const sb = sandbox()
  await sb.client
    .from("ministries")
    .update({ invite_code: originalInviteCode, staff_invite_code: originalStaffCode })
    .eq("id", sb.ministryId)

  const memberId = await sb.memberUserId()
  await sb.client.from("profiles").update({ gender: originalGender }).eq("id", memberId)
})

test.describe("/j/<CODE> — unauthenticated", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("unknown well-formed code renders the invalid state, 200, not bounced to /landing", async ({ page }) => {
    const resp = await page.goto(`/j/${UNKNOWN_CODE}`)
    expect(resp?.status()).toBe(200)
    await expect(page).toHaveURL(new RegExp(`/j/${UNKNOWN_CODE}`))
    await expect(page.getByText("This invite link isn't valid.")).toBeVisible()
  })

  test("staff code renders the SAME invalid state — no oracle", async ({ page }) => {
    const resp = await page.goto(`/j/${STAFF_CODE}`)
    expect(resp?.status()).toBe(200)
    await expect(page.getByText("This invite link isn't valid.")).toBeVisible()
    // Must not confirm this is a real (staff) code in any way.
    await expect(page.getByText(/staff/i)).toHaveCount(0)
  })

  test("unknown code and staff code render byte-identical visible copy (anti-oracle)", async ({ page }) => {
    // Compares rendered TEXT (not raw HTML) — Next dev mode injects a per-request
    // React hydration id into a <script> tag that differs run to run regardless of
    // page content; that is a dev-server artifact, not information the app discloses.
    await page.goto(`/j/${UNKNOWN_CODE}`)
    const unknownText = await page.locator("body").innerText()
    await page.goto(`/j/${STAFF_CODE}`)
    const staffText = await page.locator("body").innerText()
    expect(staffText).toBe(unknownText)
  })

  test("valid member code shows the ministry name and both CTAs", async ({ page }) => {
    const sb = sandbox()
    const name = await sb.ministryName()
    await page.goto(`/j/${VALID_CODE}`)
    await expect(page.getByText("You're invited")).toBeVisible()
    await expect(page.getByRole("heading", { name: new RegExp(name) })).toBeVisible()

    const createLink = page.getByRole("link", { name: "Create your account" })
    await expect(createLink).toHaveAttribute("href", `/signup?intent=join&invite=${VALID_CODE}`)

    const loginLink = page.getByRole("link", { name: "I already have an account" })
    await expect(loginLink).toHaveAttribute("href", `/login?intent=join&invite=${VALID_CODE}`)
  })
})

test.describe("/j/<CODE> — signed in, cross-tenant safety (BLOCK 1 regression)", () => {
  test.use({ storageState: memberState })

  test("already a member of THIS ministry → redirected to /home, no write occurs", async ({ page }) => {
    const sb = sandbox()
    const memberId = await sb.memberUserId()
    const before = await sb.client.from("profiles").select("ministry_id, role").eq("id", memberId).single()

    await page.goto(`/j/${VALID_CODE}`)
    await page.waitForURL(/\/home/, { timeout: 15_000 })

    const after = await sb.client.from("profiles").select("ministry_id, role").eq("id", memberId).single()
    expect(after.data?.ministry_id).toBe(before.data?.ministry_id)
    expect(after.data?.role).toBe(before.data?.role)
  })

  test("no-ministry member sees the join landing and must tap — GET performs no write", async ({ page }) => {
    const sb = sandbox()
    const memberId = await sb.memberUserId()
    const { data: before } = await sb.client.from("profiles").select("ministry_id, role").eq("id", memberId).single()

    // Arrange: detach the member from any ministry (sandbox user only).
    await sb.client.from("profiles").update({ ministry_id: null }).eq("id", memberId)

    try {
      const resp = await page.goto(`/j/${VALID_CODE}`)
      expect(resp?.status()).toBe(200)
      // Landing rendered — the join has NOT happened yet (no auto-join on GET).
      await expect(page.getByRole("button", { name: /^Join /, exact: false })).toBeVisible()
      const { data: afterLoad } = await sb.client.from("profiles").select("ministry_id").eq("id", memberId).single()
      expect(afterLoad?.ministry_id).toBeNull()

      // Explicit tap performs the join.
      await page.getByRole("button", { name: /^Join /, exact: false }).click()
      await page.waitForURL(/\/home/, { timeout: 30_000, waitUntil: "commit" })
      const { data: afterJoin } = await sb.client.from("profiles").select("ministry_id, role").eq("id", memberId).single()
      expect(afterJoin?.ministry_id).toBe(sb.ministryId)
      expect(afterJoin?.role).toBe("member")
    } finally {
      // Restore regardless of outcome.
      await sb.client.from("profiles").update({ ministry_id: sb.ministryId, role: before?.role ?? "member" }).eq("id", memberId)
    }
  })
})

test.describe("/j/<CODE> — /complete-profile transparency", () => {
  test.use({ storageState: memberState })

  test("incomplete member is sent to /complete-profile?next=/j/<CODE> and returns after completing", async ({ page }) => {
    const sb = sandbox()
    const memberId = await sb.memberUserId()
    const { data: before } = await sb.client.from("profiles").select("ministry_id, role, gender").eq("id", memberId).single()

    // Detach from the ministry too, so /j/<CODE> renders the join LANDING on
    // return instead of the "already a member" no-op redirect (which would make
    // this test indistinguishable from the no-op case — the point here is
    // specifically that the round trip lands on /j/<CODE>, not /home directly).
    await sb.client.from("profiles").update({ gender: null, ministry_id: null }).eq("id", memberId)
    await page.context().clearCookies({ name: "central-mw" })

    try {
      await page.goto(`/j/${VALID_CODE}`)
      await page.waitForURL(new RegExp(`/complete-profile\\?next=%2Fj%2F${VALID_CODE}`), { timeout: 30_000, waitUntil: "commit" })
      await expect(page.getByText("A couple details.").first()).toBeVisible({ timeout: 10_000 })

      const genderPill = page.getByRole("button", { name: "Male", exact: true }).first()
      await genderPill.click()
      const gradSelect = page.locator("select").filter({ visible: true }).first()
      if (await gradSelect.count()) {
        const nextYear = new Date().getFullYear() + 3
        await gradSelect.selectOption(String(nextYear)).catch(() => {})
      }
      await page.getByRole("button", { name: "Continue" }).first().click()

      // Returns to /j/<CODE> — the join landing, not /home directly.
      await page.waitForURL(new RegExp(`/j/${VALID_CODE}`), { timeout: 30_000, waitUntil: "commit" })
      await expect(page.getByRole("button", { name: /^Join /, exact: false })).toBeVisible({ timeout: 10_000 })
    } finally {
      await sb.client.from("profiles").update({
        gender: before?.gender ?? "female",
        ministry_id: before?.ministry_id ?? sb.ministryId,
        role: before?.role ?? "member",
      }).eq("id", memberId)
    }
  })
})

test.describe("Invite code validators agree by import", () => {
  test("lib/invite-code.ts is imported by /j/[code], /auth/callback, and joinMinistryByCode", async () => {
    // Static check (no source edits performed by this test) — confirms the three
    // validators share ONE definition rather than three hand-copied regexes.
    const { execSync } = await import("node:child_process")
    const grep = (pattern: string) =>
      execSync(`grep -l "${pattern}" app/j/[code]/page.tsx app/auth/callback/route.ts app/actions/ministry.ts`, {
        cwd: process.cwd(),
      }).toString()
    expect(grep("from \\\"@/lib/invite-code\\\"")).toContain("app/j/[code]/page.tsx")
    expect(grep("from \\\"@/lib/invite-code\\\"")).toContain("app/auth/callback/route.ts")
    expect(grep("from \\\"@/lib/invite-code\\\"")).toContain("app/actions/ministry.ts")
  })
})
