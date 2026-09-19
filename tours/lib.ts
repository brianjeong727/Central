// Shared helpers for the design-pass tours (see playwright.design-pass.config.ts).
//
// A tour walks one NETWORK of screens and, for every inventory id it reaches,
// writes: a fold screenshot (the real viewport), a full screenshot (the viewport
// stretched to the content's height, so inner scrollers unroll), and a
// measurement JSON (fonts / colours / shadows / spacing / controls) — then
// appends one manifest line. Anything the tour cannot reach is recorded as
// SKIPPED with a reason, never silently dropped: the coverage report is built
// from the manifest, so a silent skip and a pass would otherwise look identical.
import { type Page, type TestInfo } from "@playwright/test"
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { sandbox } from "../e2e/fixtures"

export const OUT = process.env.DESIGN_PASS_OUT || ".claude/task-context/design-pass"
export const SHOTS = join(OUT, "shots")
export const MEASURE = join(OUT, "measure")
export const MANIFEST = join(OUT, "manifest.jsonl")
mkdirSync(SHOTS, { recursive: true })
mkdirSync(MEASURE, { recursive: true })

export type Role = "pastor" | "admin" | "leader" | "member" | "visitor"
export type State = "populated" | "empty" | string

/** Which data state this run captures — "populated" (lane 1) or "empty" (lane 2). */
export const STATE: State = process.env.DESIGN_PASS_STATE || (process.env.E2E_LANE === "2" ? "empty" : "populated")

export function viewportName(page: Page): "desktop" | "mobile" {
  const vp = page.viewportSize()
  return vp && vp.width < 768 ? "mobile" : "desktop"
}

/** Is this project the mobile one? Tours branch on it for md:hidden drills. */
export function isMobile(page: Page): boolean {
  return viewportName(page) === "mobile"
}

// ── Role flips ───────────────────────────────────────────────────────────────
// Only two real logins exist (E2E admin, E2E member). Role views are captured
// by flipping `profiles.role` on those accounts; the app reads the profile on
// every full page load, so a reload after the flip is enough.
export async function setRole(which: "admin" | "member", role: Role) {
  const sb = sandbox()
  const id = which === "admin" ? await sb.adminUserId() : await sb.memberUserId()
  const { error } = await sb.client.from("profiles").update({ role }).eq("id", id).eq("ministry_id", sb.ministryId)
  if (error) throw error
}

/** Restore the canonical roles the rest of the e2e suite assumes. */
export async function restoreRoles() {
  await setRole("admin", "admin")
  await setRole("member", "member")
}

// ── Settling ─────────────────────────────────────────────────────────────────
// `networkidle` never fires on a page holding realtime sockets, so settle on
// fonts + the absence of skeleton shimmer + a short grace period instead.
export async function settle(page: Page, extraMs = 600) {
  await page.waitForLoadState("domcontentloaded")
  await page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready).catch(() => {})
  await page.waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, null, { timeout: 8_000 }).catch(() => {})
  await page.waitForFunction(() => !Array.from(document.querySelectorAll(".animate-spin")).some(el => (el as HTMLElement).offsetParent !== null), null, { timeout: 10_000 }).catch(() => {})
  // Sections that fetch on mount render a literal "Loading…" first; never capture that.
  await page.waitForFunction(() => !Array.from(document.querySelectorAll("p, div, span")).some(el => el.children.length === 0 && /^Loading…?$/.test((el.textContent ?? "").trim()) && (el as HTMLElement).offsetParent !== null), null, { timeout: 10_000 }).catch(() => {})
  // The Next.js dev-mode badge is not part of the product; keep it out of every shot.
  await page.addStyleTag({ content: "nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important }" }).catch(() => {})
  await page.waitForTimeout(extraMs)
}

// ── Capture ──────────────────────────────────────────────────────────────────
export interface CaptureOpts {
  role: Role
  state?: State
  /** Human label for the manifest (defaults to the page title). */
  label?: string
  /** Skip the stretched "full" shot (for fixed overlays where it is meaningless). */
  foldOnly?: boolean
  /** Cap for the stretched viewport height. */
  maxHeight?: number
}

function fileBase(id: string, vp: string, role: string, state: string) {
  return `${id}__${vp}__${role}__${state}`
}

/**
 * Height the viewport needs for every scroller on the page to unroll. Looks at
 * the document AND any overflow:auto/scroll element whose content overflows —
 * the desktop shell scrolls inside `.shell-scroll`, not the document.
 */
async function neededHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    let need = document.documentElement.scrollHeight
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      const s = getComputedStyle(el)
      if (!/(auto|scroll)/.test(s.overflowY)) continue
      if (el.scrollHeight <= el.clientHeight + 4) continue
      const r = el.getBoundingClientRect()
      if (r.width < 200) continue // chip rails, sidebars: not the content column
      const overflow = el.scrollHeight - el.clientHeight
      need = Math.max(need, window.innerHeight + overflow)
    }
    return Math.ceil(need)
  })
}

export async function capture(page: Page, id: string, opts: CaptureOpts) {
  const vp = viewportName(page)
  const state = opts.state ?? "populated"
  const base = fileBase(id, vp, opts.role, state)
  const original = page.viewportSize()!
  await settle(page)

  const foldPath = join(SHOTS, `${base}__fold.png`)
  await page.screenshot({ path: foldPath, fullPage: false, animations: "disabled" })

  let fullPath: string | null = null
  if (!opts.foldOnly) {
    const need = Math.min(await neededHeight(page), opts.maxHeight ?? 5000)
    if (need > original.height + 40) {
      await page.setViewportSize({ width: original.width, height: need })
      await page.waitForTimeout(250)
      fullPath = join(SHOTS, `${base}__full.png`)
      await page.screenshot({ path: fullPath, fullPage: false, animations: "disabled" })
      await page.setViewportSize(original)
      await page.waitForTimeout(150)
    }
  }

  const m = await measure(page)
  const measurePath = join(MEASURE, `${base}.json`)
  writeFileSync(measurePath, JSON.stringify(m, null, 1))

  const line = {
    id, viewport: vp, role: opts.role, state,
    label: opts.label ?? (await page.title()),
    url: page.url(),
    fold: foldPath, full: fullPath, measure: measurePath,
    ts: new Date().toISOString(),
  }
  appendFileSync(MANIFEST, JSON.stringify(line) + "\n")
  return line
}

/** Record a screen the tour could not reach. Visible in the coverage report. */
export function skip(page: Page, id: string, role: Role, reason: string, state: State = STATE) {
  const vp = viewportName(page)
  appendFileSync(MANIFEST, JSON.stringify({ id, viewport: vp, role, state, skipped: true, reason, ts: new Date().toISOString() }) + "\n")
}

/** Sub-surfaces that are part of a parent's capture (a card inside a page). */
export function coveredBy(page: Page, ids: string[], parentId: string, role: Role, state: State = STATE) {
  const vp = viewportName(page)
  for (const id of ids) {
    appendFileSync(MANIFEST, JSON.stringify({ id, viewport: vp, role, state, coveredBy: parentId, ts: new Date().toISOString() }) + "\n")
  }
}

/** Try a step; on failure record SKIPPED instead of killing the whole tour. */
export async function attempt(page: Page, id: string, role: Role, fn: () => Promise<void>, state: State = STATE) {
  try {
    await fn()
  } catch (e) {
    skip(page, id, role, (e as Error).message.split("\n")[0].slice(0, 200), state)
  }
}

// ── Measurement ──────────────────────────────────────────────────────────────
// Everything a reviewer should not have to eyeball. Design-system rules that are
// numeric (spacing scale, weight budget, integer font sizes, shadows, raw colours)
// are checked from these numbers, not from pixels.
export interface Measurement {
  title: string
  url: string
  viewport: { w: number; h: number }
  headings: { text: string; size: number; weight: number; family: string; color: string; top: number }[]
  weight600plus: { text: string; size: number; weight: number; top: number }[]
  eyebrows: { text: string; size: number; top: number }[]
  colors: { color: string; count: number; sample: string }[]
  backgrounds: { color: string; count: number; sample: string }[]
  shadows: { shadow: string; sample: string }[]
  offScaleSpacing: { prop: string; value: number; sample: string }[]
  subTenPxText: { text: string; size: number }[]
  fractionalFontSizes: { text: string; size: number }[]
  controlsAboveFold: number
  controlsTotal: number
  tabStrips: { kind: string; labels: string[] }[]
  modalsOpen: number
  fixedOverlays: { top: number; height: number; z: string }[]
  firstContentTop: number | null
}

export async function measure(page: Page): Promise<Measurement> {
  return page.evaluate(() => {
    const SCALE = new Set([0, 1, 2, 4, 6, 8, 10, 12, 14, 18, 22, 28, 36, 40, 56])
    const vis = (el: Element) => {
      const s = getComputedStyle(el)
      if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    const text = (el: Element) => (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60)
    const leaf = (el: Element) => Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent ?? "").trim())
    const all = Array.from(document.querySelectorAll<HTMLElement>("body *")).filter(el => !["SCRIPT", "STYLE", "LINK", "SVG", "PATH"].includes(el.tagName))

    const headings: Measurement["headings"] = []
    const weight600plus: Measurement["weight600plus"] = []
    const eyebrows: Measurement["eyebrows"] = []
    const colors = new Map<string, { count: number; sample: string }>()
    const backgrounds = new Map<string, { count: number; sample: string }>()
    const shadows = new Map<string, string>()
    const offScale: Measurement["offScaleSpacing"] = []
    const subTen: Measurement["subTenPxText"] = []
    const fractional: Measurement["fractionalFontSizes"] = []
    const fixedOverlays: Measurement["fixedOverlays"] = []
    let controlsAboveFold = 0, controlsTotal = 0, modalsOpen = 0

    for (const el of all) {
      if (!vis(el)) continue
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      const t = text(el)
      const size = parseFloat(s.fontSize)
      const weight = parseInt(s.fontWeight, 10)
      const isLeaf = leaf(el)

      if (isLeaf) {
        if (size >= 19) headings.push({ text: t, size, weight, family: s.fontFamily.split(",")[0].replace(/"/g, ""), color: s.color, top: Math.round(r.top) })
        if (weight >= 600) weight600plus.push({ text: t, size, weight, top: Math.round(r.top) })
        if (size <= 12 && s.textTransform === "uppercase" && /mono/i.test(s.fontFamily)) eyebrows.push({ text: t, size, top: Math.round(r.top) })
        if (size < 10) subTen.push({ text: t, size })
        if (Math.abs(size - Math.round(size)) > 0.01) fractional.push({ text: t, size })
        const c = colors.get(s.color) ?? { count: 0, sample: t }
        c.count++; colors.set(s.color, c)
      }
      const bg = s.backgroundColor
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        const b = backgrounds.get(bg) ?? { count: 0, sample: t || el.tagName.toLowerCase() }
        b.count++; backgrounds.set(bg, b)
      }
      if (s.boxShadow && s.boxShadow !== "none" && !shadows.has(s.boxShadow)) shadows.set(s.boxShadow, t || el.className.toString().slice(0, 40))

      for (const prop of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "marginTop", "marginBottom", "rowGap", "columnGap"] as const) {
        const v = parseFloat(s[prop])
        if (!Number.isFinite(v) || v === 0) continue
        if (!SCALE.has(Math.round(v)) || Math.abs(v - Math.round(v)) > 0.01) {
          if (offScale.length < 80) offScale.push({ prop, value: Math.round(v * 10) / 10, sample: t || el.tagName.toLowerCase() })
        }
      }

      const role = el.getAttribute("role")
      if (["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || role === "button" || role === "tab" || role === "link") {
        controlsTotal++
        if (r.top >= 0 && r.top < window.innerHeight) controlsAboveFold++
      }
      if (role === "dialog" || el.getAttribute("aria-modal") === "true") modalsOpen++
      if (s.position === "fixed" && r.width >= window.innerWidth * 0.9 && r.height >= 40) fixedOverlays.push({ top: Math.round(r.top), height: Math.round(r.height), z: s.zIndex })
    }

    const tabStrips: Measurement["tabStrips"] = []
    for (const list of Array.from(document.querySelectorAll('[role="tablist"]'))) {
      if (!vis(list)) continue
      tabStrips.push({ kind: "role=tablist", labels: Array.from(list.querySelectorAll('[role="tab"]')).map(text) })
    }

    // Where the first painted content lands below the top chrome (mobile rhythm rule).
    let firstContentTop: number | null = null
    const chevron = document.querySelector(".back-chevron")
    const rowBottom = chevron ? chevron.parentElement!.getBoundingClientRect().bottom : null
    if (rowBottom !== null) {
      for (const el of all) {
        if (!vis(el)) continue
        const r = el.getBoundingClientRect()
        if (r.top < rowBottom - 2 || r.width < 40 || r.height < 12) continue
        firstContentTop = Math.round(r.top); break
      }
    }

    const top = (m: Map<string, { count: number; sample: string }>) =>
      Array.from(m.entries()).map(([k, v]) => ({ color: k, ...v })).sort((a, b) => b.count - a.count)

    return {
      title: document.title, url: location.href,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      headings: headings.slice(0, 40), weight600plus: weight600plus.slice(0, 60), eyebrows: eyebrows.slice(0, 40),
      colors: top(colors), backgrounds: top(backgrounds),
      shadows: Array.from(shadows.entries()).map(([shadow, sample]) => ({ shadow, sample })),
      offScaleSpacing: offScale, subTenPxText: subTen.slice(0, 20), fractionalFontSizes: fractional.slice(0, 20),
      controlsAboveFold, controlsTotal, tabStrips, modalsOpen, fixedOverlays, firstContentTop,
    }
  })
}

// ── Navigation helpers ───────────────────────────────────────────────────────
/** Go to /home with a param set, wait for the shell. */
export async function goHome(page: Page, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  await page.goto(qs ? `/home?${qs}` : "/home")
  await page.waitForURL(/\/home/, { timeout: 30_000 })
  await settle(page)
}

/** First visible match for a text (exact by default). */
export function vis(page: Page, text: string, exact = true) {
  return page.getByText(text, { exact }).filter({ visible: true }).first()
}

export function testLabel(info: TestInfo) {
  return `${info.project.name}:${info.title}`
}
