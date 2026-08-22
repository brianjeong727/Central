"use client"

// Client half of the /j/<CODE> invite landing. The server component (page.tsx) has
// already resolved the code to a real, active ministry and decided which state applies;
// this file renders that state and owns the one explicit tap that performs the join.
//
// Nothing here joins on mount — see the header comment in page.tsx for why that is a
// security property and not a preference.

import { useState } from "react"
import Link from "next/link"
import { SplitShell } from "@/app/(auth)/shared"
import { CentralButton } from "@/components/central"
import { EYEBROW_STYLE } from "@/components/central/typography"
import { joinMinistryByCode } from "@/app/actions/ministry"
import { requestToJoinMinistry } from "@/app/actions/join-requests"
import { usePostJoinPickers, PostJoinPickerModals } from "@/app/ministries/post-join-pickers"

const SERIF = "var(--font-instrument-serif)"

// Font size is set by CLASS, not inline, so the responsive step actually applies —
// an inline fontSize would beat the breakpoint. 44 is the sanctioned display tier the
// sibling auth pages use; 30 matches `pocketH1` at phone width. The 36px tier the
// first draft used is retired by the design contract.
const H1_CLS = "text-[30px] md:text-[44px]"
const H1: React.CSSProperties = {
  fontFamily: SERIF,
  fontWeight: 600,
  letterSpacing: "-0.025em",
  lineHeight: 1.06,
  color: "var(--ink)",
  margin: "12px 0 0",
}

const SUB: React.CSSProperties = {
  fontSize: 15.5,
  lineHeight: 1.6,
  color: "var(--body)",
  margin: "14px 0 0",
}

const CARD_W = 420

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <SplitShell>
      <div style={{ width: "100%", maxWidth: CARD_W }}>{children}</div>
    </SplitShell>
  )
}

/**
 * Unknown code, staff code, and a ministry that is not active all land here with the
 * SAME copy. Distinguishing them would turn this page into an oracle for whether a
 * given string is a real staff code.
 */
export function InviteInvalid() {
  return (
    <Frame>
      <span style={EYEBROW_STYLE}>Invitation</span>
      <h1 className={H1_CLS} style={H1}>This invite link isn&apos;t valid.</h1>
      <p style={SUB}>
        It may have expired, or the link may have been copied incompletely. Ask whoever shared
        it for a fresh one — or join with an invite code instead.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
        <Link href="/ministries?tab=code" style={{ textDecoration: "none" }}>
          <CentralButton variant="primary" style={{ width: "100%" }}>
            Enter an invite code
          </CentralButton>
        </Link>
        <Link href="/ministries" style={{ textDecoration: "none" }}>
          <CentralButton variant="secondary" style={{ width: "100%" }}>
            Browse ministries
          </CentralButton>
        </Link>
      </div>
    </Frame>
  )
}

type State = "signed-out" | "signed-in" | "switching"

export function InviteLanding({
  code,
  ministryName,
  state,
  currentMinistryName,
  isCustomCode = false,
}: {
  code: string
  ministryName: string
  state: State
  currentMinistryName?: string | null
  /** A CUSTOM code is memorable, therefore guessable, therefore not a key — entering
   *  it opens a request an admin approves rather than granting membership outright
   *  (lib/invite-code.ts). The whole page changes verb: ask, not join. */
  isCustomCode?: boolean
}) {
  const pickers = usePostJoinPickers()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requested, setRequested] = useState(false)

  // The request path. Deliberately NOT routed through doJoin: joinMinistryByCode
  // refuses a custom code outright (it would be granting membership on a guessable
  // secret), so there is no shared branch to take.
  async function doRequest() {
    setJoining(true)
    setError(null)
    try {
      const { state: reqState, error: reqErr } = await requestToJoinMinistry(code)
      if (reqErr) { setError(reqErr); setJoining(false); return }
      // "requested" and "already-pending" land on the same screen on purpose — a
      // second tap must not read as a failure, and the person genuinely is waiting
      // either way.
      if (reqState) setRequested(true)
      setJoining(false)
    } catch {
      setError("Something went wrong. Please try again.")
      setJoining(false)
    }
  }

  // The one write on this page, and it only ever runs from an explicit tap.
  // Mirrors doCodeJoin() in app/ministries/page.tsx so every join path enforces the
  // same profile-completeness flow.
  async function doJoin() {
    setJoining(true)
    setError(null)
    try {
      // ONE argument, always. Passing a role here is what would turn a link into a
      // privilege grant; a staff code cannot reach this call in the first place.
      const { error: joinErr, isStaffCode } = await joinMinistryByCode(code)
      if (isStaffCode || joinErr) {
        setError(joinErr ?? "This invite link isn't valid.")
        setJoining(false)
        return
      }
      const shown = await pickers.maybeShowSchoolPicker(() => window.location.assign("/home"))
      if (shown) setJoining(false)
    } catch {
      setError("Something went wrong. Please try again.")
      setJoining(false)
    }
  }

  function onJoinTap() {
    if (pickers.genderGate(doJoin)) return
    doJoin()
  }

  const signedOut = state === "signed-out"
  const switching = state === "switching"

  // Waiting. The one screen with no action on it — which is the point: there is
  // nothing they can do to speed it up, so offering a button would be a lie.
  if (requested) {
    return (
      <Frame>
        <span style={EYEBROW_STYLE}>Request sent</span>
        <h1 className={H1_CLS} style={H1}>You&apos;ve asked to join {ministryName}.</h1>
        <p style={SUB}>
          An admin will let you in. You don&apos;t need to do anything else — check back
          here, or just open Central again later.
        </p>
        <div style={{ marginTop: 28 }}>
          <Link href="/ministries" style={{ textDecoration: "none" }}>
            <CentralButton variant="secondary" style={{ width: "100%" }}>Browse other churches</CentralButton>
          </Link>
        </div>
      </Frame>
    )
  }

  return (
    <Frame>
      <span style={EYEBROW_STYLE}>{switching ? "Switch church" : "You're invited"}</span>

      <h1 className={H1_CLS} style={H1}>
        {switching ? <>Join {ministryName}?</> : <>You&apos;ve been invited to join {ministryName}.</>}
      </h1>

      <p style={SUB}>
        {signedOut && isCustomCode ? (
          <>Create your account and you can ask to join {ministryName} — an admin lets you in.</>
        ) : signedOut ? (
          <>Create your account and you&apos;ll land inside {ministryName} — no code to type.</>
        ) : isCustomCode ? (
          <>Ask to join and an admin will let you in. You&apos;ll get access as soon as they do.</>
        ) : switching ? (
          <>
            You&apos;re currently in {currentMinistryName}. Joining {ministryName} makes it your
            active church — you can switch back later.
          </>
        ) : (
          <>Join to see announcements, chats and everything your ministry is planning.</>
        )}
      </p>

      {error && (
        <p style={{ ...SUB, color: "var(--danger)", marginTop: 18 }} role="alert">
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
        {signedOut ? (
          <>
            {/* The code rides through auth purely so the callback knows to send them
                back to /j/<CODE>, where the join actually happens. */}
            <Link href={`/signup?intent=join&invite=${code}`} style={{ textDecoration: "none" }}>
              <CentralButton variant="primary" style={{ width: "100%" }}>
                Create your account
              </CentralButton>
            </Link>
            <Link href={`/login?intent=join&invite=${code}`} style={{ textDecoration: "none" }}>
              <CentralButton variant="secondary" style={{ width: "100%" }}>
                I already have an account
              </CentralButton>
            </Link>
          </>
        ) : (
          <>
            <CentralButton
              variant="primary"
              onClick={isCustomCode ? doRequest : onJoinTap}
              disabled={joining}
              style={{ width: "100%" }}
            >
              {joining
                ? (isCustomCode ? "Sending…" : "Joining…")
                : isCustomCode ? `Ask to join ${ministryName}`
                : switching ? `Switch to ${ministryName}`
                : `Join ${ministryName}`}
            </CentralButton>
            <Link href="/home" style={{ textDecoration: "none" }}>
              <CentralButton variant="secondary" style={{ width: "100%" }} disabled={joining}>
                {switching ? `Stay in ${currentMinistryName}` : "Not now"}
              </CentralButton>
            </Link>
          </>
        )}
      </div>

      <PostJoinPickerModals pickers={pickers} />
    </Frame>
  )
}
