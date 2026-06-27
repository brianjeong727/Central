"use client"

import type { CSSProperties } from "react"
import { HeroFrame } from "./home-hero-carousel"
import { TabPageHeader } from "./tab-page-header"

// ── SkeletonBlock — token-colored placeholder with a static soft pulse ────────
// Calm, not playful: a gentle opacity pulse (no moving shimmer sweep). All fills
// come from cream-family tokens so skeletons read as quiet placeholders on the
// cream surface. Compose every per-tab skeleton from this primitive.

export function SkeletonBlock({
  width,
  height,
  radius = "var(--r-card)",
  className = "",
  style,
}: {
  width?: number | string
  height?: number | string
  radius?: number | string
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      className={`skeleton-pulse ${className}`}
      style={{
        width,
        height,
        borderRadius: radius,
        background: "var(--cream-2)",
        flexShrink: 0,
        ...style,
      }}
    />
  )
}

// ── Shared header placeholder — mirrors PageTitle eyebrow + title block ───────
function SkeletonTitleBlock() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <SkeletonBlock width={120} height={11} radius="var(--r-pill)" />
      <SkeletonBlock width={280} height={34} radius="var(--r-chip)" />
    </div>
  )
}

// ── Home tab — full skeleton (header + featured hero + recent chats) ──────────
// Replaces the full-tab Spinner in home-tab (no header is shown during its load).
export function HomeTabSkeleton() {
  return (
    <div className="px-5 md:px-14 pt-8">
      <SkeletonTitleBlock />
      <div style={{ marginTop: "var(--space-9)" }}>
        {/* "Featured" eyebrow above the hero */}
        <SkeletonBlock width={84} height={11} radius="var(--r-pill)" style={{ marginBottom: "var(--space-6)" }} />
        <HeroFrame style={{ border: "1px solid var(--line-2)" }}>
          <SkeletonBlock width="100%" height="100%" radius={0} className="" style={{ background: "var(--cream-3)" }} />
        </HeroFrame>
      </div>
      {/* Recent chats section */}
      <div style={{ marginTop: "var(--space-9)", display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>
        <SkeletonBlock width={140} height={14} radius="var(--r-chip)" />
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-5)" }}>
            <SkeletonBlock width={40} height={40} radius="var(--r-pill-lg)" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <SkeletonBlock width="38%" height={12} radius="var(--r-pill)" />
              <SkeletonBlock width="68%" height={11} radius="var(--r-pill)" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Announcements — list of cards (content only; header stays real) ───────────
export function AnnouncementsListSkeleton() {
  return (
    <div className="px-5 md:px-14 pt-6 flex flex-col gap-3.5">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            border: "1px solid var(--line)",
            borderRadius: "var(--r-card)",
            background: "var(--cream)",
            padding: "var(--space-7) var(--space-8)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-5)",
          }}
        >
          <SkeletonBlock width={96} height={11} radius="var(--r-pill)" />
          <SkeletonBlock width="62%" height={20} radius="var(--r-chip)" />
          <SkeletonBlock width="100%" height={12} radius="var(--r-pill)" />
          <SkeletonBlock width="85%" height={12} radius="var(--r-pill)" />
        </div>
      ))}
    </div>
  )
}

// ── Announcements — full skeleton (header + list) for the dynamic fallback ────
export function AnnouncementsTabSkeleton() {
  return (
    <div className="pb-28 md:pb-0">
      <TabPageHeader>
        <SkeletonTitleBlock />
      </TabPageHeader>
      <AnnouncementsListSkeleton />
    </div>
  )
}

// ── Directory — member-list rows (content only; used in sidebar panel + mobile)
export function DirectoryListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-3 py-2.5">
          <SkeletonBlock width={32} height={32} radius={999} />
          <div className="flex-1" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <SkeletonBlock width="55%" height={12} radius="var(--r-pill)" />
            <SkeletonBlock width="32%" height={10} radius="var(--r-pill)" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Directory — full skeleton (header + detail placeholder) dynamic fallback ──
export function DirectoryTabSkeleton() {
  return (
    <div className="md:flex md:flex-col md:h-full md:overflow-hidden">
      <TabPageHeader>
        <SkeletonBlock width={180} height={30} radius="var(--r-chip)" />
      </TabPageHeader>
      <div className="px-5 md:px-14 pt-8" style={{ display: "flex", flexDirection: "column", gap: "var(--space-7)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-6)" }}>
          <SkeletonBlock width={64} height={64} radius={999} />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <SkeletonBlock width={200} height={24} radius="var(--r-chip)" />
            <SkeletonBlock width={120} height={12} radius="var(--r-pill)" />
          </div>
        </div>
        <SkeletonBlock width="100%" height={120} radius="var(--r-card)" />
        <SkeletonBlock width="100%" height={120} radius="var(--r-card)" />
      </div>
    </div>
  )
}

// ── Chat list — sidebar panel rows (used as ChatListPanel dynamic fallback) ───
export function ChatListSkeleton() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* search bar */}
      <div className="px-3 py-3 flex-shrink-0">
        <SkeletonBlock width="100%" height={34} radius="var(--r-input)" />
      </div>
      {/* tab strip */}
      <div className="px-3 flex-shrink-0" style={{ display: "flex", gap: "var(--space-6)", paddingBottom: "var(--space-4)" }}>
        <SkeletonBlock width={56} height={12} radius="var(--r-pill)" />
        <SkeletonBlock width={56} height={12} radius="var(--r-pill)" />
      </div>
      {/* rows */}
      <div className="flex flex-col gap-2 px-3 pt-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 py-1.5">
            <SkeletonBlock width={36} height={36} radius={999} />
            <div className="flex-1" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              <SkeletonBlock width="60%" height={11} radius="var(--r-pill)" />
              <SkeletonBlock width="80%" height={10} radius="var(--r-pill)" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
