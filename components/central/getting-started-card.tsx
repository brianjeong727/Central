"use client"

import { useState, type CSSProperties } from "react"
import { Check, ChevronRight, Copy } from "lucide-react"
import { CentralCard } from "./card"
import { CardTitle } from "./card-title"
import { ListRow } from "./list-row"
import { EYEBROW_STYLE } from "./typography"
import { POCKET_KICKER_STYLE } from "./pocket"

// ── Types ─────────────────────────────────────────────────────────────────────
// These types are the contract between this card and the setup-checklist server
// action (app/actions/setup-checklist.ts imports them type-only). They live
// here because components/central is a leaf layer — it must never import from
// app/, so app/ depends on this file, not the other way around.

export type SetupChecklistItemKey =
  | "invite_leaders"
  | "first_announcement"
  | "offering"
  | "presidents"

export interface SetupChecklistItem {
  key: SetupChecklistItemKey
  done: boolean
}

export interface SetupChecklistEligible {
  eligible: true
  dismissed: false
  items: SetupChecklistItem[]
  inviteCode: string | null
  membersCount: number
  teamsTotal: number
  teamsWithPresident: number
}

export type SetupChecklistData = { eligible: false } | SetupChecklistEligible

// ── Internals ─────────────────────────────────────────────────────────────────

const ROW_LABELS: Record<SetupChecklistItemKey, string> = {
  invite_leaders: "Invite your student leaders",
  first_announcement: "Post your first announcement",
  offering: "Set up offering",
  presidents: "Set your workspace presidents",
}

// Check circle — plum-filled ✓ when done, hairline circle when not (§4.10
// checkbox colors, circular). Rendered as a button only for the toggle item.
function CheckCircle({ done, size = 20 }: { done: boolean; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: done ? "var(--plum)" : "transparent",
        border: done ? "1.5px solid var(--plum)" : "1.5px solid var(--dashed)",
        transition: "background-color 150ms ease-out, border-color 150ms ease-out",
      }}
    >
      {done && <Check style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55), color: "var(--cream)" }} strokeWidth={2.4} />}
    </span>
  )
}

interface GettingStartedCardProps {
  data: SetupChecklistEligible
  onToggleLeadersInvited: (done: boolean) => void
  onDismiss: () => void
  // Deep-link rows — the parent owns navigation (one atomic replace upstream).
  onNavigate: (key: Exclude<SetupChecklistItemKey, "invite_leaders">) => void
  // "desktop" = the bordered CentralCard treatment; "mobile" = the Pocket
  // Daybreak reskin (ivory borderless, mono kickers, 24px checkboxes). Same data
  // + handlers — a skin switch, not a second data flow.
  variant?: "desktop" | "mobile"
  style?: CSSProperties
}

// "Getting started" checklist for admins of a freshly-approved ministry.
// Purely presentational — fetching, optimistic toggles, and dismissal live in
// the parent (home-tab), which passes the resolved data down.
export function GettingStartedCard({
  data,
  onToggleLeadersInvited,
  onDismiss,
  onNavigate,
  variant = "desktop",
  style,
}: GettingStartedCardProps) {
  const [copied, setCopied] = useState(false)

  const doneCount = data.items.filter((i) => i.done).length

  async function handleCopy() {
    if (!data.inviteCode) return
    try {
      await navigator.clipboard.writeText(data.inviteCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard unavailable — leave the code visible for manual copy.
    }
  }

  // ── Mobile (Pocket Daybreak) reskin ─────────────────────────────────────────
  // Ivory borderless card, SETUP kicker + "N OF M" counter, serif title, 24px
  // plum checkboxes, an invite-code copy chip, a --pocket-track emphasis row for
  // the presidents step, and a quiet Dismiss.
  if (variant === "mobile") {
    return (
      <div style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket)", padding: "20px 18px", ...style }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ ...POCKET_KICKER_STYLE, flex: 1 }}>Setup</span>
          <span style={POCKET_KICKER_STYLE}>{doneCount} of {data.items.length}</span>
        </div>
        <div style={{ fontFamily: "var(--serif)", fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)", marginTop: 6 }}>
          Getting started
        </div>

        {data.items.map((item) => {
          if (item.key === "invite_leaders") {
            return (
              <div key={item.key} style={{ display: "flex", gap: 14, padding: "14px 0", borderBottom: "1px solid var(--line-3)", alignItems: "flex-start" }}>
                <button
                  onClick={() => onToggleLeadersInvited(!item.done)}
                  aria-pressed={item.done}
                  aria-label={item.done ? "Mark leaders as not yet invited" : "Mark leaders as invited"}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", flexShrink: 0, marginTop: 2 }}
                >
                  <CheckCircle done={item.done} size={24} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--sans)" }}>{ROW_LABELS[item.key]}</div>
                  {data.inviteCode && (
                    <button
                      onClick={handleCopy}
                      title="Copy invite code"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, padding: "7px 12px", borderRadius: "var(--r-input)", background: "var(--pocket-track)", border: "none", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 13, letterSpacing: "1.5px", color: "var(--ink)" }}
                    >
                      {data.inviteCode}
                      {copied ? (
                        <span style={{ fontFamily: "var(--sans)", fontSize: 10, letterSpacing: 0, color: "var(--muted-text)" }}>Copied</span>
                      ) : (
                        <Copy style={{ width: 13, height: 13, color: "var(--body)" }} />
                      )}
                    </button>
                  )}
                  <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 7, fontFamily: "var(--sans)" }}>
                    {data.membersCount} {data.membersCount === 1 ? "member" : "members"} so far
                  </div>
                </div>
              </div>
            )
          }

          if (item.key === "presidents") {
            return (
              <button
                key={item.key}
                onClick={() => onNavigate("presidents")}
                style={{ width: "100%", textAlign: "left", display: "flex", gap: 14, alignItems: "center", marginTop: 12, padding: 14, background: "var(--pocket-track)", border: "none", borderRadius: "var(--r-callout)", cursor: "pointer" }}
              >
                <CheckCircle done={item.done} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--sans)" }}>{ROW_LABELS[item.key]}</div>
                  <div style={{ fontSize: 13, color: "var(--muted-text)", marginTop: 2, fontFamily: "var(--sans)" }}>
                    {data.teamsWithPresident} of {data.teamsTotal} {data.teamsTotal === 1 ? "workspace has" : "workspaces have"} a president
                  </div>
                </div>
                <ChevronRight style={{ width: 16, height: 16, color: "var(--faint)", flexShrink: 0 }} />
              </button>
            )
          }

          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key as Exclude<SetupChecklistItemKey, "invite_leaders">)}
              style={{ width: "100%", textAlign: "left", display: "flex", gap: 14, alignItems: "center", padding: "14px 0", background: "none", border: "none", borderBottom: "1px solid var(--line-3)", cursor: "pointer" }}
            >
              <CheckCircle done={item.done} size={24} />
              <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: "var(--ink)", fontFamily: "var(--sans)" }}>{ROW_LABELS[item.key]}</div>
              <ChevronRight style={{ width: 16, height: 16, color: "var(--faint)", flexShrink: 0 }} />
            </button>
          )
        })}

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            onClick={onDismiss}
            style={{ background: "none", border: "none", padding: "6px 0", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "var(--body)", fontFamily: "var(--sans)" }}
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  return (
    <CentralCard padding="18px 22px" style={style}>
      {/* Header — serif title + quiet progress */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={EYEBROW_STYLE}>Setup</div>
          <CardTitle size={20} style={{ marginTop: 4 }}>Getting started</CardTitle>
        </div>
        <span style={{ ...EYEBROW_STYLE, whiteSpace: "nowrap" }}>
          {doneCount} of {data.items.length}
        </span>
      </div>

      {/* Rows */}
      <div style={{ marginTop: 10 }}>
        {data.items.map((item, idx) => {
          const last = idx === data.items.length - 1
          const labelColor = item.done ? "var(--muted-text)" : "var(--ink)"

          if (item.key === "invite_leaders") {
            return (
              <ListRow
                key={item.key}
                last={last}
                hover={false}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 6px" }}
              >
                <button
                  onClick={() => onToggleLeadersInvited(!item.done)}
                  aria-pressed={item.done}
                  aria-label={item.done ? "Mark leaders as not yet invited" : "Mark leaders as invited"}
                  style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "inline-flex", flexShrink: 0 }}
                >
                  <CheckCircle done={item.done} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontFamily: "var(--sans)", color: labelColor }}>
                    {ROW_LABELS[item.key]}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                    {data.inviteCode && (
                      <button
                        onClick={handleCopy}
                        title="Copy invite code"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 10px",
                          borderRadius: "var(--r-chip)",
                          background: "var(--ivory)",
                          border: "1px solid var(--line-2)",
                          cursor: "pointer",
                          fontFamily: "var(--mono)",
                          fontSize: 12,
                          letterSpacing: "1px",
                          color: "var(--ink)",
                        }}
                      >
                        {data.inviteCode}
                        {copied ? (
                          <span style={{ fontFamily: "var(--sans)", fontSize: 10, letterSpacing: 0, color: "var(--muted-text)" }}>
                            Copied
                          </span>
                        ) : (
                          <Copy style={{ width: 11, height: 11, color: "var(--muted-text)" }} />
                        )}
                      </button>
                    )}
                    <span style={{ fontSize: 12, color: "var(--muted-text)", fontFamily: "var(--sans)" }}>
                      {data.membersCount} {data.membersCount === 1 ? "member" : "members"} so far
                    </span>
                  </div>
                </div>
              </ListRow>
            )
          }

          const sub =
            item.key === "presidents"
              ? `${data.teamsWithPresident} of ${data.teamsTotal} ${data.teamsTotal === 1 ? "workspace has" : "workspaces have"} a president`
              : null

          return (
            <ListRow
              key={item.key}
              last={last}
              onClick={() => onNavigate(item.key as Exclude<SetupChecklistItemKey, "invite_leaders">)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 6px", cursor: "pointer" }}
            >
              <CheckCircle done={item.done} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontFamily: "var(--sans)", color: labelColor }}>
                  {ROW_LABELS[item.key]}
                </div>
                {sub && (
                  <div style={{ fontSize: 12, color: "var(--muted-text)", fontFamily: "var(--sans)", marginTop: 3 }}>
                    {sub}
                  </div>
                )}
              </div>
              <ChevronRight style={{ width: 14, height: 14, color: "var(--faint)", flexShrink: 0 }} />
            </ListRow>
          )
        })}
      </div>

      {/* Dismiss — quiet, bottom-right */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button
          onClick={onDismiss}
          style={{
            background: "none",
            border: "none",
            padding: "2px 4px",
            cursor: "pointer",
            fontSize: 12,
            color: "var(--muted-text)",
            fontFamily: "var(--sans)",
          }}
        >
          Dismiss
        </button>
      </div>
    </CentralCard>
  )
}
