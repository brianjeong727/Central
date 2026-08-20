// Changing your graduation year offers to move your class chat, and does it.
//
// The year field used to be a bare `profiles` column write: it changed the label
// on your directory row and nothing else. The young-adult switch DIRECTLY BESIDE
// IT moved your chat membership, so the two halves of "which cohort am I in"
// behaved differently depending on which control you touched. A student who
// joined as 2027 and corrected herself to 2029 stayed in the Class of 2027 chat
// indefinitely (Allyson Choi, Central, 2026-08-19).
//
// Asserted against group_members, not against what the screen says — "the profile
// says 2029" was already true while she sat in the wrong room.
import { test, expect, type Page } from "@playwright/test"
import { adminState, sandbox } from "./fixtures"

test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

const OLD_YEAR = 2031
const NEW_YEAR = 2032

async function classChatId(year: number): Promise<string | null> {
  const sb = sandbox()
  const { data } = await sb.client.from("groups").select("id")
    .eq("ministry_id", sb.ministryId).eq("type", "church").eq("name", `Class of ${year}`)
    .order("created_at", { ascending: true }).limit(1).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

async function isMember(groupId: string | null, userId: string): Promise<boolean> {
  if (!groupId) return false
  const sb = sandbox()
  const { data } = await sb.client.from("group_members").select("user_id")
    .eq("group_id", groupId).eq("user_id", userId).maybeSingle()
  return !!data
}

/** Profile → Edit → set the graduation year → Save. Leaves the prompt on screen. */
async function editYearTo(page: Page, year: number) {
  await page.goto("/home?tab=profile")
  // Desktop's trigger is the "Edit profile" secondary button (mobile's is the
  // quiet plum link labelled the same via aria-label) — match either.
  const edit = page.getByRole("button", { name: /Edit profile/i }).filter({ visible: true }).first()
  await expect(edit).toBeVisible({ timeout: 20000 })
  await edit.click()
  const field = page.getByPlaceholder("e.g. 2027").filter({ visible: true }).first()
  await expect(field).toBeVisible({ timeout: 10000 })
  await field.fill(String(year))
  await page.getByRole("button", { name: /^Save/ }).filter({ visible: true }).first().click()
}

test.describe("graduation-year change moves the class chat", () => {
  let adminId = ""
  let originalYear: number | null = null
  const seededGroups: string[] = []

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    const { data: prof } = await sb.client.from("profiles").select("graduation_year").eq("id", adminId).single()
    originalYear = (prof as { graduation_year: number | null }).graduation_year

    // Years nobody else uses, so this spec can never disturb a real cohort room.
    for (const year of [OLD_YEAR, NEW_YEAR]) {
      await sb.client.from("groups").delete()
        .eq("ministry_id", sb.ministryId).eq("name", `Class of ${year}`)
    }
    const { data: old } = await sb.client.from("groups").insert({
      name: `Class of ${OLD_YEAR}`, type: "church", category: "general",
      ministry_id: sb.ministryId, created_by: adminId,
    }).select("id").single()
    if (old) {
      seededGroups.push((old as { id: string }).id)
      await sb.client.from("group_members").insert({ group_id: (old as { id: string }).id, user_id: adminId })
    }

    await sb.client.from("profiles").update({ graduation_year: OLD_YEAR }).eq("id", adminId)
  })

  test.afterAll(async () => {
    const sb = sandbox()
    await sb.client.from("profiles").update({ graduation_year: originalYear }).eq("id", adminId)
    for (const year of [OLD_YEAR, NEW_YEAR]) {
      const { data: rows } = await sb.client.from("groups").select("id")
        .eq("ministry_id", sb.ministryId).eq("name", `Class of ${year}`)
      for (const r of (rows ?? []) as { id: string }[]) {
        await sb.client.from("messages").delete().eq("group_id", r.id)
        await sb.client.from("group_members").delete().eq("group_id", r.id)
        await sb.client.from("groups").delete().eq("id", r.id)
      }
    }
    void seededGroups
  })

  test("confirming the prompt joins the new class chat and leaves the old one", async ({ page }) => {
    expect(await isMember(await classChatId(OLD_YEAR), adminId), "starts in the old class chat").toBe(true)

    await editYearTo(page, NEW_YEAR)

    // The prompt states BOTH halves of what it is about to do.
    await expect(page.getByText(`You're now Class of ${NEW_YEAR}`)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(new RegExp(`taken out of`))).toBeVisible()

    await page.getByRole("button", { name: /^Join chat$/ }).click()
    await page.waitForTimeout(3000)

    // The destination did not exist — the action creates it rather than silently
    // doing nothing, which is what "you'll be added to Class of 2032" promised.
    const newId = await classChatId(NEW_YEAR)
    expect(newId, "the new class chat should exist").toBeTruthy()
    expect(await isMember(newId, adminId), "joined the new class chat").toBe(true)
    expect(await isMember(await classChatId(OLD_YEAR), adminId), "left the old class chat").toBe(false)
  })

  test("ticking 'stay too' keeps the old chat as well", async ({ page }) => {
    const sb = sandbox()
    // Back to the starting shape: in OLD, year = OLD.
    const oldId = await classChatId(OLD_YEAR)
    if (oldId) {
      await sb.client.from("group_members")
        .upsert([{ group_id: oldId, user_id: adminId }], { onConflict: "group_id,user_id", ignoreDuplicates: true })
    }
    const newId = await classChatId(NEW_YEAR)
    if (newId) await sb.client.from("group_members").delete().eq("group_id", newId).eq("user_id", adminId)
    await sb.client.from("profiles").update({ graduation_year: OLD_YEAR }).eq("id", adminId)

    await editYearTo(page, NEW_YEAR)
    await expect(page.getByText(`You're now Class of ${NEW_YEAR}`)).toBeVisible({ timeout: 15000 })

    await page.getByRole("checkbox").filter({ visible: true }).first().check()
    await page.getByRole("button", { name: /^Join chat$/ }).click()
    await page.waitForTimeout(3000)

    expect(await isMember(await classChatId(NEW_YEAR), adminId), "joined the new one").toBe(true)
    expect(await isMember(await classChatId(OLD_YEAR), adminId), "and stayed in the old one").toBe(true)
  })

  test("'Not now' changes the year and leaves every chat alone", async ({ page }) => {
    const sb = sandbox()
    const oldId = await classChatId(OLD_YEAR)
    if (oldId) {
      await sb.client.from("group_members")
        .upsert([{ group_id: oldId, user_id: adminId }], { onConflict: "group_id,user_id", ignoreDuplicates: true })
    }
    const newIdBefore = await classChatId(NEW_YEAR)
    if (newIdBefore) await sb.client.from("group_members").delete().eq("group_id", newIdBefore).eq("user_id", adminId)
    await sb.client.from("profiles").update({ graduation_year: OLD_YEAR }).eq("id", adminId)

    await editYearTo(page, NEW_YEAR)
    await expect(page.getByText(`You're now Class of ${NEW_YEAR}`)).toBeVisible({ timeout: 15000 })
    await page.getByRole("button", { name: /^Not now$/ }).click()
    await page.waitForTimeout(2000)

    // The PROFILE still saved — the chat move is the optional half, not the edit.
    const { data: prof } = await sb.client.from("profiles").select("graduation_year").eq("id", adminId).single()
    expect((prof as { graduation_year: number }).graduation_year).toBe(NEW_YEAR)
    expect(await isMember(await classChatId(OLD_YEAR), adminId), "still in the old chat").toBe(true)
    expect(await isMember(await classChatId(NEW_YEAR), adminId), "not added to the new one").toBe(false)
  })
})
