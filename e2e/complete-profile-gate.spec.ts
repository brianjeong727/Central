import { test, expect } from "@playwright/test"
import { sandbox, memberState } from "./fixtures"

// OAuth onboarding gate (proxy.ts + app/complete-profile/page.tsx).
//
// Member/visitor-tier profiles missing gender OR graduation_year get
// redirected to /complete-profile (with a sanitized ?next) on every protected
// request; admin-tier is exempt; the page itself must never redirect-loop.
//
// The sandbox member (E2E_MEMBER_EMAIL) is SHARED across the whole e2e suite
// (auth.setup + every memberState spec) and must be left COMPLETE afterward —
// this spec records its true original gender/graduation_year, nulls them out
// to exercise the gate, and restores the originals in afterAll.

let originalGender: string | null = null
let originalGradYear: number | null = null
// The gate now PLACES the member in their class chat as well as writing the year
// (see below). That membership is a side effect on a shared sandbox member, and
// leaving it behind would make the assertion pass on a run where the fix had been
// reverted — so it is recorded here and restored in afterAll.
let gatedClassChatId: string | null = null
let wasInGatedClassChat = false

// The year the gate test picks. Also names the class chat it must land in.
// Deliberately NOT a year any other spec uses: young-adult-cohort.mobile parks
// the SHARED sandbox member in "Class of {currentYear + 3}" and asserts they get
// moved OUT of it, so borrowing that room made the two specs fight over one
// membership row depending on which ran last. +5 is inside the form's own range
// (currentYear … currentYear + 6) and belongs to this spec alone.
const GATE_YEAR = new Date().getFullYear() + 5
// Whether "Class of {GATE_YEAR}" existed before this file ran. If the gate minted
// it, afterAll takes it away again rather than leaving a room behind in a sandbox
// every other spec reads.
let gatedClassChatPreexisted = false

test.beforeAll(async () => {
  const sb = sandbox()
  const memberId = await sb.memberUserId()
  const { data, error } = await sb.client
    .from("profiles")
    .select("gender, graduation_year")
    .eq("id", memberId)
    .single()
  if (error) throw error
  originalGender = data.gender
  originalGradYear = data.graduation_year

  // Was the member ALREADY in the class chat this run will make them join? If so
  // the afterAll must leave them there.
  const { data: preChat } = await sb.client
    .from("groups")
    .select("id")
    .eq("ministry_id", sb.ministryId)
    .eq("type", "church")
    .eq("name", `Class of ${GATE_YEAR}`)
    .or("archived.is.null,archived.eq.false")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (preChat) {
    gatedClassChatId = preChat.id
    gatedClassChatPreexisted = true
    const { data: preSeat } = await sb.client
      .from("group_members")
      .select("user_id")
      .eq("group_id", preChat.id)
      .eq("user_id", memberId)
      .maybeSingle()
    wasInGatedClassChat = !!preSeat
  }
})

test.afterAll(async () => {
  const sb = sandbox()
  const memberId = await sb.memberUserId()
  const { error } = await sb.client
    .from("profiles")
    .update({ gender: originalGender, graduation_year: originalGradYear })
    .eq("id", memberId)
  if (error) throw error
  if (gatedClassChatId && !gatedClassChatPreexisted) {
    // This spec created the room — remove it whole (memberships cascade).
    await sb.client.from("group_members").delete().eq("group_id", gatedClassChatId)
    await sb.client.from("groups").delete().eq("id", gatedClassChatId)
  } else if (gatedClassChatId) {
    if (wasInGatedClassChat) {
      await sb.client
        .from("group_members")
        .upsert([{ group_id: gatedClassChatId, user_id: memberId }], {
          onConflict: "group_id,user_id",
          ignoreDuplicates: true,
        })
    } else {
      await sb.client
        .from("group_members")
        .delete()
        .eq("group_id", gatedClassChatId)
        .eq("user_id", memberId)
    }
  }
})

test.describe("OAuth onboarding gate", () => {
  test.use({ storageState: memberState })

  test("incomplete member is gated off /home, completes the form, lands back on /home with the profile persisted", async ({ page }) => {
    const sb = sandbox()
    const memberId = await sb.memberUserId()

    // Arrange: null out both fields (the OAuth/native-mint state).
    const { error: nullErr } = await sb.client
      .from("profiles")
      .update({ gender: null, graduation_year: null })
      .eq("id", memberId)
    if (nullErr) throw nullErr

    // ...AND evict them from the class chat. Nulling the columns alone is not the
    // broken state: the sandbox member is already seated in every class chat this
    // suite has ever put them in, so the membership assertion below would pass
    // against a build where the gate never places anyone. The bug being guarded is
    // precisely "cohort on the profile, no seat in the room" — arrange it.
    if (gatedClassChatId) {
      const { error: evictErr } = await sb.client
        .from("group_members")
        .delete()
        .eq("group_id", gatedClassChatId)
        .eq("user_id", memberId)
      if (evictErr) throw evictErr
    }

    // Drop the proxy's routing-cache cookie first. proxy.ts caches the routing decision
    // — INCLUDING profile-completeness — in the signed `central-mw` cookie for 5 minutes,
    // and only caches the settled state (complete profile). auth.setup runs seconds before
    // this test and mints a FRESH cookie with pc=true, so without this the proxy serves the
    // cached "complete" verdict, never re-reads the nulled columns, and the gate never
    // fires. It passed only when the cookie happened to be older than the TTL — i.e. the
    // test was order- and clock-dependent. A real OAuth mint has no such cookie.
    await page.context().clearCookies({ name: "central-mw" })

    // Assert: navigating to a protected path redirects to /complete-profile?next=...
    await page.goto("/home")
    await page.waitForURL(/\/complete-profile\?next=%2Fhome/, { timeout: 15_000 })

    // Assert the loop is GONE: the page itself renders the form, not a redirect storm.
    await expect(page.getByText("A couple details.").first()).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/\/complete-profile/)

    // Fill + submit.
    const genderPill = page.getByRole("button", { name: "Male", exact: true }).first()
    await genderPill.click()
    // Graduation year is a <select> (a free-text year invited typos and offered
    // values the form's own range check then rejected).
    const gradYear = page.locator("select").filter({ visible: true }).first()
    const nextYear = GATE_YEAR
    await gradYear.selectOption(String(nextYear))
    await page.getByRole("button", { name: "Continue" }).first().click()

    // Assert: returns to the ?next destination.
    await page.waitForURL(/\/home/, { timeout: 15_000 })
    await expect(page).not.toHaveURL(/\/complete-profile/)

    // Assert: persisted, not just a client-side redirect.
    const { data: persisted, error: readErr } = await sb.client
      .from("profiles")
      .select("gender, graduation_year")
      .eq("id", memberId)
      .single()
    if (readErr) throw readErr
    expect(persisted.gender).toBe("male")
    expect(persisted.graduation_year).toBe(nextYear)

    // The year and the CLASS CHAT have to move together. Writing the column alone
    // is what left members with "Class of 2027" on their profile and no seat in the
    // room — placed at ministry-join time, when their cohort was still null, and
    // never reconciled afterwards (the profile-tab prompt only fires when the year
    // CHANGES, so re-picking the same year is a no-op). Asserting only the column
    // is what let that ship.
    const { data: classChat, error: chatErr } = await sb.client
      .from("groups")
      .select("id")
      .eq("ministry_id", sb.ministryId)
      .eq("type", "church")
      .eq("name", `Class of ${nextYear}`)
      .or("archived.is.null,archived.eq.false")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
    if (chatErr) throw chatErr
    expect(classChat, `no "Class of ${nextYear}" chat was created`).toBeTruthy()
    gatedClassChatId = classChat!.id

    const { data: seat, error: seatErr } = await sb.client
      .from("group_members")
      .select("user_id")
      .eq("group_id", classChat!.id)
      .eq("user_id", memberId)
      .maybeSingle()
    if (seatErr) throw seatErr
    expect(seat, `completing the gate left the member out of "Class of ${nextYear}"`).toBeTruthy()
  })

  test("already-complete member is never redirected to /complete-profile", async ({ page }) => {
    const sb = sandbox()
    const memberId = await sb.memberUserId()
    await sb.client
      .from("profiles")
      .update({ gender: "female", graduation_year: new Date().getFullYear() + 2 })
      .eq("id", memberId)

    await page.goto("/home")
    await page.waitForLoadState("networkidle")
    await expect(page).not.toHaveURL(/\/complete-profile/)
  })
})

test.describe("OAuth onboarding gate — admin exemption", () => {
  // Default chromium project storage state is already ADMIN_STATE.

  test("admin-tier with null gender/graduation_year is NOT redirected off /home", async ({ page }) => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    // The sandbox admin's own profile is currently null/null (verified pre-existing);
    // assert that stays true and doesn't accidentally get completed by this spec.
    const { data } = await sb.client.from("profiles").select("gender, graduation_year, role").eq("id", adminId).single()
    expect(data?.role).toBe("admin")

    await page.goto("/home")
    await page.waitForLoadState("networkidle")
    await expect(page).not.toHaveURL(/\/complete-profile/)
  })
})
