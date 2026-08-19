// Guards changing and removing a profile photo.
//
// Both were reported as impossible, and each failed for a DIFFERENT reason, so
// each needs its own assertion:
//
//   CHANGE — the upload always worked. The path is `{userId}.{ext}`, so the public
//   URL was byte-identical after every upload; React saw an unchanged string and
//   skipped the re-render, next/image served its optimized copy, the browser its
//   cached one. The bytes changed and the user saw their old photo. So this
//   asserts the stored URL actually DIFFERS between uploads — asserting "an
//   upload happened" passes against the bug.
//
//   REMOVE — no control existed, and storage.objects had no DELETE policy for the
//   bucket. So this asserts BOTH halves: the column is cleared AND the object is
//   really gone. Checking only the column passes against an RLS-denied delete,
//   which returns `{ error: null, data: [] }` — success-shaped, file untouched
//   (lib/storage-cleanup.ts, rule 1). That is the exact trap this flow fell into.
import { test, expect } from "@playwright/test"
import { sandbox, memberState } from "./fixtures"

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
)

test.describe("profile photo — change and remove", () => {
  test.describe.configure({ timeout: 240000 })
  test.use({ storageState: memberState })

  let memberId = ""
  let original: string | null = null

  test.beforeAll(async () => {
    const sb = sandbox()
    memberId = await sb.memberUserId()
    const { data } = await sb.client.from("profiles").select("avatar_url").eq("id", memberId).single()
    original = (data?.avatar_url as string | null) ?? null
  })

  test.afterAll(async () => {
    await sandbox().client.from("profiles").update({ avatar_url: original }).eq("id", memberId)
  })

  // Each test starts with NO photo. Without this the leftover URL from a previous
  // run satisfies the "an upload happened" poll immediately, so `first` captures
  // the OLD value and the change assertion compares two unrelated strings — it
  // passed against the very bug it exists to catch. Verified by re-introducing the
  // bug: vacuous before this reset, failing after it.
  test.beforeEach(async () => {
    await sandbox().client.from("profiles").update({ avatar_url: null }).eq("id", memberId)
  })

  const avatarUrl = async (): Promise<string | null> => {
    const { data } = await sandbox().client.from("profiles").select("avatar_url").eq("id", memberId).single()
    return (data?.avatar_url as string | null) ?? null
  }

  // Storage truth, independent of the column: does the object exist?
  const objectExists = async (url: string | null): Promise<boolean> => {
    if (!url) return false
    const key = url.split("/profile-images/")[1]?.split("?")[0]
    if (!key) return false
    const { data } = await sandbox().client.storage.from("profile-images")
      .list("", { search: decodeURIComponent(key) })
    return (data ?? []).some((o) => o.name === decodeURIComponent(key))
  }

  const upload = async (page: import("@playwright/test").Page, name: string) => {
    await page.locator('input[type="file"]').first()
      .setInputFiles({ name, mimeType: "image/png", buffer: PNG_1PX })
  }

  test("a second upload changes what is stored, so the new photo is actually shown", async ({ page }) => {
    await page.goto("/home?tab=profile")
    await page.waitForTimeout(2500)

    await upload(page, "first.png")
    await expect.poll(avatarUrl, { message: "first upload must store a URL", timeout: 30000 }).not.toBeNull()
    const first = await avatarUrl()

    await upload(page, "second.png")
    // The URL must MOVE. Same-string is the bug: the object is replaced but every
    // consumer is keyed on the URL, so nothing re-renders.
    await expect.poll(avatarUrl, {
      message: "a second upload must change the stored URL, or the new photo never appears",
      timeout: 30000,
    }).not.toBe(first)

    // And it must still be a real, fetchable image.
    const now = await avatarUrl()
    const res = await page.request.get(now!)
    expect(res.status(), "the new photo must actually serve").toBe(200)
  })

  test("removing clears the profile AND deletes the file", async ({ page }) => {
    await page.goto("/home?tab=profile")
    await page.waitForTimeout(2500)

    await upload(page, "to-remove.png")
    await expect.poll(avatarUrl, { message: "need a photo to remove", timeout: 30000 }).not.toBeNull()
    const uploaded = await avatarUrl()
    expect(await objectExists(uploaded), "the uploaded object should exist first").toBe(true)

    await page.reload()
    await page.waitForTimeout(2500)
    await page.getByRole("button", { name: /remove photo/i }).filter({ visible: true }).first().click()

    await expect.poll(avatarUrl, { message: "the profile must be cleared", timeout: 30000 }).toBeNull()
    // The half that a column-only assertion would miss.
    await expect.poll(() => objectExists(uploaded), {
      message: "the file itself must be gone — an RLS-denied remove looks like success",
      timeout: 30000,
    }).toBe(false)
  })
})
