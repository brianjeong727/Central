"use client"

import { CSSProperties } from "react"
import { CentralButton } from "./button"

const PLUM_EYEBROW: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  letterSpacing: "1.4px",
  color: "var(--plum)",
  textTransform: "uppercase",
}

const MUTED_EYEBROW: CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 11,
  letterSpacing: "1.4px",
  color: "var(--muted-text)",
  textTransform: "uppercase",
}

interface UpNextCardProps {
  label: string
  labelAccent?: boolean
  title: string
  body?: string | null
  isEvent?: boolean
  userHasRsvped?: boolean
  rsvping?: boolean
  rsvpCount?: number
  attendees?: { user_id: string; name: string }[]
  showAttendees?: boolean
  onRsvp?: () => void
  onDetails: () => void
  mobile?: boolean
  style?: CSSProperties
}

export function UpNextCard({
  label,
  labelAccent = true,
  title,
  body,
  isEvent,
  userHasRsvped,
  rsvping,
  rsvpCount = 0,
  attendees = [],
  showAttendees,
  onRsvp,
  onDetails,
  mobile = false,
  style,
}: UpNextCardProps) {
  const titleSize = mobile ? 34 : 44
  const padding = mobile ? "24px 24px" : "36px 36px"
  const maxAttendees = mobile ? 6 : 8

  return (
    <div
      style={{
        background: "var(--cream-3)",
        borderTop: "2px solid var(--plum)",
        borderLeft: "1px solid var(--line)",
        borderRight: "1px solid var(--line)",
        borderBottom: "1px solid var(--line)",
        borderRadius: "var(--r-callout)",
        padding,
        display: "flex",
        flexDirection: "column",
        gap: mobile ? 14 : 18,
        ...style,
      }}
    >
      {/* Eyebrow — plum for "Up Next", muted for "Latest" */}
      <div style={labelAccent ? PLUM_EYEBROW : MUTED_EYEBROW}>{label}</div>

      {/* Title + body */}
      <div>
        <h2
          style={{
            fontFamily: "var(--serif)",
            fontSize: titleSize,
            fontWeight: 400,
            letterSpacing: "-0.5px",
            lineHeight: 1.05,
            color: "var(--ink)",
            margin: 0,
          }}
        >
          {title}
        </h2>
        {body && (
          <p
            className="line-clamp-3"
            style={{
              fontSize: 13,
              color: "var(--body)",
              marginTop: 10,
              lineHeight: 1.55,
            }}
          >
            {body}
          </p>
        )}
      </div>

      {/* Actions */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CentralButton variant="primary" onClick={onDetails}>
            {isEvent ? "See details" : "See announcement"}
          </CentralButton>
          {isEvent && onRsvp && (
            <CentralButton
              onClick={onRsvp}
              disabled={rsvping}
              variant="secondary"
            >
              {userHasRsvped ? "Going ✓" : "RSVP"}
            </CentralButton>
          )}
          {isEvent && rsvpCount > 0 && (
            <span style={{ fontSize: 12, color: "var(--faint)", fontWeight: 500 }}>
              {rsvpCount} going
            </span>
          )}
        </div>

        {showAttendees && attendees.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {attendees.slice(0, maxAttendees).map((a) => (
              <span
                key={a.user_id}
                style={{
                  fontSize: 11,
                  color: "var(--body)",
                  background: "var(--ivory)",
                  border: "1px solid var(--line)",
                  padding: "2px 9px",
                  borderRadius: 999,
                }}
              >
                {a.name.split(" ")[0]}
              </span>
            ))}
            {attendees.length > maxAttendees && (
              <span style={{ fontSize: 11, color: "var(--faint)", padding: "2px 4px" }}>
                +{attendees.length - maxAttendees} more
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
