"use client"

import { useCallback, useEffect, useState } from "react"

// ── EntrySplash — native-only "One Body" cold-launch splash ────────────────────
// Renders ONLY on the native shell (Capacitor UA "CentralShell"), ONLY on a cold
// launch, ONLY at mobile widths. The plum overlay animates the saints-gather → ring
// → core → wordmark → verse timeline from the B3 mockup, then auto-dismisses at 4.2s
// (tap anywhere to skip). prefers-reduced-motion → static lockup, everything visible.
//
// Cold-launch guard is a MODULE-SCOPE variable (not sessionStorage — storage
// conventions ban it). It survives client-side navigations (so a warm nav to /login
// after /home never re-shows the splash) but resets on a full reload = a real cold
// launch.
let splashConsumed = false

function isNativeShell() {
  return typeof navigator !== "undefined" && navigator.userAgent.includes("CentralShell")
}

// Release the native (Capacitor) launch splash. `launchAutoHide` is false in
// capacitor.config.ts, so the native cream splash stays up until we call this. On web
// the dynamic import resolves to a no-op bridge; we swallow any failure so nothing
// breaks the web build or runtime.
async function hideNativeSplash() {
  try {
    const mod = await import("@capacitor/splash-screen")
    await mod.SplashScreen.hide()
  } catch {
    /* web / no native bridge — no-op */
  }
}

const AUTO_DISMISS_MS = 4200
const FADE_MS = 600

// Saint start offsets (--sx/--sy) copied 1:1 from the B3 mockup.
const SAINTS: Array<{ sx: string; sy: string; cx: number; cy: number }> = [
  { sx: "-90px", sy: "-120px", cx: 70, cy: 28 },
  { sx: "110px", sy: "-70px", cx: 46, cy: 19 },
  { sx: "-130px", sy: "30px", cx: 26, cy: 34 },
  { sx: "-60px", sy: "140px", cx: 18, cy: 56 },
  { sx: "90px", sy: "120px", cx: 32, cy: 76 },
  { sx: "140px", sy: "60px", cx: 54, cy: 82 },
  { sx: "60px", sy: "-140px", cx: 70, cy: 72 },
]

const CSS = `
.es-root { position: fixed; inset: 0; background: var(--plum-2); z-index: 300;
  display: flex; align-items: center; justify-content: center;
  transition: opacity ${FADE_MS}ms ease, visibility ${FADE_MS}ms; }
.es-root.es-gone { opacity: 0; visibility: hidden; }
.es-lockup { display: flex; align-items: center; gap: 14px; }
.es-lockup svg { width: 64px; height: 64px; }
.es-word { font-family: var(--serif); font-size: 44px; font-weight: 600;
  letter-spacing: -0.03em; color: var(--cream); opacity: 0; transform: translateX(-6px); }
.es-verse { position: absolute; left: 34px; right: 34px;
  bottom: calc(env(safe-area-inset-bottom) + 90px); text-align: center; opacity: 0; }
.es-verse p { font-family: var(--serif); font-style: italic; font-size: 14.5px;
  line-height: 1.6; color: color-mix(in srgb, var(--cream) 72%, transparent); margin: 0; }
.es-verse span { display: block; margin-top: 8px; font-family: var(--mono); font-size: 9px;
  letter-spacing: 1.6px; color: color-mix(in srgb, var(--cream) 40%, transparent); }
@media (prefers-reduced-motion: no-preference) {
  .es-saint { transform-origin: 50% 50%; opacity: 0;
    animation: es-gather 1.4s cubic-bezier(.4,0,.2,1) forwards, es-melt .5s ease 2s forwards; }
  .es-barc { stroke-dasharray: 180; stroke-dashoffset: 180;
    animation: es-draw 1s cubic-bezier(.6,0,.2,1) 1.6s forwards; }
  .es-core { transform-origin: 50% 50%; transform: scale(0);
    animation: es-pop .5s cubic-bezier(.2,1.4,.4,1) 2.3s forwards; }
  .es-word { animation: es-slide .6s ease 2.6s forwards; }
  .es-verse { animation: es-fade 1s ease 3.1s forwards; }
}
@media (prefers-reduced-motion: reduce) {
  .es-saint { display: none; }
  .es-barc { stroke-dasharray: none; stroke-dashoffset: 0; }
  .es-core { transform: none; }
  .es-word, .es-verse { opacity: 1; transform: none; }
}
@keyframes es-gather { 0% { opacity: 0; transform: translate(var(--sx), var(--sy)) scale(.4); }
  30% { opacity: 1; } 100% { opacity: 1; transform: translate(0, 0) scale(1); } }
@keyframes es-melt { to { opacity: 0; } }
@keyframes es-draw { to { stroke-dashoffset: 0; } }
@keyframes es-pop { to { transform: scale(1); } }
@keyframes es-slide { to { opacity: 1; transform: translateX(0); } }
@keyframes es-fade { to { opacity: 1; } }
`

export function EntrySplash() {
  // Decide AFTER mount (SSR-safe; avoids a hydration mismatch). While undecided we
  // render null — the native cream splash covers that first frame, so there's no flash.
  const [show, setShow] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    const eligible =
      isNativeShell() &&
      !splashConsumed &&
      window.matchMedia("(max-width: 767px)").matches

    if (!eligible) {
      // Overlay is skipped (web, desktop, or a warm nav) — `show` stays false so we
      // already render null. The native splash must still be released so it never
      // sticks: this is the always-mounted fallback.
      hideNativeSplash()
      return
    }

    splashConsumed = true
    // Reveal on the next frame, then hand off the native splash once the plum overlay
    // has painted — no flash. rAF-wrapping also keeps setState out of the effect body
    // (mirrors the AnimateIn idiom in shared.tsx).
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      setShow(true)
      raf2 = requestAnimationFrame(() => { hideNativeSplash() })
    })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [])

  const dismiss = useCallback(() => {
    setLeaving(true)
    window.setTimeout(() => setMounted(false), FADE_MS)
  }, [])

  useEffect(() => {
    if (!show) return
    const t = window.setTimeout(dismiss, AUTO_DISMISS_MS)
    return () => window.clearTimeout(t)
  }, [show, dismiss])

  if (!mounted || !show) return null

  return (
    <div
      className={`es-root md:hidden${leaving ? " es-gone" : ""}`}
      onClick={dismiss}
      role="presentation"
    >
      <style>{CSS}</style>
      <div className="es-lockup">
        <svg viewBox="0 0 100 100" aria-hidden>
          <path
            className="es-barc"
            d="M70 28 A32 32 0 1 0 70 72"
            fill="none"
            stroke="var(--cream)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <g fill="var(--cream)">
            {SAINTS.map((s, i) => (
              <circle
                key={i}
                className="es-saint"
                style={{ ["--sx" as string]: s.sx, ["--sy" as string]: s.sy } as React.CSSProperties}
                cx={s.cx}
                cy={s.cy}
                r={4.5}
              />
            ))}
            <circle className="es-core" cx={50} cy={50} r={6} />
          </g>
        </svg>
        <span className="es-word">Central</span>
      </div>
      <div className="es-verse">
        <p>&ldquo;To equip the saints for the work of ministry, for building up the body of Christ.&rdquo;</p>
        <span>Ephesians 4 : 12</span>
      </div>
    </div>
  )
}
