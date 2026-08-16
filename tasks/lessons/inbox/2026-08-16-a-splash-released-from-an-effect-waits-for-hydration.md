## A native splash released from a React effect hides your SSR until hydration (2026-08-16)

**What happened.** The chat list was made to server-render so it would be HTML on first
paint. Proven in production: `<button data-pocket-row="…">` is in the response body. On
the WEB it worked. In the iOS shell Brian saw no improvement at all.

The native splash is held (`launchAutoHide: false`) and released by
`NativeSplashRelease` — a `"use client"` component that calls `SplashScreen.hide()` from
a `useEffect`. An effect cannot run until the client bundle (~1.1 MB) has downloaded,
parsed and hydrated. So the plum splash sat on top of a home screen that had **already
been server-rendered and painted underneath it**. Every millisecond of SSR work was
invisible, and the app looked like it was still loading when it was in fact ready.

Measured on an iPhone 17 simulator against a LOCAL PRODUCTION build (3 runs each):

| | min | median |
|---|---|---|
| released from the effect | 3,418 ms | 4,719 ms |
| released on first paint | 2,746 ms | 2,755 ms |

**The rule.** If a native overlay covers the web view, whatever releases it becomes the
real definition of "loaded" — not first paint, not SSR. Release it from an inline
`<script>` at the end of `<body>`, talking to `window.Capacitor.Plugins` directly. Do NOT
`import` the plugin there: the import IS the bundle you are trying not to wait for. Keep
the React path as an idempotent backstop.

**Two things that make this easy to miss:**

- It is invisible on the web, where there is no splash. Every browser measurement said
  the work had succeeded. Only the shell disagreed, and nothing in a browser can tell you.
- It silently negates SSR. The HTML is correct, the paint is correct, the timing is
  correct — and the user sees none of it. There is no error, no warning, and no failing
  test; the only symptom is "it still feels slow," which is exactly the report that gets
  dismissed as subjective.

**Corollary for measuring shells:** a screenshot-size heuristic must wait for the SPLASH
before watching for content. After `simctl terminate` the iOS home screen is on screen and
compresses LARGER than a flat plum splash, so a naive "big PNG = content" check reports
content at ~360 ms — the springboard. Fix the detector, never the threshold.

**Corollary for A/B-ing a remote-URL shell:** the web change does not need an app rebuild.
Point the installed binary at a locally-served PRODUCTION build (`next start`, never
`next dev` — dev rendered `/home` in 2.2–7.2 s and drowns the signal), then swap what the
server serves between runs.

Related: [[a-perf-number-from-a-loaded-machine-is-not-a-number]]
