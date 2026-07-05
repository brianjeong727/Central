"use client"

// Post-join profile-completeness pickers (gender + school), shared by /join and
// /ministries so EVERY join path enforces the same flow (previously /ministries
// joins skipped both and landed on /home with an incomplete profile).
//
// Usage:
//   const pickers = usePostJoinPickers()
//   — before a join action:  if (pickers.genderGate(doJoin)) return; doJoin()
//     (if the profile lacks gender, the modal opens and runs doJoin after save)
//   — after a successful join, instead of redirecting directly:
//     const shown = await pickers.maybeShowSchoolPicker(() => window.location.assign("/home"))
//     if (shown) resetSpinners()   // modal is up; afterFn runs on save/skip
//   — render <PostJoinPickerModals pickers={pickers} /> once at the root.

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase"
import { CentralModal } from "@/components/central"

const SANS = "var(--font-inter), system-ui, sans-serif"
const SERIF = "var(--font-instrument-serif)"

const GENDERS = [
  { value: "male",   label: "Male" },
  { value: "female", label: "Female" },
] as const

// Shared modal primary button — also used by /join's staff-role modal.
export function ModalAction({ children, onClick, disabled }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      width: "100%", padding: "14px 0", borderRadius: 12, border: "none",
      background: disabled ? "var(--line-2)" : "var(--plum-2)",
      color: disabled ? "#A09A8C" : "var(--cream-panel)",
      fontSize: 15, fontWeight: 500, fontFamily: SANS,
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "background .15s ease",
    }}>{children}</button>
  )
}

type School = { id: string; name: string; abbreviation: string }

export function usePostJoinPickers() {
  // ── Gender (checked on mount; gates the join action) ─────────────────────
  const [needsGender, setNeedsGender] = useState(false)
  const [genderOpen, setGenderOpen] = useState(false)
  const [gender, setGender] = useState<string>("")
  const [savingGender, setSavingGender] = useState(false)
  const [genderError, setGenderError] = useState<string | null>(null)
  const [pendingRun, setPendingRun] = useState<(() => void) | null>(null)

  // ── School (offered after a successful join, before the redirect) ────────
  const [schoolOpen, setSchoolOpen] = useState(false)
  const [schoolOptions, setSchoolOptions] = useState<School[]>([])
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>("")
  const [savingSchool, setSavingSchool] = useState(false)
  const [schoolError, setSchoolError] = useState<string | null>(null)
  const [schoolAfter, setSchoolAfter] = useState<(() => void) | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase
        .from("profiles").select("gender").eq("id", user.id).single()
      if (profile && !profile.gender) setNeedsGender(true)
    })
  }, [])

  // If the profile lacks gender: stash the action, open the modal, return true
  // (caller aborts — the action re-runs after save). Otherwise return false.
  function genderGate(run: () => void): boolean {
    if (!needsGender) return false
    setPendingRun(() => run)
    setGenderOpen(true)
    return true
  }

  async function saveGender() {
    if (!gender) return
    setSavingGender(true)
    setGenderError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setGenderError("Not signed in."); setSavingGender(false); return }
    const { error } = await supabase.from("profiles").update({ gender }).eq("id", user.id)
    if (error) { setGenderError("Failed to save. Try again."); setSavingGender(false); return }
    setSavingGender(false)
    setNeedsGender(false)
    setGenderOpen(false)
    const run = pendingRun
    setPendingRun(null)
    run?.()
  }

  function cancelGender() {
    setGenderOpen(false)
    setPendingRun(null)
  }

  // After a successful join: if the new ministry has schools and the profile
  // lacks one, open the picker (afterFn runs on save/skip) and return true;
  // otherwise invoke afterFn immediately and return false.
  async function maybeShowSchoolPicker(afterFn: () => void): Promise<boolean> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { afterFn(); return false }
    const { data: profile } = await supabase.from("profiles").select("ministry_id, school_id").eq("id", user.id).maybeSingle()
    if (!profile?.ministry_id || profile?.school_id) { afterFn(); return false }
    const { data: schools } = await supabase.from("ministry_schools").select("id, name, abbreviation").eq("ministry_id", profile.ministry_id).order("sort_order")
    if (!schools || schools.length === 0) { afterFn(); return false }
    setSchoolOptions(schools)
    setSchoolAfter(() => afterFn)
    setSchoolOpen(true)
    return true
  }

  async function saveSchool() {
    if (!selectedSchoolId) return
    setSavingSchool(true)
    setSchoolError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSchoolError("Not signed in."); setSavingSchool(false); return }
    const schoolId = selectedSchoolId === "other" ? null : selectedSchoolId
    const { error } = await supabase.from("profiles").update({ school_id: schoolId }).eq("id", user.id)
    if (error) { setSchoolError("Failed to save. Try again."); setSavingSchool(false); return }
    setSavingSchool(false)
    setSchoolOpen(false)
    schoolAfter?.()
  }

  function skipSchool() {
    setSchoolOpen(false)
    schoolAfter?.()
  }

  return {
    genderGate, maybeShowSchoolPicker,
    // modal state (consumed by PostJoinPickerModals)
    genderOpen, gender, setGender, savingGender, genderError, saveGender, cancelGender,
    schoolOpen, schoolOptions, selectedSchoolId, setSelectedSchoolId, savingSchool, schoolError, saveSchool, skipSchool,
  }
}

export type PostJoinPickers = ReturnType<typeof usePostJoinPickers>

export function PostJoinPickerModals({ pickers }: { pickers: PostJoinPickers }) {
  return (
    <>
      {/* ── School picker modal (CentralModal shell, §4.17) ──
          Dismissing (X / click-away / Escape) = "skip": the stored redirect must
          still run, so onClose maps to skipSchool, not a plain close. */}
      {pickers.schoolOpen && (
        <CentralModal onClose={pickers.skipSchool} eyebrow="One more thing" title="Which school?" maxWidth={360}>
            <p style={{ fontSize: 13, color: "var(--body)", margin: "0 0 20px", lineHeight: 1.5 }}>
              This helps us organize groups and events by campus.
            </p>
            {pickers.schoolError && (
              <div style={{ borderRadius: 10, background: "rgba(62,21,64,0.08)", padding: "8px 12px", fontSize: 13, color: "var(--plum)", marginBottom: 14 }}>
                {pickers.schoolError}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {pickers.schoolOptions.map(s => {
                const active = pickers.selectedSchoolId === s.id
                return (
                  <button key={s.id} type="button" onClick={() => pickers.setSelectedSchoolId(s.id)} style={{
                    padding: "12px 16px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                    border: `1px solid ${active ? "var(--plum-2)" : "var(--line-2)"}`,
                    background: active ? "var(--plum-2)" : "var(--cream-panel)",
                    transition: "all .12s ease",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                  }}>
                    <span style={{ fontFamily: SERIF, fontSize: 18, color: active ? "var(--cream-panel)" : "var(--ink)" }}>
                      {s.name}
                    </span>
                    {s.abbreviation && (
                    <span style={{ fontSize: 12, color: active ? "rgba(251,248,242,0.65)" : "var(--muted-text)" }}>
                      {s.abbreviation}
                    </span>
                    )}
                  </button>
                )
              })}
              <button type="button" onClick={() => pickers.setSelectedSchoolId("other")} style={{
                padding: "12px 16px", borderRadius: 12, textAlign: "left", cursor: "pointer",
                border: `1px solid ${pickers.selectedSchoolId === "other" ? "var(--plum-2)" : "var(--line-2)"}`,
                background: pickers.selectedSchoolId === "other" ? "var(--plum-2)" : "var(--cream-panel)",
                transition: "all .12s ease",
              }}>
                <span style={{ fontFamily: SERIF, fontSize: 18, color: pickers.selectedSchoolId === "other" ? "var(--cream-panel)" : "var(--ink)" }}>
                  Other / Not a student
                </span>
              </button>
            </div>
            <ModalAction onClick={pickers.saveSchool} disabled={!pickers.selectedSchoolId || pickers.savingSchool}>
              {pickers.savingSchool ? "Saving…" : "Continue"}
            </ModalAction>
            <button type="button" onClick={pickers.skipSchool}
              style={{ width: "100%", background: "none", border: "none", color: "var(--muted-text)", fontSize: 13, marginTop: 12, cursor: "pointer", fontFamily: SANS }}>
              Skip for now
            </button>
        </CentralModal>
      )}

      {/* ── Gender picker modal (CentralModal shell, §4.17) ── */}
      {pickers.genderOpen && (
        <CentralModal onClose={pickers.cancelGender} eyebrow="One more thing" title="What&#39;s your gender?" maxWidth={360}>
            <p style={{ fontSize: 13, color: "var(--body)", margin: "0 0 20px", lineHeight: 1.5 }}>
              Helps us place you in the right small group.
            </p>
            {pickers.genderError && (
              <div style={{ borderRadius: 10, background: "rgba(62,21,64,0.08)", padding: "8px 12px", fontSize: 13, color: "var(--plum)", marginBottom: 14 }}>
                {pickers.genderError}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {GENDERS.map(({ value, label }) => {
                const active = pickers.gender === value
                return (
                  <button key={value} type="button" onClick={() => pickers.setGender(value)} style={{
                    flex: 1, padding: "10px 16px", borderRadius: 999,
                    border: `1px solid ${active ? "var(--plum)" : "var(--line-2)"}`,
                    background: active ? "var(--plum-2)" : "var(--cream-panel)",
                    color: active ? "var(--cream-panel)" : "var(--body)",
                    fontSize: 14, fontWeight: active ? 500 : 400, cursor: "pointer",
                    transition: "all .12s ease", fontFamily: SANS,
                  }}>
                    {label}
                  </button>
                )
              })}
            </div>
            <ModalAction onClick={pickers.saveGender} disabled={!pickers.gender || pickers.savingGender}>
              {pickers.savingGender ? "Saving…" : "Continue"}
            </ModalAction>
            <button type="button" onClick={pickers.cancelGender}
              style={{ width: "100%", background: "none", border: "none", color: "var(--muted-text)", fontSize: 13, marginTop: 12, cursor: "pointer", fontFamily: SANS }}>
              Cancel
            </button>
        </CentralModal>
      )}
    </>
  )
}
