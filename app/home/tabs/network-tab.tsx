"use client"

import { Waypoints } from "lucide-react"
import { TabPageHeader, PageTitle, CentralCard, POCKET_KICKER_STYLE } from "@/components/central"
import { PocketChrome } from "../components/pocket-header"
import { EYEBROW_STYLE } from "../components/shared"

// Network — admin-only placeholder for a future cross-ministry hub where church
// admins plan and communicate with other churches in their local network (and
// eventually any church on Central). No schema/RLS yet — this is a teaser card.
export function NetworkTab({ onBack }: { onBack?: () => void }) {
  return (
    <div className="md:flex md:flex-col md:h-full md:overflow-hidden">
      {/* Mobile: single chrome row (no two-header) */}
      <PocketChrome title="Network" back={onBack} hideAvatar userName="" onAvatarClick={() => {}} />

      {/* Desktop header */}
      <TabPageHeader>
        <PageTitle title="Network" compact />
      </TabPageHeader>

      {/* Mobile: COMING SOON card — ivory borderless, icon ring, kicker, headline, body */}
      <div className="md:hidden px-5 pt-3.5">
        <div style={{ background: "var(--ivory)", borderRadius: "var(--r-pocket)", padding: "34px 24px", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 999, border: "1px solid var(--line-2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}>
            <Waypoints style={{ width: 24, height: 24, color: "var(--plum)" }} strokeWidth={1.6} />
          </div>
          <p style={{ ...POCKET_KICKER_STYLE, letterSpacing: "1.6px", margin: "20px 0 0" }}>Coming soon</p>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.1, margin: "10px 0 0" }}>
            Beyond your walls
          </h2>
          <p style={{ fontSize: 14.5, color: "var(--body)", lineHeight: 1.65, margin: "12px 0 0" }}>
            Plan and communicate with other churches in your local network — coordinate
            events, share resources, and reach your city together, and eventually any
            church on Central. We&apos;re building it.
          </p>
        </div>
      </div>

      {/* Desktop: coming-soon card — centered, generous, calm */}
      <div className="hidden md:block px-14 pt-16 md:flex-1 md:overflow-y-auto">
        <CentralCard
          variant="callout"
          padding="40px 32px"
          style={{
            maxWidth: 460,
            margin: "0 auto",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Icon badge — ivory circle, plum accent (surgical) */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "999px",
              background: "var(--ivory)",
              border: "1px solid var(--line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 22,
            }}
          >
            <Waypoints style={{ width: 24, height: 24, color: "var(--plum)" }} strokeWidth={1.6} />
          </div>

          <p style={{ ...EYEBROW_STYLE, marginBottom: 14 }}>Coming soon</p>

          <h2
            style={{
              fontFamily: "var(--serif)",
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--ink)",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            Beyond your walls
          </h2>

          <p
            style={{
              fontSize: 14.5,
              color: "var(--body)",
              lineHeight: 1.6,
              margin: "14px 0 0",
              maxWidth: 380,
            }}
          >
            Plan and communicate with other churches in your local network — coordinate
            events, share resources, and reach your city together, and eventually any
            church on Central. We&apos;re building it.
          </p>
        </CentralCard>
      </div>
    </div>
  )
}
