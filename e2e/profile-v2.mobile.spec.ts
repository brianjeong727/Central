// Profile v2 at phone width (cdesign "Profile Prototype v2", ratified 2026-08-22).
//
// The behavioural change worth locking down is that there is NO EDIT MODE: you tap
// a value, it becomes an input, and blurring commits that ONE field. The old screen
// staged everything behind an Edit → Save pair, so "did it save" was a single
// question; now it is a question per field, and a field that silently fails to
// persist looks exactly like one that was never typed into.
//
// Also asserts the fields that were REMOVED stay removed. Their columns are gone
// from the table, so a stray row would be reading a property that no longer exists
// and rendering "Add" forever — which reads as a field the user simply hasn't
// filled in rather than one that should not be there.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, adminState } from "./fixtures"

test.use({ storageState: adminState, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

const FILLED = {
  major: "Information Science",
  stage: "Student",
  hometown: "Cherry Hill, NJ",
  favorite_verse: "Philippians 4:13",
  bible_verse: "I can do all things through him who strengthens me.",
  favorite_worship_song: "Goodness of God",
}
const EMPTY = Object.fromEntries(Object.keys(FILLED).map(k => [k, null]))

let adminId = ""
let originalName = ""

test.beforeAll(async () => {
  const sb = sandbox()
  adminId = await sb.adminUserId()
  const { data } = await sb.client.from("profiles").select("name").eq("id", adminId).single()
  originalName = (data as { name: string } | null)?.name ?? ""
})

test.afterAll(async () => {
  const sb = sandbox()
  // Restore the tenant exactly — the name especially, since other specs derive
  // locators from `sandbox().adminName()`.
  await sb.client.from("profiles").update({ ...EMPTY, name: originalName }).eq("id", adminId).eq("ministry_id", sb.ministryId)
})

async function seed(values: Record<string, string | null>) {
  const sb = sandbox()
  const { error } = await sb.client.from("profiles").update(values).eq("id", adminId).eq("ministry_id", sb.ministryId)
  if (error) throw error
}

/** Scoped to the visible tree — the desktop profile is co-mounted and hidden. */
const vis = (page: Page, text: string) => page.getByText(text, { exact: true }).filter({ visible: true })

async function openProfile(page: Page) {
  await page.goto("/home?tab=profile")
  await expect(vis(page, "Journal").first()).toBeVisible({ timeout: 30_000 })
}

test("a filled profile shows every v2 field, and the meter counts them", async ({ page }) => {
  await seed(FILLED)
  await openProfile(page)

  for (const label of ["EMAIL", "STUDYING", "STAGE", "FROM", "FAVORITE VERSE", "WORSHIP SONG"]) {
    await expect(vis(page, label).first(), `${label} row`).toBeVisible()
  }
  await expect(vis(page, FILLED.major).first()).toBeVisible()
  await expect(vis(page, FILLED.hometown).first()).toBeVisible()
  // The verse block prints the reference as its kicker and the words underneath.
  await expect(vis(page, FILLED.bible_verse).first()).toBeVisible()
  // 6 of the 7 counted fields are set (school_id is the seventh and is unset here).
  await expect(page.getByText(/^\d of 7 filled$/).filter({ visible: true }).first()).toHaveText("6 of 7 filled")
})

test("the removed fields are gone — no testimony, bio, phone or prayer row", async ({ page }) => {
  await seed(FILLED)
  await openProfile(page)
  for (const gone of ["TESTIMONY", "PHONE", "BIO", "ABOUT", "PRAYER", "FAVORITE BOOK"]) {
    await expect(vis(page, gone), `${gone} must not be a row any more`).toHaveCount(0)
  }
})

test("an empty profile invites you into each field without nagging", async ({ page }) => {
  await seed(EMPTY)
  await openProfile(page)
  // Every unset row reads "Add" in plum — the design's one call to action, repeated.
  expect(await vis(page, "Add").count()).toBeGreaterThanOrEqual(5)
  await expect(page.getByText(/^\d of 7 filled$/).filter({ visible: true }).first()).toHaveText("0 of 7 filled")
  await expect(vis(page, "Everything here is visible to your ministry.").first()).toBeVisible()
})

test("tapping a value edits it in place and blur commits that one field", async ({ page }) => {
  await seed(EMPTY)
  await openProfile(page)

  // There is no Edit button to press — that is the point.
  await expect(page.getByRole("button", { name: "Edit profile" }).filter({ visible: true })).toHaveCount(0)

  const row = page.locator("div").filter({ hasText: /^FROM/ }).filter({ visible: true }).last()
  await row.click()
  const input = page.getByLabel("FROM").filter({ visible: true }).first()
  await expect(input).toBeVisible({ timeout: 10_000 })
  await input.fill("Pittsburgh, PA")
  await input.blur()

  // Rendered back as a value…
  await expect(vis(page, "Pittsburgh, PA").first()).toBeVisible({ timeout: 10_000 })
  // …and actually IN POSTGRES. An optimistic patch looks identical to a successful
  // write until you go and read the row, and this screen has one write per field.
  await expect.poll(async () => {
    const sb = sandbox()
    const { data } = await sb.client.from("profiles").select("hometown").eq("id", adminId).single()
    return (data as { hometown: string | null } | null)?.hometown
  }, { timeout: 10_000 }).toBe("Pittsburgh, PA")

  // The meter reacts to the field that was just filled.
  await expect(page.getByText(/^\d of 7 filled$/).filter({ visible: true }).first()).toHaveText("1 of 7 filled")
})

test("the name is gated — a blocked name keeps you in the field with a reason", async ({ page }) => {
  await seed(EMPTY)
  await openProfile(page)

  await vis(page, originalName).first().click()
  const nameInput = page.getByLabel("Your name").filter({ visible: true }).first()
  await expect(nameInput).toBeVisible({ timeout: 10_000 })
  await nameInput.fill("   ")
  await nameInput.blur()

  // Blank is refused and the field STAYS open: dropping back to read mode would
  // show the old name with no explanation, which reads as the edit silently failing.
  await expect(page.getByText("Enter your name — this is what your ministry sees.").filter({ visible: true }).first())
    .toBeVisible({ timeout: 10_000 })
  await expect(nameInput).toBeVisible()

  // And the stored name is untouched.
  const sb = sandbox()
  const { data } = await sb.client.from("profiles").select("name").eq("id", adminId).single()
  expect((data as { name: string } | null)?.name).toBe(originalName)
})
