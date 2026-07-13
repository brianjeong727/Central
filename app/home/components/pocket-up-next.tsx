"use client"

import { useRef, useState, useCallback, type ReactNode } from "react"

export interface PocketCard {
  key: string
  node: ReactNode
}

// Mobile "Pocket" up-next carousel: a horizontal scroll-snap strip of ~82%-wide
// cards (the next card peeks) with a position-dot row below. Purely presentational
// — the caller builds each card node (plum FeaturedHeroCard lead + cream event
// cards) so all RSVP/detail wiring stays where the data lives. §4.1b: a constant
// "Featured" eyebrow sits ABOVE this (rendered by the caller); the dots sit below.
export function PocketUpNext({ cards }: { cards: PocketCard[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const raf = useRef<number | null>(null)

  const onScroll = useCallback(() => {
    if (raf.current != null) return
    raf.current = requestAnimationFrame(() => {
      raf.current = null
      const el = scrollRef.current
      if (!el) return
      const first = el.firstElementChild as HTMLElement | null
      const step = first ? first.offsetWidth + 12 : el.clientWidth
      setActive(Math.round(el.scrollLeft / step))
    })
  }, [])

  const goTo = (i: number) => {
    const el = scrollRef.current
    if (!el) return
    const first = el.firstElementChild as HTMLElement | null
    const step = first ? first.offsetWidth + 12 : el.clientWidth
    el.scrollTo({ left: i * step, behavior: "smooth" })
  }

  const multi = cards.length > 1

  return (
    <div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="pocket-hscroll"
        style={{ gap: 12 }}
      >
        {cards.map((c) => (
          <div key={c.key} style={{ width: multi ? "82%" : "100%" }}>
            {c.node}
          </div>
        ))}
      </div>

      {multi && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginTop: "var(--space-6)" }}>
          {cards.map((c, i) => (
            <button
              key={c.key}
              type="button"
              aria-label={`Go to card ${i + 1}`}
              onClick={() => goTo(i)}
              style={{
                width: i === active ? 22 : 7,
                height: 7,
                borderRadius: 999,
                background: i === active ? "var(--plum-2)" : "var(--dashed)",
                border: "none",
                padding: 0,
                cursor: "pointer",
                transition: "width 200ms var(--ease-out)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
