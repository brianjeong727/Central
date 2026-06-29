"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { getUserMinistries, setCurrentMinistry } from "@/app/actions/ministry"
import { RingCrossLogo } from "@/app/home/components/shared"

type Ministry = { id: string; name: string; university: string; role: string }

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  leader: "Leader",
  member: "Member",
}

export default function PickMinistryPage() {
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getUserMinistries().then(({ data, error: err }) => {
      if (err) setError(err)
      else setMinistries(data ?? [])
      setLoading(false)
    })
  }, [])

  async function handleSelect(id: string) {
    setSelecting(id)
    const { error: err } = await setCurrentMinistry(id)
    if (err) { setError(err); setSelecting(null); return }
    window.location.assign("/home")
  }

  return (
    <div style={{ minHeight: "100svh", background: "#FBF8F2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", fontFamily: "var(--font-inter)" }}>

      {/* Logo */}
      <Link href="/" aria-label="Central — home" className="transition-opacity hover:opacity-70" style={{ display: "inline-flex", alignItems: "center", gap: 9, marginBottom: 8, textDecoration: "none", color: "inherit" }}>
        <RingCrossLogo size={28} />
        <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 30, color: "var(--ink)", letterSpacing: "-0.01em", lineHeight: 1 }}>
          Central
        </span>
      </Link>
      <p style={{ fontSize: 13, color: "var(--muted-text)", marginBottom: 40 }}>College ministry community</p>

      <div style={{ width: "100%", maxWidth: 420 }}>
        <h2 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 26, color: "var(--ink)", fontWeight: 400, marginBottom: 6 }}>
          Choose a ministry
        </h2>
        <p style={{ fontSize: 13, color: "var(--muted-text)", marginBottom: 24 }}>
          You belong to multiple ministries. Which one do you want to open?
        </p>

        {error && (
          <div style={{ background: "rgba(62,21,64,0.08)", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "var(--plum)", fontWeight: 500, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", color: "var(--muted-text)", fontSize: 14, padding: "32px 0" }}>Loading…</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ministries.map((m) => (
            <button
              key={m.id}
              onClick={() => handleSelect(m.id)}
              disabled={!!selecting}
              style={{
                display: "flex", alignItems: "center", gap: 16,
                padding: 16, borderRadius: 16, border: "1px solid var(--line)",
                background: selecting === m.id ? "var(--plum)" : "white",
                cursor: selecting ? "default" : "pointer",
                opacity: selecting && selecting !== m.id ? 0.5 : 1,
                textAlign: "left", width: "100%",
                transition: "background 0.15s, opacity 0.15s",
              }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: selecting === m.id ? "rgba(246,244,239,0.15)" : "var(--plum)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "#F6F4EF" }}>
                  {m.name[0]}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: selecting === m.id ? "#F6F4EF" : "var(--ink)", margin: 0, marginBottom: 2 }}>
                  {selecting === m.id ? "Opening…" : m.name}
                </p>
                <p style={{ fontSize: 12, color: selecting === m.id ? "rgba(246,244,239,0.65)" : "var(--muted-text)", margin: 0 }}>
                  {m.university} · {ROLE_LABEL[m.role] ?? m.role}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
