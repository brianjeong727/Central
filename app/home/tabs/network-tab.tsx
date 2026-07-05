"use client"

import { Waypoints } from "lucide-react"
import { TabPageHeader, PageTitle, CentralCard } from "@/components/central"
import { EYEBROW_STYLE } from "../components/shared"

// Network — admin-only placeholder for a future cross-ministry hub where church
// admins plan and communicate with other churches in their local network (and
// eventually any church on Central). No schema/RLS yet — this is a teaser card.
export function NetworkTab() {
  return (
    <div className="pb-28 md:pb-0 md:flex md:flex-col md:h-full md:overflow-hidden">
      {/* Mobile header */}
      <div className="md:hidden px-5 pt-14 pb-5">
        <p style={EYEBROW_STYLE}>Network</p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", lineHeight: 1.05, margin: "12px 0 0" }}>Network</h1>
      </div>

      {/* Desktop header */}
      <TabPageHeader>
        <PageTitle title="Network" compact />
      </TabPageHeader>

      {/* Coming-soon card — centered, generous, calm */}
      <div className="px-5 md:px-14 pt-8 md:pt-16 md:flex-1 md:overflow-y-auto">
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
