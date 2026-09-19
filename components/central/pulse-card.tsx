"use client"

import { useRef, useState, CSSProperties, KeyboardEvent, PointerEvent } from "react"
import { Check, Lock } from "lucide-react"
import { CentralButton } from "./button"
// eslint-disable-next-line no-restricted-imports -- pre-existing LEAF debt (app/ type import); flagged Phase 2, refactor pending
import type { CongregationQuestion } from "@/app/home/types"

// ── Pastor Pulse card ─────────────────────────────────────────────────────────
// The congregation's answer surface for a live pulse question. It used to ride as
// the LEAD slide of the home hero carousel, styled as a second plum hero: that put
// two purples side by side, made "Featured" not actually curated (the pulse
// displaced the leader's first slide for every non-pastor), and on a phone its
// absolutely-positioned ANONYMOUS tag overprinted the eyebrow. Since 2026-09-17 it
// is its own QUIET section under the hero (design pass B4, decision 1a): a tonal
// card in the page's own grammar — ivory borderless at phone width, cream-panel
// with a hairline on desktop — with plum reserved for the selected answer and the
// one primary. Purely presentational + interactive — all answer state lives in
// HomeTab and flows in through props.
//
// Translucent ink on the light surface is ALWAYS expressed as
// color-mix(in srgb, var(--ink) N%, transparent) — never raw rgba hex.
const ink = (pct: number) => `color-mix(in srgb, var(--ink) ${pct}%, transparent)`

function pulseTypeLabel(type: CongregationQuestion["question_type"]): string {
  if (type === "poll") return "Poll"
  if (type === "scale") return "Scale"
  if (type === "prayer") return "Prayer"
  return "Open"
}

// Poll layout auto-pick: chips only when EVERY option is short enough to scan.
const CHIP_MAX_CHARS = 24
const SCALE_MIN = 1
const SCALE_MAX = 10

export interface PulseCardProps {
  question: CongregationQuestion
  pulseOption: string | null
  setPulseOption: (opt: string | null) => void
  pulseScale: number | null
  setPulseScale: (n: number | null) => void
  pulseInput: string
  setPulseInput: (s: string) => void
  pulseSubmitting: boolean
  submitted: boolean
  onSubmit: () => void
  mobile?: boolean
}

// ── 1–10 drag slider (scale questions) ────────────────────────────────────────
// Untouched (value null): thumb rests at the middle, value bubble hidden, no fill.
// Pointer down / drag / tap on the track snaps to the nearest integer 1..10.
function ScaleSlider({ value, onChange }: { value: number | null; onChange: (n: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const snapFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return
    const x = clientX - rect.left
    const raw = Math.round(SCALE_MIN + (x / rect.width) * (SCALE_MAX - SCALE_MIN))
    onChange(Math.min(SCALE_MAX, Math.max(SCALE_MIN, raw)))
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    snapFromClientX(e.clientX)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) snapFromClientX(e.clientX)
  }
  const endDrag = () => { draggingRef.current = false }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault()
      onChange(Math.min(SCALE_MAX, (value ?? Math.round((SCALE_MIN + SCALE_MAX) / 2) - 1) + 1))
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault()
      onChange(Math.max(SCALE_MIN, (value ?? Math.round((SCALE_MIN + SCALE_MAX) / 2) + 1) - 1))
    }
  }

  // Thumb position as a % of track width — middle while untouched.
  const pct = value == null ? 50 : ((value - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      {/* bubble + track + thumb — one pointer surface, generous hit area */}
      <div
        role="slider"
        tabIndex={0}
        aria-valuemin={SCALE_MIN}
        aria-valuemax={SCALE_MAX}
        aria-valuenow={value ?? undefined}
        aria-label="Rate from 1 to 10"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        style={{
          position: "relative",
          paddingTop: "var(--space-10)", // room for the value bubble above the thumb
          paddingBottom: 10,
          touchAction: "none",
          cursor: "pointer",
          outline: "none",
        }}
      >
        {/* value bubble — hidden until first interaction */}
        {value != null && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: `${pct}%`,
              transform: "translateX(-50%)",
              background: "var(--plum)",
              color: "var(--cream-on-dark)",
              fontFamily: "var(--sans)",
              fontSize: 12,
              fontWeight: 500,
              lineHeight: 1,
              padding: "5px 9px",
              borderRadius: 8,
              pointerEvents: "none",
            }}
          >
            {value}
          </div>
        )}
        {/* track */}
        <div
          ref={trackRef}
          style={{ position: "relative", height: 6, borderRadius: 999, background: "var(--pocket-track)" }}
        >
          {/* cream fill from left to the value — only once touched */}
          {value != null && (
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: `${pct}%`,
                borderRadius: 999,
                background: "var(--plum)",
              }}
            />
          )}
          {/* thumb */}
          <div
            style={{
              position: "absolute",
              left: `${pct}%`,
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 26,
              height: 26,
              borderRadius: 999,
              background: "var(--plum)",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
      {/* ticks 1..10 */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {Array.from({ length: SCALE_MAX }, (_, i) => (
          <span key={i} style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted-text)" }}>
            {i + 1}
          </span>
        ))}
      </div>
      {/* word anchors */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted-text)" }}>
          Struggling
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px", color: "var(--muted-text)" }}>
          Thriving
        </span>
      </div>
    </div>
  )
}

export function PulseCard({
  question,
  pulseOption,
  setPulseOption,
  pulseScale,
  setPulseScale,
  pulseInput,
  setPulseInput,
  pulseSubmitting,
  submitted,
  onSubmit,
  mobile = false,
}: PulseCardProps) {
  const [inputFocused, setInputFocused] = useState(false)

  const type = question.question_type
  const canSubmit =
    type === "poll"
      ? pulseOption != null
      : type === "scale"
        ? pulseScale != null
        : pulseInput.trim() !== ""

  // Chips when every poll option is short; rows when any option runs long.
  const options = question.options ?? []
  const useChips = options.every((o) => o.length <= CHIP_MAX_CHARS)

  // Tonal card in the host page's grammar: ivory + borderless at phone width
  // (mobile_design_system §4), cream-panel + hairline on desktop (§4.4).
  const shell: CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    background: mobile ? "var(--ivory)" : "var(--cream-panel)",
    border: mobile ? "none" : "1px solid var(--line)",
    borderRadius: mobile ? "var(--r-pocket)" : "var(--r-card)",
    padding: mobile ? "20px 18px" : "22px 24px",
    color: "var(--ink)",
  }

  const anonTag = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--faint)", flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "1.1px", color: "var(--muted-text)" }}>
        Anonymous
      </span>
    </span>
  )

  // Eyebrow and the anonymous tag share ONE flex row — the tag used to be
  // absolutely positioned and overprinted the eyebrow at 390px.
  const eyebrow = (text: string) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-3)" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)", minWidth: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--plum)", flexShrink: 0 }} />
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "1.4px", color: "var(--muted-text)" }}>
          {text}
        </span>
      </span>
      {anonTag}
    </div>
  )

  // ── Answered state — centered confirmation, then the slide drops ──
  if (submitted) {
    return (
      <div style={shell}>
        {eyebrow("Pastor Pulse")}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: "var(--space-5)",
            padding: "var(--space-8) 0 var(--space-4)",
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              border: "1.5px solid var(--plum)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <Check style={{ width: 20, height: 20, color: "var(--plum)" }} />
          </div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 23, fontWeight: 600, color: "var(--ink)" }}>
            Thanks for sharing.
          </div>
          <div style={{ fontSize: 13, color: "var(--muted-text)" }}>
            Your response was received anonymously.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={shell}>
      {eyebrow(`Pastor Pulse · ${pulseTypeLabel(type)}`)}

      {/* question — the card headline tier (mobile 21/600; desktop 24/600) */}
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: mobile ? 21 : 24,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1.18,
          color: "var(--ink)",
          maxWidth: 480,
          marginTop: "var(--space-5)",
        }}
      >
        {question.question_text}
      </div>

      {/* answer area */}
      <div style={{ marginTop: "var(--space-7)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
        {type === "poll" && options.length > 0 && (
          useChips ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
              {options.map((opt, i) => {
                const sel = pulseOption === opt
                return (
                  <button
                    key={`${opt}-${i}`}
                    type="button"
                    onClick={() => setPulseOption(opt)}
                    style={{
                      padding: "var(--space-4) var(--space-6)",
                      borderRadius: "var(--r-input)",
                      background: sel ? "var(--plum-tint)" : (mobile ? "var(--cream)" : "var(--cream)"),
                      border: `1px solid ${sel ? "var(--plum)" : "var(--line-2)"}`,
                      color: sel ? "var(--plum)" : "var(--body)",
                      fontSize: 13,
                      fontWeight: sel ? 500 : 400,
                      fontFamily: "var(--sans)",
                      cursor: "pointer",
                    }}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {options.map((opt, i) => {
                const sel = pulseOption === opt
                return (
                  <button
                    key={`${opt}-${i}`}
                    type="button"
                    onClick={() => setPulseOption(opt)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-5)",
                      padding: "var(--space-5) var(--space-6)",
                      borderRadius: "var(--r-input)",
                      background: sel ? "var(--plum-tint)" : "var(--cream)",
                      border: `1px solid ${sel ? "var(--plum)" : "var(--line-2)"}`,
                      color: sel ? "var(--plum)" : "var(--body)",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        flexShrink: 0,
                        border: `1.5px solid ${sel ? "var(--plum)" : "var(--dashed)"}`,
                        background: sel ? "radial-gradient(var(--plum) 42%, transparent 46%)" : "transparent",
                      }}
                    />
                    <span style={{ fontSize: 14, fontFamily: "var(--sans)", fontWeight: sel ? 500 : 400 }}>{opt}</span>
                  </button>
                )
              })}
            </div>
          )
        )}

        {type === "scale" && <ScaleSlider value={pulseScale} onChange={setPulseScale} />}

        {(type === "open" || type === "prayer") && (
          <>
            <textarea
              value={pulseInput}
              onChange={(e) => setPulseInput(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={type === "prayer" ? "Share your prayer request…" : "Share your thoughts…"}
              className="pulse-slide-textarea"
              style={{
                width: "100%",
                minHeight: 74,
                boxSizing: "border-box",
                background: "var(--cream)",
                border: `1px solid ${inputFocused ? "var(--plum)" : "var(--line-2)"}`,
                borderRadius: "var(--r-input)",
                padding: "var(--space-5) var(--space-6)",
                fontSize: 14,
                lineHeight: 1.5,
                color: "var(--ink)",
                fontFamily: "var(--sans)",
                resize: "none",
                outline: "none",
              }}
            />
            {type === "prayer" && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "calc(var(--space-3) * -1)" }}>
                <Lock style={{ width: 13, height: 13, color: "var(--muted-text)", flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "var(--muted-text)", fontFamily: "var(--sans)" }}>
                  Shared privately with the prayer team
                </span>
              </div>
            )}
          </>
        )}

        {/* The one plum moment on the card: the ordinary primary, no invert. */}
        <CentralButton
          type="button"
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={!canSubmit || pulseSubmitting}
          style={{ alignSelf: "flex-start" }}
        >
          {pulseSubmitting ? "Submitting…" : "Submit anonymously"}
        </CentralButton>
      </div>
    </div>
  )
}
