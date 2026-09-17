"use client"

// Chat text size — the one user-facing type control in the app. Four steps,
// staged behind Save (Convention #21) with a live preview INSIDE the card so
// picking a step never resizes the transcript behind your back. The pixel
// scale is CSS (app/globals.css, next to --chat-msg-size): the preview wrapper
// carries `data-chat-text-preview` and rides the same rules the shell applies
// on <html>, so what the preview shows is exactly what the chat will do at
// this width — phone and desktop have different scales, and the preview
// inherits the right one for free.
import { useState } from "react"
import { createClient } from "@/lib/supabase"
import { CentralButton, SegmentedControl, POCKET_KICKER_STYLE, MONO_STYLE } from "@/components/central"
import { CHAT_TEXT_SIZES, CHAT_TEXT_SIZE_LABELS, type ChatTextSize } from "../types"

export function TextSizeSection({
  userId,
  ministryId,
  value,
  onChange,
  mobile = false,
}: {
  userId: string
  ministryId: string
  value: ChatTextSize
  /** Fires after the write lands — the shell applies it app-wide. */
  onChange?: (s: ChatTextSize) => void
  mobile?: boolean
}) {
  const [pending, setPending] = useState<ChatTextSize>(value)
  const [savedState, setSavedState] = useState<ChatTextSize>(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = pending !== savedState

  async function handleSave() {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    // .select().single(): without RETURNING, PostgREST answers 204 for one row
    // OR zero, so an RLS/filter miss would read as a successful save.
    const { error: err } = await supabase
      .from("profiles")
      .update({ chat_text_size: pending })
      .eq("id", userId)
      .eq("ministry_id", ministryId)
      .select("chat_text_size")
      .single()
    setSaving(false)
    if (err) {
      setError("Couldn't save your text size — try again")
      return
    }
    setSavedState(pending)
    onChange?.(pending)
  }

  const card = mobile
    ? { borderRadius: "var(--r-pocket)", overflow: "hidden" as const, background: "var(--ivory)" }
    : { border: "1px solid var(--line)", borderRadius: "var(--r-card)", overflow: "hidden" as const, background: "var(--cream)" }
  const pad = mobile ? "14px 18px" : "16px 18px"

  const options = CHAT_TEXT_SIZES.map((id) => ({ id, label: CHAT_TEXT_SIZE_LABELS[id] }))

  return (
    <div>
      <p style={{ ...(mobile ? POCKET_KICKER_STYLE : MONO_STYLE), marginBottom: 10, marginTop: 0 }}>Text size</p>
      <div style={card}>
        <div style={{ padding: pad }}>
          <div style={{ fontSize: mobile ? 14.5 : 14, fontWeight: mobile ? 600 : 500, color: "var(--ink)" }}>Messages</div>
          <div style={{ marginTop: mobile ? 2 : 4, marginBottom: 12, fontSize: 13, color: mobile ? "var(--muted-text)" : "var(--body)", lineHeight: 1.5 }}>
            How big messages read in a conversation. Follows you to every device.
          </div>
          {mobile ? (
            // Four steps is one past the fchip-rail ceiling (mobile §3: ≤3 in a
            // row, 4+ become screens) and a screen for a text size is absurd —
            // so this is the Governance per-team TRACK instead: one pill on the
            // --pocket-track fill, four equal cells, the active cell solid plum.
            // Loose fchips were tried: they wrapped to two lines at 390 and the
            // ivory-off chips vanished against the ivory card.
            <div
              role="radiogroup"
              aria-label="Text size"
              style={{ display: "flex", padding: 3, borderRadius: 999, background: "var(--pocket-track)" }}
            >
              {options.map((o) => {
                const active = pending === o.id
                return (
                  <button
                    key={o.id}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPending(o.id)}
                    style={{
                      flex: "1 1 0", minWidth: 0, minHeight: 38, padding: "0 4px",
                      border: "none", borderRadius: 999, whiteSpace: "nowrap",
                      fontFamily: "var(--serif)", fontSize: 12, fontWeight: active ? 600 : 500,
                      background: active ? "var(--plum)" : "transparent",
                      color: active ? "var(--cream-on-dark)" : "var(--body)",
                      cursor: "pointer",
                      transition: "background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out)",
                    }}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          ) : (
            <SegmentedControl options={options} value={pending} onChange={setPending} aria-label="Text size" />
          )}
        </div>

        {/* Preview — a real pair of bubbles at the pending step, on the chat's
            own cream so an ivory incoming bubble stays visible inside an ivory
            card. Same padding class and radii as message-row, so the bubble
            grows with the type here exactly as it will there. */}
        <div
          data-chat-text-preview={pending}
          data-testid="chat-text-preview"
          style={{
            margin: mobile ? "0 18px 18px" : "0 18px 16px",
            padding: "14px 14px",
            background: "var(--cream)",
            border: mobile ? undefined : "1px solid var(--line-3)",
            borderRadius: "var(--r-pocket-sm)",
            display: "flex", flexDirection: "column", gap: 4,
          }}
        >
          <div
            className="chat-bubble-pad"
            style={{
              alignSelf: "flex-start", maxWidth: "75%",
              background: "var(--ivory)", color: "var(--ink)",
              borderRadius: "var(--r-pocket-sm)", borderTopLeftRadius: 4,
              fontSize: "var(--chat-msg-size)", lineHeight: "var(--chat-msg-lh)",
            }}
          >
            Hey! Are you coming tonight?
          </div>
          <div
            className="chat-bubble-pad"
            style={{
              alignSelf: "flex-end", maxWidth: "75%",
              background: "var(--plum-2)", color: "var(--cream-on-dark)",
              borderRadius: "var(--r-pocket-sm)", borderTopRightRadius: 4,
              fontSize: "var(--chat-msg-size)", lineHeight: "var(--chat-msg-lh)",
            }}
          >
            Yes — see you at 7
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" style={{ marginTop: 10, marginBottom: 0, fontSize: 13, color: "var(--danger)" }}>{error}</p>
      )}
      {dirty && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <CentralButton variant="secondary" size="sm" onClick={() => setPending(savedState)} disabled={saving}>
            Cancel
          </CentralButton>
          <CentralButton variant="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </CentralButton>
        </div>
      )}
    </div>
  )
}
