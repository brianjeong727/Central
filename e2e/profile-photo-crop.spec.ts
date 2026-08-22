// Choosing a profile photo opens a move-and-scale step; CONFIRM is what uploads.
//
// Before this, picking a file uploaded the whole frame and CSS `object-fit:
// cover` centre-cropped it — so anyone not dead-centre in their own photo lost
// their chin. The crop is now the user's, and what gets STORED is the square
// they chose, not the original.
//
// The load-bearing assertion is the stored image's DIMENSIONS: a 512x512 object
// proves the export canvas ran. Asserting only "the modal appeared" would pass
// on a cropper that drew a circle and then uploaded the original anyway.
import { test, expect } from "@playwright/test"
import { adminState, sandbox } from "./fixtures"

test.use({ storageState: adminState, viewport: { width: 1440, height: 900 } })

/** A deliberately NON-square source, so a square result can only be a crop. */
function wideImage(): { name: string; mimeType: string; buffer: Buffer } {
  const w = 400, h = 200
  // Minimal uncompressed BMP — no encoder dependency, and every browser decodes it.
  const rowSize = w * 3 + ((4 - (w * 3) % 4) % 4)
  const pixels = Buffer.alloc(rowSize * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * rowSize + x * 3
      pixels[i] = (x * 255 / w) | 0        // B
      pixels[i + 1] = (y * 255 / h) | 0    // G
      pixels[i + 2] = 160                  // R
    }
  }
  const header = Buffer.alloc(54)
  header.write("BM", 0)
  header.writeUInt32LE(54 + pixels.length, 2)
  header.writeUInt32LE(54, 10)
  header.writeUInt32LE(40, 14)
  header.writeInt32LE(w, 18)
  header.writeInt32LE(-h, 22) // top-down
  header.writeUInt16LE(1, 26)
  header.writeUInt16LE(24, 28)
  header.writeUInt32LE(pixels.length, 34)
  return { name: "wide.bmp", mimeType: "image/bmp", buffer: Buffer.concat([header, pixels]) }
}

test.describe("profile photo — move and scale before upload", () => {
  let adminId = ""
  let originalUrl: string | null = null

  test.beforeAll(async () => {
    const sb = sandbox()
    adminId = await sb.adminUserId()
    const { data } = await sb.client.from("profiles").select("avatar_url").eq("id", adminId).single()
    originalUrl = (data as { avatar_url: string | null }).avatar_url
  })

  test.afterAll(async () => {
    await sandbox().client.from("profiles").update({ avatar_url: originalUrl }).eq("id", adminId)
  })

  test("picking a photo opens the cropper and stores the square you chose", async ({ page }) => {
    await page.goto("/home?tab=profile")
    await expect(page.getByRole("button", { name: /Edit profile/i }).first()).toBeVisible({ timeout: 20000 })

    // Nothing is uploaded by CHOOSING — the cropper opens first.
    await page.locator('input[type="file"]').first().setInputFiles(wideImage())
    await expect(page.getByText("Move and scale")).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole("button", { name: "Use photo" })).toBeEnabled({ timeout: 15000 })

    const { data: midway } = await sandbox().client.from("profiles").select("avatar_url").eq("id", adminId).single()
    expect((midway as { avatar_url: string | null }).avatar_url, "opening the cropper must not upload anything")
      .toBe(originalUrl)

    // Move it, and zoom in — both paths through the same clamp.
    const frame = page.locator("[data-crop-frame]")
    const box = await frame.boundingBox()
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2 + 10, { steps: 8 })
      await page.mouse.up()
    }
    await page.locator('input[aria-label="Zoom"]').fill("1.6")

    await page.getByRole("button", { name: "Use photo" }).click()
    await expect(page.getByText("Move and scale")).toBeHidden({ timeout: 25000 })

    const { data: after } = await sandbox().client.from("profiles").select("avatar_url").eq("id", adminId).single()
    const url = (after as { avatar_url: string | null }).avatar_url
    expect(url, "the profile should point at a new photo").toBeTruthy()
    expect(url).not.toBe(originalUrl)

    // What was STORED is the square, not the 400x200 original.
    const dims = await page.evaluate((src) => new Promise<{ w: number; h: number }>((res, rej) => {
      const img = new Image()
      img.crossOrigin = "anonymous"
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => rej(new Error("could not load the stored avatar"))
      img.src = src!
    }), url)
    expect(dims.w, "stored avatar is square").toBe(dims.h)
    expect(dims.w).toBe(512)
  })

  test("Cancel leaves the existing photo alone", async ({ page }) => {
    const sb = sandbox()
    const { data: before } = await sb.client.from("profiles").select("avatar_url").eq("id", adminId).single()
    const wasUrl = (before as { avatar_url: string | null }).avatar_url

    await page.goto("/home?tab=profile")
    await expect(page.getByRole("button", { name: /Edit profile/i }).first()).toBeVisible({ timeout: 20000 })
    await page.locator('input[type="file"]').first().setInputFiles(wideImage())
    await expect(page.getByText("Move and scale")).toBeVisible({ timeout: 15000 })
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByText("Move and scale")).toBeHidden({ timeout: 10000 })
    await page.waitForTimeout(1500)

    const { data: after } = await sb.client.from("profiles").select("avatar_url").eq("id", adminId).single()
    expect((after as { avatar_url: string | null }).avatar_url).toBe(wasUrl)
  })
})
