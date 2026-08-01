"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { getUserMinistries, setCurrentMinistry } from "@/app/actions/ministry"
import { RingCrossLogo } from "@/app/home/components/shared"
import { getInitials } from "@/app/home/utils"
import {
  InsetHairline,
  MonogramChip,
  PocketButton,
  PocketCard,
  PocketKicker,
  PocketRow,
  PocketRowCard,
  PocketTag,
  SkeletonBlock,
} from "@/components/central"

type Ministry = { id: string; name: string; university: string; role: string; last_opened_at: string | null }

// Display-only label map — a sanctioned Convention #2 nonconformer (it labels roles,
// it does not gate on them). Must cover all seven DB roles or the raw value leaks.
const ROLE_LABEL: Record<string, string> = {
  visitor: "Visitor",
  member: "Member",
  leader: "Leader",
  admin: "Admin",
  deacon: "Deacon",
  elder: "Elder",
  pastor: "Pastor",
}

const roleLabel = (role: string) => ROLE_LABEL[role] ?? role

// Device-local by design. `last_opened_at` is a USER-ACTIVITY timestamp, not event
// time — the sanctioned exception to Convention #23 (same class as chat's
// formatMessageTime). This page is cross-ministry and renders before any ministry
// context exists, so there is no `ministries.timezone` to be correct in and
// useMinistryTimezone() is not mounted outside the /home shell. Do NOT "fix" this
// by routing it through lib/tz.ts.
function lastOpenedLabel(iso: string | null): string | undefined {
  if (!iso) return undefined
  const d = new Date(iso)
  if (isNaN(d.getTime())) return undefined
  return `Last opened ${d.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`
}

// Most-recently-opened first; never-opened (NULL) LAST. The null branches are
// explicit because `new Date(null)` arithmetic yields NaN — an unstable order, not
// a last-place one. This sort lives here, not in getUserMinistries(): that action is
// shared by /ministries and the landing page, whose ordering must not change.
function byRecencyNullsLast(a: Ministry, b: Ministry): number {
  if (!a.last_opened_at && !b.last_opened_at) return 0
  if (!a.last_opened_at) return 1
  if (!b.last_opened_at) return -1
  return new Date(b.last_opened_at).getTime() - new Date(a.last_opened_at).getTime()
}

export default function PickMinistryPage() {
  const router = useRouter()
  const [ministries, setMinistries] = useState<Ministry[]>([])
  const [me, setMe] = useState<{ name: string; avatar_url: string | null } | null>(null)
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

  // The signed-in identity for the mobile footer row. Own-profile SELECT is allowed
  // by the profiles RLS policy's `OR id = auth.uid()` branch, so no ministry context
  // is needed here.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from("profiles")
        .select("name, avatar_url")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => { if (data) setMe({ name: data.name ?? "", avatar_url: data.avatar_url ?? null }) })
    })
  }, [])

  async function handleSelect(id: string) {
    if (selecting) return
    setSelecting(id)
    const { error: err } = await setCurrentMinistry(id)
    if (err) { setError(err); setSelecting(null); return }
    window.location.assign("/home")
  }

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.assign("/login")
  }

  // Mobile only: recency order decides the lead card. The desktop branch keeps
  // rendering `ministries` in the action's original order.
  const byRecency = [...ministries].sort(byRecencyNullsLast)
  const lead = byRecency[0]
  const others = byRecency.slice(1)

  return (
    <>
    {/* ── Desktop (≥768px) — unchanged; out of scope for the mobile adoption ── */}
    <div className="hidden md:flex" style={{ minHeight: "100svh", background: "var(--cream-panel)", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 24px", fontFamily: "var(--font-inter)" }}>

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
                background: selecting === m.id ? "var(--plum)" : "var(--cream-panel)",
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
                <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: 20, color: "var(--cream-on-dark)" }}>
                  {m.name[0]}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 15, fontWeight: 600, color: selecting === m.id ? "var(--cream-on-dark)" : "var(--ink)", margin: 0, marginBottom: 2 }}>
                  {selecting === m.id ? "Opening…" : m.name}
                </p>
                <p style={{ fontSize: 12, color: selecting === m.id ? "rgba(246,244,239,0.65)" : "var(--muted-text)", margin: 0 }}>
                  {m.university} · {ROLE_LABEL[m.role] ?? m.role}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Quiet exit — the logo is the only other way off this page. */}
        <button
          onClick={handleSignOut}
          style={{
            display: "block", margin: "28px auto 0", padding: "6px 10px",
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: 13, color: "var(--muted-text)", fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--plum)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-text)" }}
        >
          Sign out
        </button>
      </div>
    </div>

    {/* ── Mobile (<768px) — Pocket adoption of the cdesign "Choose Ministry" artboard.
        Shares the desktop branch's data fetch and handlers; only the render differs.
        No back affordance by design: this is a routing gate, not a push surface. ── */}
    <div className="md:hidden" style={{ minHeight: "100svh", background: "var(--cream)", fontFamily: "var(--sans)", color: "var(--ink)" }}>
      <div className="max-w-[390px] mx-auto w-full" style={{ padding: "calc(env(safe-area-inset-top) + 28px) 20px calc(env(safe-area-inset-bottom) + 36px)" }}>

        <h1 style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--ink)", margin: 0, marginTop: 28 }}>
          Choose a ministry
        </h1>

        <InsetHairline className="" style={{ marginTop: 22 }} />

        {error && (
          <div style={{ marginTop: 18, fontSize: 13, color: "var(--danger)" }}>{error}</div>
        )}

        {loading && (
          <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            <SkeletonBlock height={84} radius="var(--r-pocket)" />
            <SkeletonBlock height={148} radius="var(--r-pocket)" />
          </div>
        )}

        {!loading && lead && (
          <>
            <PocketKicker label="Last opened" style={{ marginTop: 22 }} />

            <PocketCard onClick={() => handleSelect(lead.id)}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <MonogramChip
                  initials={lead.name.charAt(0).toUpperCase()}
                  className="w-12 h-12"
                  style={{ fontFamily: "var(--serif)", fontSize: 17, fontWeight: 600 }}
                />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {lead.name}
                  </span>
                  <span style={{ display: "block", fontSize: 14, color: "var(--body)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selecting === lead.id ? "Opening…" : lead.university}
                  </span>
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <PocketTag label={roleLabel(lead.role)} />
                  <ChevronRight style={{ width: 16, height: 16, color: "var(--muted-text)" }} strokeWidth={1.7} />
                </span>
              </div>
            </PocketCard>

            {others.length > 0 && (
              <>
                <PocketKicker label="Your other ministries" style={{ marginTop: 28 }} />
                <PocketRowCard>
                  {others.map((m, i) => (
                    <PocketRow
                      key={m.id}
                      onClick={() => handleSelect(m.id)}
                      isLast={i === others.length - 1}
                      leading={
                        <MonogramChip
                          initials={m.name.charAt(0).toUpperCase()}
                          className="w-10 h-10"
                          style={{ fontFamily: "var(--serif)", fontSize: 14, fontWeight: 600 }}
                        />
                      }
                      title={m.name}
                      titleAccessory={
                        <span style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: "1px", textTransform: "uppercase", color: "var(--muted-text)", flexShrink: 0 }}>
                          {roleLabel(m.role)}
                        </span>
                      }
                      sub={selecting === m.id ? "Opening…" : m.university}
                      stamp={selecting === m.id ? undefined : lastOpenedLabel(m.last_opened_at)}
                      chevron
                    />
                  ))}
                </PocketRowCard>
              </>
            )}
          </>
        )}

        <InsetHairline className="" style={{ marginTop: 28, marginBottom: 18 }} />

        <PocketButton variant="quiet" surface="page" onClick={() => router.push("/ministries")} style={{ width: "100%" }}>
          <Plus style={{ width: 16, height: 16 }} strokeWidth={2} />
          Join another ministry
        </PocketButton>

        {/* Who am I signed in as — grounds the gate, and carries the sign-out. */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
          <MonogramChip
            initials={getInitials(me?.name ?? "")}
            avatarUrl={me?.avatar_url}
            className="w-[34px] h-[34px]"
            style={{ fontFamily: "var(--serif)", fontSize: 12, fontWeight: 600 }}
          />
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: "var(--body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {me?.name ?? ""}
          </span>
          <button
            onClick={handleSignOut}
            style={{
              flexShrink: 0, minHeight: 44, padding: "8px 0",
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "inherit", fontSize: 14, color: "var(--muted-text)",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
    </>
  )
}
