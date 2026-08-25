// ─── Ring tones, synthesized ─────────────────────────────────────────────────
//
// Two tones: the RING a callee hears, and the quieter RINGBACK the caller hears
// while waiting. Both are generated with the Web Audio API rather than shipped
// as audio files — a ring is a few sine pulses, and synthesizing it keeps the
// bundle free of a binary asset, gives an exact loop with no decode latency, and
// lets the pattern stop mid-cycle the instant a call is answered.
//
// Autoplay policy is the real constraint here, and it cannot be fully solved:
// a browser will not let a page make noise until that page has been interacted
// with, and an INCOMING call is by definition not something the callee did. So
// `primeAudio()` is called from the app's first user gesture to unlock a context
// ahead of time, and every play path fails silently if the unlock never happened
// — a silent ring is bad, a thrown error mid-call is worse. The visual ring and
// the vibration are what make the feature work when audio is blocked.
//
// The tones are deliberately soft and slow (a warm two-note motif, not a
// telephone bell): this is a ministry app, and it rings in rooms where people
// are praying.

type Ctor = typeof AudioContext
function audioCtor(): Ctor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

let ctx: AudioContext | null = null
let master: GainNode | null = null
let timer: ReturnType<typeof setInterval> | null = null
let vibrateTimer: ReturnType<typeof setInterval> | null = null
let live: OscillatorNode[] = []

function context(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = audioCtor()
  if (!Ctor) return null
  try {
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    return ctx
  } catch {
    return null
  }
}

/**
 * Unlock audio from a real user gesture so a later incoming ring can be heard.
 * Cheap and idempotent — safe to call on every tap.
 */
export function primeAudio(): void {
  const c = context()
  if (!c) return
  if (c.state === "suspended") void c.resume().catch(() => {})
}

function pulse(freqs: number[], at: number, dur: number, peak: number) {
  const c = ctx
  if (!c || !master) return
  for (const f of freqs) {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = "sine"
    osc.frequency.value = f
    // Soft attack and release — a hard gate on a sine clicks audibly.
    g.gain.setValueAtTime(0, at)
    g.gain.linearRampToValueAtTime(peak / freqs.length, at + 0.06)
    g.gain.setValueAtTime(peak / freqs.length, at + dur - 0.12)
    g.gain.linearRampToValueAtTime(0, at + dur)
    osc.connect(g)
    g.connect(master)
    osc.start(at)
    osc.stop(at + dur + 0.02)
    live.push(osc)
    osc.onended = () => {
      live = live.filter((o) => o !== osc)
      try { g.disconnect() } catch { /* already torn down */ }
    }
  }
}

function begin(pattern: () => void, periodMs: number, gain: number) {
  const c = context()
  if (!c || !master) return
  stop()
  if (c.state === "suspended") void c.resume().catch(() => {})
  master.gain.value = gain
  pattern()
  timer = setInterval(pattern, periodMs)
}

/** The callee's ring: a rising two-note motif, twice, then a rest. */
export function startRing(): void {
  const c = context()
  if (!c) return
  begin(
    () => {
      const t = c.currentTime + 0.02
      pulse([587.33, 880.0], t, 0.42, 0.5)          // D5 + A5
      pulse([659.25, 987.77], t + 0.5, 0.52, 0.5)   // E5 + B5
    },
    2600,
    0.5,
  )
  startVibration()
}

/** What the caller hears while it rings on the other end — the same motif an
 *  octave down and much quieter, so the two are recognisably one sound. */
export function startRingback(): void {
  const c = context()
  if (!c) return
  begin(
    () => {
      const t = c.currentTime + 0.02
      pulse([293.66], t, 0.9, 0.16)
    },
    3200,
    0.16,
  )
}

export function stop(): void {
  if (timer) { clearInterval(timer); timer = null }
  stopVibration()
  if (master && ctx) {
    // Ramp the master down rather than cutting it — an oscillator killed at a
    // non-zero sample is a click.
    try {
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime)
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08)
    } catch { /* context closed */ }
  }
  for (const osc of live) { try { osc.stop() } catch { /* already stopped */ } }
  live = []
}

function startVibration() {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return
  const buzz = () => { try { navigator.vibrate([420, 220, 420, 1540]) } catch { /* denied */ } }
  buzz()
  vibrateTimer = setInterval(buzz, 2600)
}

function stopVibration() {
  if (vibrateTimer) { clearInterval(vibrateTimer); vibrateTimer = null }
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate(0) } catch { /* denied */ }
  }
}
