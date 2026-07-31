// ── Native launch-splash bridge ────────────────────────────────────────────────
// `launchAutoHide` is FALSE in capacitor.config.ts, so the plum native splash stays
// up until the web layer explicitly releases it. This module is the single owner of
// that release, shared by two callers:
//
//  • `NativeSplashRelease` (mounted in the ROOT layout) — the universal safety net.
//    Every route releases the splash, including the ones a user can legitimately
//    cold-launch into that are NOT /home or /login: /ministries (no ministry yet),
//    /complete-profile (member missing gender/grad year), /pending, /pick-ministry,
//    /onboarding, /register-ministry, /admin. Before this existed, those routes never
//    called hide() at all and the app hung on the static splash forever.
//  • `EntrySplash` (/home + /login) — the one-time "One Body" welcome overlay, which
//    must hold the native splash until its own plum overlay has PAINTED so the
//    handoff has no flash.
//
// Those two goals conflict for exactly one frame, so EntrySplash CLAIMS the splash
// synchronously when it's going to animate; the root-layout net defers a tick and
// backs off if the splash was claimed. Module state is per page load — a full
// reload re-arms both, which is correct (a cold launch shows the native splash again).

let claimed = false

// Called by EntrySplash when it will paint its overlay first and own the handoff.
// Must run synchronously inside its effect, before the release net's deferred check.
export function claimNativeSplash() {
  claimed = true
}

export function isNativeSplashClaimed() {
  return claimed
}

// Release the native splash. On web the dynamic import resolves to a no-op bridge;
// any failure is swallowed so nothing breaks the web build or runtime.
export async function hideNativeSplash() {
  claimed = true
  try {
    const mod = await import("@capacitor/splash-screen")
    await mod.SplashScreen.hide()
  } catch {
    /* web / no native bridge — no-op */
  }
}
