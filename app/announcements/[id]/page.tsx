"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ArrowLeft, Calendar, Check, Eye, Users, FileText } from "lucide-react"
import { createClient } from "@/lib/supabase"
import { formatDate, audienceLabel } from "@/app/home/utils"
import { FormFillView } from "@/app/home/tabs/forms-tab"

const SERIF = "var(--font-instrument-serif)"
const SANS = "var(--font-inter)"
const MONO: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11,
  letterSpacing: "1.4px",
  textTransform: "uppercase",
  color: "#8A8497",
}

interface RsvpAttendee { user_id: string; name: string }

interface FullAnnouncement {
  id: string
  title: string
  body: string
  created_at: string
  is_pinned: boolean
  is_event: boolean
  image_url: string | null
  audience: string | null
  show_attendees: boolean
  ministry_id: string
  view_count: number
  rsvp_count: number
  user_has_rsvped: boolean
  rsvp_attendees: RsvpAttendee[]
  has_form: boolean
  form_id: string | null
  user_has_responded: boolean
}

export default function AnnouncementDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [ann, setAnn] = useState<FullAnnouncement | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>("member")
  const [userName, setUserName] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [rsvping, setRsvping] = useState(false)
  const [formFillOpen, setFormFillOpen] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/login"); return }

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, ministry_id, role, name")
        .eq("id", user.id)
        .maybeSingle()

      if (!profile?.ministry_id) { router.replace("/join"); return }

      setUserId(user.id)
      setUserRole(profile.role ?? "member")
      setUserName(profile.name ?? "")

      const { data: annData } = await supabase
        .from("announcements")
        .select("*")
        .eq("id", id)
        .eq("ministry_id", profile.ministry_id)
        .maybeSingle()

      if (!annData) { setNotFound(true); setLoading(false); return }

      const [
        { data: viewRows },
        { data: rsvpRows },
        { data: formData },
      ] = await Promise.all([
        supabase.from("announcement_views").select("user_id").eq("announcement_id", id),
        supabase.from("rsvps").select("user_id").eq("announcement_id", id),
        supabase.from("announcement_forms").select("id").eq("announcement_id", id).maybeSingle(),
      ])

      supabase.from("announcement_views")
        .upsert({ announcement_id: id, user_id: user.id }, { onConflict: "announcement_id,user_id" })
        .then()

      const rsvpUserIds = (rsvpRows ?? []).map((r) => r.user_id)
      const userHasRsvped = rsvpUserIds.includes(user.id)

      let rsvpAttendees: RsvpAttendee[] = []
      if (rsvpUserIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, name")
          .in("id", rsvpUserIds)
          .eq("ministry_id", profile.ministry_id)
        rsvpAttendees = (profileRows ?? []).map((p) => ({ user_id: p.id, name: p.name }))
      }

      let userHasResponded = false
      if (formData?.id) {
        const { data: respRow } = await supabase
          .from("form_responses")
          .select("id")
          .eq("form_id", formData.id)
          .eq("user_id", user.id)
          .maybeSingle()
        userHasResponded = !!respRow
      }

      setAnn({
        ...annData,
        view_count: (viewRows ?? []).length,
        rsvp_count: rsvpUserIds.length,
        user_has_rsvped: userHasRsvped,
        rsvp_attendees: rsvpAttendees,
        has_form: !!formData,
        form_id: formData?.id ?? null,
        user_has_responded: userHasResponded,
      })
      setLoading(false)
    }
    load()
  }, [id, router])

  function handleBack() {
    if (window.history.length > 1) router.back()
    else router.replace("/home?tab=announcements")
  }

  async function handleRsvp() {
    if (!ann || !userId || rsvping) return
    setRsvping(true)
    const supabase = createClient()
    if (ann.user_has_rsvped) {
      await supabase.from("rsvps").delete().eq("announcement_id", ann.id).eq("user_id", userId)
      setAnn((prev) => prev ? {
        ...prev,
        user_has_rsvped: false,
        rsvp_count: Math.max(0, prev.rsvp_count - 1),
        rsvp_attendees: prev.rsvp_attendees.filter((a) => a.user_id !== userId),
      } : prev)
    } else {
      await supabase.from("rsvps").upsert({ announcement_id: ann.id, user_id: userId }, { onConflict: "announcement_id,user_id" })
      setAnn((prev) => prev ? {
        ...prev,
        user_has_rsvped: true,
        rsvp_count: prev.rsvp_count + 1,
        rsvp_attendees: [...prev.rsvp_attendees, { user_id: userId, name: userName }],
      } : prev)
    }
    setRsvping(false)
  }

  const isLeaderOrAdmin = ["leader", "admin", "deacon", "elder", "pastor"].includes(userRole.toLowerCase())
  const showAttendees = ann?.is_event && ann.rsvp_attendees.length > 0 && (isLeaderOrAdmin || ann.show_attendees)

  if (loading) {
    return (
      <div style={{ minHeight: "100svh", background: "#FBF8F2", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #E8E2D2", borderTopColor: "#3E1540", animation: "spin 0.7s linear infinite" }} />
      </div>
    )
  }

  if (notFound || !ann) {
    return (
      <div style={{ minHeight: "100svh", background: "#FBF8F2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, fontFamily: SANS }}>
        <p style={{ fontSize: 15, color: "#13101A", fontWeight: 500 }}>Announcement not found.</p>
        <button onClick={handleBack} style={{ fontSize: 13, color: "#5A5466", background: "none", border: "none", cursor: "pointer", padding: 0 }}>← Go back</button>
      </div>
    )
  }

  return (
    <>
      <div style={{ minHeight: "100svh", background: "#FBF8F2", fontFamily: SANS }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>

          {/* Header */}
          <div style={{
            position: "sticky", top: 0, zIndex: 10, background: "#FBF8F2",
            borderBottom: "1px solid #E8E2D2",
            padding: "env(safe-area-inset-top, 48px) 20px 14px",
            paddingTop: "max(env(safe-area-inset-top), 48px)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <button
              onClick={handleBack}
              style={{
                width: 34, height: 34, borderRadius: 9,
                border: "1px solid #E2DDCF", background: "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
              }}
            >
              <ArrowLeft style={{ width: 15, height: 15, color: "#3E1540" }} />
            </button>
            <span style={MONO}>Announcement</span>
          </div>

          {/* Image header */}
          {ann.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ann.image_url}
              alt={ann.title}
              style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }}
            />
          )}

          {/* Content */}
          <div style={{ padding: "28px 24px 80px" }}>

            {/* Eyebrow row — date + audience */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, ...MONO }}>
                <Calendar style={{ width: 11, height: 11 }} />
                <span>{formatDate(ann.created_at)}</span>
              </div>
              {ann.audience && ann.audience !== "all" && (
                <span style={{ ...MONO, background: "#F1ECDE", border: "1px solid #E2DDCF", padding: "2px 8px", borderRadius: 999 }}>
                  {audienceLabel(ann.audience)}
                </span>
              )}
              {ann.is_pinned && (
                <span style={{ ...MONO, color: "#3E1540" }}>📌 Pinned</span>
              )}
            </div>

            {/* Title */}
            <h1 style={{
              fontFamily: SERIF, fontWeight: 400,
              fontSize: "clamp(30px, 5vw, 40px)",
              lineHeight: 1.08, letterSpacing: "-0.02em",
              color: "#13101A", margin: "0 0 20px",
            }}>
              {ann.title}
            </h1>

            {/* Body — reading-room serif */}
            <p style={{
              fontFamily: SERIF, fontSize: 17, fontWeight: 400,
              lineHeight: 1.7, color: "#2D2836",
              whiteSpace: "pre-wrap", margin: "0 0 28px",
            }}>
              {ann.body}
            </p>

            {/* Stats row */}
            <div style={{ display: "flex", alignItems: "center", gap: 18, paddingBottom: 24, borderBottom: "1px solid #E8E2D2", marginBottom: 24 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#8A8497" }}>
                <Eye style={{ width: 12, height: 12 }} />{ann.view_count} views
              </span>
              {ann.is_event && (
                <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#8A8497" }}>
                  <Users style={{ width: 12, height: 12 }} />{ann.rsvp_count} going
                </span>
              )}
            </div>

            {/* RSVP */}
            {ann.is_event && (
              <div style={{ marginBottom: 24 }}>
                <button
                  onClick={handleRsvp}
                  disabled={rsvping}
                  style={{
                    width: "100%", padding: "14px 22px", borderRadius: 12,
                    border: "none", cursor: rsvping ? "not-allowed" : "pointer",
                    fontFamily: SANS, fontSize: 15, fontWeight: 500,
                    background: ann.user_has_rsvped ? "#F1ECDE" : "#2D0F2E",
                    color: ann.user_has_rsvped ? "#3E1540" : "#FBF8F2",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    transition: "background 150ms, opacity 150ms",
                    opacity: rsvping ? 0.7 : 1,
                  }}
                >
                  {ann.user_has_rsvped
                    ? <><Check style={{ width: 15, height: 15 }} />You&apos;re going — tap to undo</>
                    : "RSVP"}
                </button>
              </div>
            )}

            {/* Attendee chips */}
            {showAttendees && (
              <div style={{ marginBottom: 24 }}>
                <p style={{ ...MONO, marginBottom: 10 }}>Going · {ann.rsvp_count}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {ann.rsvp_attendees.map((a) => (
                    <span key={a.user_id} style={{
                      fontSize: 12, color: "#5A5466",
                      background: "#F1ECDE", border: "1px solid #E2DDCF",
                      padding: "4px 10px", borderRadius: 999,
                    }}>
                      {a.name.split(" ")[0]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Form */}
            {ann.has_form && (
              <div style={{ marginBottom: 24 }}>
                {ann.user_has_responded ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#5B7A6C", fontWeight: 500 }}>
                    <FileText style={{ width: 13, height: 13 }} />Form submitted
                  </span>
                ) : (
                  <button
                    onClick={() => setFormFillOpen(true)}
                    style={{
                      padding: "11px 20px", borderRadius: 10,
                      border: "1px solid #3E1540", background: "transparent",
                      color: "#3E1540", fontFamily: SANS, fontSize: 13, fontWeight: 500,
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                    }}
                  >
                    <FileText style={{ width: 13, height: 13 }} />Fill out form →
                  </button>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Form fill overlay */}
      {formFillOpen && ann.form_id && userId && (
        <FormFillView
          formId={ann.form_id}
          announcementId={ann.id}
          announcementTitle={ann.title}
          userId={userId}
          ministryId={ann.ministry_id}
          onClose={() => setFormFillOpen(false)}
          onSubmitted={() => {
            setAnn((prev) => prev ? { ...prev, user_has_responded: true } : prev)
            setFormFillOpen(false)
          }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
