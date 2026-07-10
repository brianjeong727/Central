"use client"

import { useRef, useState, CSSProperties, KeyboardEvent, PointerEvent } from "react"
import { Check, Lock } from "lucide-react"
import { CentralButton } from "./button"
import type { CongregationQuestion } from "@/app/home/types"

// ── Pastor Pulse hero slide ────────────────────────────────────────────────────
// A flat-plum interactive card hosted as the LEAD slide of the home hero carousel
// (via HomeHeroCarousel's `pulseNode` prop). Purely presentational + interactive —
// all answer state lives in HomeTab and flows in through props.
//
// Translucent cream on the plum surface is ALWAYS expressed as
// color-mix(in srgb, var(--cream) N%, transparent) — never raw rgba hex.
const cream = (pct: number) => `color-mix(in srgb, var(--cream) ${pct}%, transparent)`

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

export interface PulseSlideCardProps {
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
              background: "var(--cream)",
              color: "var(--plum-2)",
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
          style={{ position: "relative", height: 6, borderRadius: 999, background: cream(20) }}
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
                background: "var(--cream)",
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
              background: "var(--cream)",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
      {/* ticks 1..10 */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {Array.from({ length: SCALE_MAX }, (_, i) => (
          <span key={i} style={{ fontFamily: "var(--mono)", fontSize: 10, color: cream(42) }}>
            {i + 1}
          </span>
        ))}
      </div>
      {/* word anchors */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px", color: cream(50) }}>
          Struggling
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "1px", color: cream(50) }}>
          Thriving
        </span>
      </div>
    </div>
  )
}

export function PulseSlideCard({
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
}: PulseSlideCardProps) {
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

  const shell: CSSProperties = {
    position: "relative",
    boxSizing: "border-box",
    width: "100%",
    height: "100%",
    minHeight: mobile ? 280 : 300,
    display: "flex",
    flexDirection: "column",
    background: "var(--plum-2)",
    border: "1px solid var(--plum-deep)",
    borderRadius: "var(--r-hero)",
    padding: "var(--space-9) 30px", // 30px horizontal is a one-off inside this card
    color: "var(--cream)",
  }

  const anonTag = (
    <div
      style={{
        position: "absolute",
        top: "var(--space-9)",
        right: 30,
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cream(50), flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "1.1px", color: cream(50) }}>
        Anonymous
      </span>
    </div>
  )

  const eyebrow = (text: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--cream)", flexShrink: 0 }} />
      <span style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "1.4px", color: cream(70) }}>
        {text}
      </span>
    </div>
  )

  // ── Answered state — centered confirmation, then the slide drops ──
  if (submitted) {
    return (
      <div style={shell}>
        {eyebrow("Pastor Pulse")}
        {anonTag}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: "var(--space-5)",
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              border: `1.5px solid ${cream(40)}`,
              display: "grid",
              placeItems: "center",
            }}
          >
            <Check style={{ width: 20, height: 20, color: "var(--cream)" }} />
          </div>
          <div style={{ fontFamily: "var(--serif)", fontSize: 23, fontWeight: 600, color: "var(--cream)" }}>
            Thanks for sharing.
          </div>
          <div style={{ fontSize: 13, color: cream(65) }}>
            Your response was received anonymously.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={shell}>
      {eyebrow(`Pastor Pulse · ${pulseTypeLabel(type)}`)}
      {anonTag}

      {/* question */}
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1.14,
          color: "var(--cream)",
          maxWidth: 480,
          marginTop: "var(--space-5)",
        }}
      >
        {question.question_text}
      </div>

      {/* answer area — grows to fill the fixed-height card so the free-text
          submit can pin to the bottom (see marginTop:auto on the button) */}
      <div style={{ flex: 1, marginTop: "var(--space-8)", display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
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
                      background: sel ? "var(--cream)" : cream(9),
                      border: `1px solid ${sel ? "var(--cream)" : cream(26)}`,
                      color: sel ? "var(--plum-2)" : "var(--cream)",
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
                      borderRadius: 11,
                      background: sel ? "var(--cream)" : cream(7),
                      border: `1px solid ${sel ? "var(--cream)" : cream(22)}`,
                      color: sel ? "var(--plum-2)" : "var(--cream)",
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
                        border: `1.5px solid ${sel ? "var(--plum-2)" : cream(50)}`,
                        background: sel ? "radial-gradient(var(--plum-2) 42%, transparent 46%)" : "transparent",
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
                background: inputFocused ? cream(12) : cream(8),
                border: `1px solid ${inputFocused ? "var(--cream)" : cream(24)}`,
                borderRadius: 11,
                padding: "var(--space-5) var(--space-6)",
                fontSize: 14,
                lineHeight: 1.5,
                color: "var(--cream)",
                fontFamily: "var(--sans)",
                resize: "none",
                outline: "none",
              }}
            />
            {type === "prayer" && (
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "calc(var(--space-3) * -1)" }}>
                <Lock style={{ width: 13, height: 13, color: cream(55), flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: cream(55), fontFamily: "var(--sans)" }}>
                  Shared privately with the prayer team
                </span>
              </div>
            )}
          </>
        )}

        {/* Hero-invert primary — per §4.3 the cream-on-plum invert is a call-site
            override on CentralButton. Background/color/opacity are forced here even
            while disabled, so the not-yet-answerable state stays DIM-CREAM (0.35)
            instead of CentralButton's default cream-2/faint disabled treatment. */}
        <CentralButton
          type="button"
          variant="primary"
          onClick={onSubmit}
          disabled={!canSubmit || pulseSubmitting}
          style={{
            alignSelf: "flex-start",
            // Free-text types (open/prayer) have a short textarea, so pin the
            // submit to the bottom of the card instead of leaving dead space
            // below it. Poll/scale keep the button directly under their content.
            marginTop: type === "open" || type === "prayer" ? "auto" : undefined,
            background: "var(--cream)",
            color: "var(--plum-2)",
            border: "none",
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 600,
            cursor: !canSubmit || pulseSubmitting ? "default" : "pointer",
            opacity: !canSubmit ? 0.35 : 1,
          }}
        >
          {pulseSubmitting ? "Submitting…" : "Submit anonymously"}
        </CentralButton>
      </div>
    </div>
  )
}
