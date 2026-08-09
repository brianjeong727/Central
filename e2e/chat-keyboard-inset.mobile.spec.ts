// Guards the on-screen-keyboard contract for the chat overlay (lib/keyboard-inset.ts).
//
// The bug this locks down: with the keyboard up, the ChatScreen composer sat UNDER
// the keys, so iOS scrolled the whole document to reveal the caret — the header
// scrolled off the top, the transcript went off-screen, and all you could see was
// a composer floating over blank cream. iMessage/Messenger instead shrink the
// surface: header pinned, transcript shorter, composer flush on the keys.
//
// Playwright cannot raise a real software keyboard, and it does not need to: the
// contract boundary IS `--kb-inset` + html[data-kb-open]. The bridge publishes
// them from visualViewport / the Capacitor plugin; every layout consumer reads
// them. Driving those two directly tests exactly the half that can regress in
// this repo — the native measurement half lives in iOS, not in the DOM.
import { test, expect, type Page } from "@playwright/test"
import { sandbox, E2E_PREFIX } from "./fixtures"

const KB = 336 // a plausible iPhone keyboard height, in CSS px

async function raiseKeyboard(page: Page, px = KB) {
  await page.evaluate(h => {
    document.documentElement.style.setProperty("--kb-inset", `${h}px`)
    document.documentElement.setAttribute("data-kb-open", "")
  }, px)
  // One frame for the shortened flex column to lay out.
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(null))))
}

async function lowerKeyboard(page: Page) {
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--kb-inset", "0px")
    document.documentElement.removeAttribute("data-kb-open")
  })
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(null))))
}

// Synthetic touch drag. Playwright's touchscreen API taps but cannot drag, and the
// dismiss handler reads `e.touches[0]`, so the events are dispatched directly.
async function swipe(page: Page, selector: string, dy: number) {
  await page.evaluate(({ selector, dy }) => {
    const el = document.querySelector(selector) as HTMLElement | null
    if (!el) throw new Error(`swipe target not found: ${selector}`)
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + Math.min(30, r.height / 2)
    const touch = (clientY: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY })
    const fire = (type: string, clientY: number) => {
      const t = touch(clientY)
      el.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true }))
    }
    fire("touchstart", y)
    fire("touchmove", y + dy / 2)
    fire("touchmove", y + dy)
    fire("touchend", y + dy)
  }, { selector, dy })
}

test.describe("chat keyboard inset (mobile)", () => {
  const CHAT = `${E2E_PREFIX}Keyboard Layout`
  const LONG_CHAT = `${E2E_PREFIX}Keyboard Scrollback`
  let chatId = ""
  let longChatId = ""

  test.beforeAll(async () => {
    const sb = sandbox()
    const adminId = await sb.adminUserId()
    const memberId = await sb.memberUserId()
    const group = await sb.createGroup({ name: CHAT, memberIds: [adminId, memberId] })
    chatId = group.id

    // A SECOND chat, long enough that the transcript genuinely scrolls. Required for
    // the negative half of the swipe test: with only a couple of messages the
    // transcript is shorter than its box, so "scrolled to the bottom" is trivially
    // true no matter what scrollTop is set to, and the gesture fires when it should
    // have been suppressed. The fixture, not the code, decided that outcome.
    const long = await sb.createGroup({ name: LONG_CHAT, memberIds: [adminId, memberId] })
    longChatId = long.id
    for (let i = 1; i <= 40; i++) {
      await sb.insertMessage({ groupId: longChatId, senderId: i % 2 ? memberId : adminId, content: `scrollback line ${i}` })
    }
    // A couple of messages so "the transcript is visible" is a real assertion and
    // not trivially satisfied by an empty state.
    await sb.insertMessage({ groupId: group.id, senderId: memberId, content: "first message" })
    await sb.insertMessage({ groupId: group.id, senderId: memberId, content: "second message" })
  })

  test("composer rides the keyboard; header and transcript stay on screen", async ({ page }) => {
    // Deep-link by id (as the other chat specs do) — the seeded group is a "my"
    // chat and the list lands on the Church sub-tab.
    await page.goto(`/home?tab=chats&chat=${chatId}`)

    const header = page.locator("h2", { hasText: CHAT }).filter({ visible: true }).first()
    await header.waitFor({ state: "visible", timeout: 15000 })

    const composer = page.locator("textarea, input[placeholder^='Message']").filter({ visible: true }).first()
    await composer.waitFor({ state: "visible", timeout: 15000 })

    const viewportH = page.viewportSize()!.height

    await raiseKeyboard(page)

    // 1. The composer's bottom edge sits ON the keyboard, not under it.
    const composerBox = (await composer.boundingBox())!
    expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(viewportH - KB + 2)

    // 2. …and not floating far above it either (that is the "dead safe-area band"
    //    regression — env(safe-area-inset-bottom) held open behind the keys).
    expect(composerBox.y + composerBox.height).toBeGreaterThan(viewportH - KB - 60)

    // 3. The header did NOT scroll off the top — the whole original bug.
    const headerBox = (await header.boundingBox())!
    expect(headerBox.y).toBeGreaterThanOrEqual(0)
    expect(headerBox.y).toBeLessThan(80)

    // 4. The document itself never scrolled.
    const scrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)
    expect(scrollTop).toBe(0)

    // 5. Real transcript room survives between header and composer, and the
    //    newest message is inside it (you can see what you are replying to).
    const gap = composerBox.y - (headerBox.y + headerBox.height)
    expect(gap).toBeGreaterThan(60)
    // Scoped to the TRANSCRIPT. Unscoped, this text also matches the chat-list
    // preview row still mounted behind the overlay ("E2E Member 2: second
    // message"), so `.first()` picked whichever the DOM happened to order first —
    // stable in isolation, and not stable in the full suite once the sandbox has
    // accumulated enough E2E chats. Same co-mounted-tree trap the mobile sweep
    // documents.
    const newest = page.locator("[data-bottom-anchored]")
      .getByText("second message", { exact: false }).filter({ visible: true }).first()
    await newest.waitFor({ state: "visible", timeout: 15000 })
    const newestBox = (await newest.boundingBox())!
    expect(newestBox.y + newestBox.height).toBeLessThanOrEqual(composerBox.y + 2)

    // 6. Floating chrome gets out of the way rather than landing on the pill.
    //    Probed with an injected element rather than the real consumer: the only
    //    .kb-hide site today is the super-switcher chip, which renders for exactly
    //    one account UUID and never for the sandbox admin — asserting on it here
    //    would pass whether the rule existed or not.
    const hidden = await page.evaluate(() => {
      const probe = document.createElement("div")
      probe.className = "kb-hide"
      probe.style.position = "fixed"
      probe.style.bottom = "80px"
      probe.style.left = "12px"
      probe.textContent = "probe"
      document.body.appendChild(probe)
      const gone = getComputedStyle(probe).display === "none"
      probe.remove()
      return gone
    })
    expect(hidden).toBe(true)

    // 7. Lowering the keyboard restores the full-height surface.
    await lowerKeyboard(page)
    const restored = (await composer.boundingBox())!
    expect(restored.y + restored.height).toBeGreaterThan(viewportH - 120)
  })

  // Swipe DOWN to put the keyboard away. Real focus here (not the simulated inset) —
  // the gesture's job is to BLUR, and blur is the thing that dismisses a real keyboard.
  test("swiping down dismisses the keyboard; scrolling history does not", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${longChatId}`)
    const composer = page.locator("textarea, input[placeholder^='Message']").filter({ visible: true }).first()
    await composer.waitFor({ state: "visible", timeout: 15000 })

    const focused = () => page.evaluate(() => {
      const el = document.activeElement
      return !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")
    })

    // Sanity-check the fixture before trusting either half: if the transcript cannot
    // scroll, the negative case below is vacuous and would "pass" on broken code.
    await expect.poll(() => page.evaluate(() => {
      const el = document.querySelector("[data-bottom-anchored]") as HTMLElement | null
      return el ? el.scrollHeight - el.clientHeight : 0
    }), { message: "transcript must actually scroll for this test to mean anything", timeout: 15000 })
      .toBeGreaterThan(200)

    // Wait on the CONDITION the gesture reads, never on elapsed time. The on-open
    // re-pin lands on a rAF plus a ~320ms settle, so a fixed sleep is a race that
    // only shows up on a loaded machine — which is exactly how this first failed.
    // Generous budgets: these poll on APP READINESS (first paint after a cold
    // Next compile), not on the behaviour under test. The 5s default expired once
    // on the run right after a dev-server restart — a flaky guard is worse than none.
    const atBottom = () => page.evaluate(() => {
      const el = document.querySelector("[data-bottom-anchored]") as HTMLElement | null
      return !!el && el.scrollHeight - el.scrollTop - el.clientHeight <= 8
    })

    // A drag over the transcript, pinned at the bottom → dismisses.
    await composer.click()
    expect(await focused()).toBe(true)
    await expect.poll(atBottom, { timeout: 15000 }).toBe(true)
    await swipe(page, "[data-bottom-anchored]", 70)
    expect(await focused()).toBe(false)

    // The same drag while scrolled UP through history must NOT dismiss — there,
    // dragging down already means "show older messages".
    await composer.click()
    expect(await focused()).toBe(true)
    await expect.poll(atBottom, { timeout: 15000 }).toBe(true)   // let the re-pin finish BEFORE scrolling up…
    await page.evaluate(() => {
      const el = document.querySelector("[data-bottom-anchored]") as HTMLElement | null
      if (el) el.scrollTop = 0
    })
    await expect.poll(atBottom, { timeout: 15000 }).toBe(false)  // …and confirm it stuck before swiping
    await swipe(page, "[data-bottom-anchored]", 70)
    expect(await focused()).toBe(true)

    // A drag over the composer bar itself → dismisses, scroll position irrelevant
    // (it is not a scroller, so there is no competing gesture).
    await swipe(page, "textarea, input[placeholder^='Message']", 70)
    expect(await focused()).toBe(false)
  })

  // Guards the WEB half of the double-count fix. The bug was the shell measuring an
  // inset it should have pinned to 0 (iOS resizes the WKWebView itself, so applying a
  // measured inset lifted the chat a SECOND time and dropped the composer off-screen
  // for the frames where innerHeight and visualViewport.height disagreed). The obvious
  // wrong fix is to pin 0 everywhere — which silently breaks mobile Safari, where
  // nothing resizes and the inset is the only thing making room. This asserts the
  // measured path still measures.
  //
  // The native pin itself is NOT asserted here and cannot be: Playwright has no
  // Capacitor bridge, so isNativePlatform() is false and that branch never runs.
  // Faking it would mean exporting a test-only backdoor into the production bundle.
  test("web path still measures the keyboard (the pin must not become global)", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${chatId}`)
    await page.locator("h2", { hasText: CHAT }).filter({ visible: true }).first()
      .waitFor({ state: "visible", timeout: 15000 })

    const measured = await page.evaluate(async () => {
      const vv = window.visualViewport!
      const proto = Object.getPrototypeOf(vv)
      const real = Object.getOwnPropertyDescriptor(proto, "height")!
      const target = window.innerHeight - 336
      Object.defineProperty(vv, "height", { configurable: true, get: () => target })
      vv.dispatchEvent(new Event("resize"))
      await new Promise(r => requestAnimationFrame(() => r(null)))
      const read = getComputedStyle(document.documentElement).getPropertyValue("--kb-inset").trim()
      delete (vv as unknown as Record<string, unknown>).height
      Object.defineProperty(proto, "height", real)
      vv.dispatchEvent(new Event("resize"))
      return read
    })

    expect(measured).toBe("336px")
  })

  // The shell is a remote-URL WebView, so this bundle runs inside whatever binary
  // the user has installed — a deploy cannot pick its version. 1.0.3–1.0.5 shipped
  // `resize: "native"`, where iOS shrinks the WebView itself; a bundle that also
  // applies an inset there double-counts and puts the composer a full keyboard
  // height too high, under the header. The module must ASK (getResizeMode) rather
  // than assume the newest binary.
  //
  // Playwright has no Capacitor bridge, so this asserts the invariant that makes
  // the mismatch survivable: the CSS reads --kb-inset and nothing else, so a
  // contributed 0 leaves the layout untouched and the native resize alone governs.
  test("a zero inset leaves the layout exactly as if no keyboard were open", async ({ page }) => {
    await page.goto(`/home?tab=chats&chat=${chatId}`)
    const composer = page.locator("textarea, input[placeholder^='Message']").filter({ visible: true }).first()
    await composer.waitFor({ state: "visible", timeout: 15000 })

    const box = async () => (await composer.boundingBox())!
    const atRest = await box()

    // What world 3 does: flag the keyboard open, but contribute no height.
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-kb-open", "")
      document.documentElement.style.setProperty("--kb-inset", "0px")
    })
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(null))))
    const withOpenFlag = await box()

    // Only the safe-area collapse may move it, and that is at most ~22px.
    expect(Math.abs(withOpenFlag.y - atRest.y)).toBeLessThan(30)
  })

  test("--kb-inset defaults to 0 and no keyboard flag is set at rest", async ({ page }) => {
    await page.goto("/home?tab=chats")
    const state = await page.evaluate(() => ({
      inset: getComputedStyle(document.documentElement).getPropertyValue("--kb-inset").trim(),
      open: document.documentElement.hasAttribute("data-kb-open"),
    }))
    expect(state.inset).toBe("0px")
    expect(state.open).toBe(false)
  })
})
