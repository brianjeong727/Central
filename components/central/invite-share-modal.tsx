"use client"

// ─── Invite share sheet — the link, a QR of it, and copy ─────────────────────
//
// One shared surface for every place a ministry's MEMBER invite code is offered
// (Church Settings, and the per-ministry row on /ministries). It renders the code as a
// scannable link so a student never types anything.
//
// ONLY EVER THE MEMBER CODE. The staff code grants pastor/deacon/elder, and a link is
// exactly the wrong container for it — it would land in a URL, a Referer header, and a
// server log. This component takes an `inviteCode` and has no staff variant on purpose;
// do not add one.
//
// WHY THE SVG IS HAND-BUILT from `QRCode.create` rather than `QRCode.toString`: the
// library's SVG writer bakes literal hex colours into the markup, and Central's colours
// come from tokens. Rendering the module matrix ourselves lets the modules be
// `var(--ink)` on a transparent ground, so the QR inherits the theme like everything
// else and adds no hardcoded hex.
//
// QR SIZING NOTE: `https://<host>/j/<10-char code>` is 40 bytes, which sits inside a
// version-3 (29×29) symbol at error-correction level M — the same symbol the old 6-char
// code produced, so scan distance is unchanged. Version 3 tops out at 42 bytes, so do
// NOT append tracking or campaign params to this URL; it would tip the symbol a version
// larger and shrink the modules for no benefit.

import { useEffect, useMemo, useState } from "react"
import QRCode from "qrcode"
import { Check, Copy } from "lucide-react"
import { CentralModal } from "./central-modal"
import { CentralButton } from "./button"
import { EYEBROW_STYLE } from "./typography"
import { inviteLinkFor } from "@/lib/invite-code"

/** One `<rect>` per dark module, emitted as a single path-free SVG at 1 unit per module. */
function QrSvg({ text, size = 176 }: { text: string; size?: number }) {
  const matrix = useMemo(() => {
    try {
      const qr = QRCode.create(text, { errorCorrectionLevel: "M" })
      const n = qr.modules.size
      const data = qr.modules.data
      const rects: string[] = []
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if (data[y * n + x]) rects.push(`${x},${y}`)
        }
      }
      return { n, rects }
    } catch {
      return null
    }
  }, [text])

  if (!matrix) return null

  return (
    <svg
      viewBox={`0 0 ${matrix.n} ${matrix.n}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code for ${text}`}
    >
      {matrix.rects.map((r) => {
        const [x, y] = r.split(",")
        return <rect key={r} x={x} y={y} width={1} height={1} fill="var(--ink)" />
      })}
    </svg>
  )
}

export function InviteShareModal({
  onClose,
  inviteCode,
  ministryName,
  isCustomCode,
}: {
  onClose: () => void
  inviteCode: string
  ministryName?: string | null
  /** A custom code opens a REQUEST an admin approves; a generated one grants
   *  membership outright. The sheet must not promise the wrong one — "joins straight
   *  away" on a request code is a lie the sharer only finds out about from the person
   *  they invited.
   *
   *  REQUIRED, deliberately. It shipped optional-with-a-false-default for about an
   *  hour, and in that hour both existing call sites silently kept promising instant
   *  join on a request code. A default is exactly what let the wrong answer be the
   *  quiet one; making it required moves the failure to the compiler. */
  isCustomCode: boolean
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null)
  const [shared, setShared] = useState(false)
  const link = inviteLinkFor(inviteCode)

  // The system share sheet — iMessage, WhatsApp, Messenger, AirDrop, all of it, for
  // free. Deliberately the WEB API rather than @capacitor/share: a Capacitor plugin
  // needs a new binary and would reach nobody who has already installed the app,
  // whereas navigator.share ships with a web deploy and works in the WKWebView today.
  // Undefined on desktop Chrome/Firefox, so the button only renders where it exists
  // and Copy remains the answer everywhere else.
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function"

  async function shareNative() {
    try {
      await navigator.share({
        title: ministryName ? `Join ${ministryName} on Central` : "Join us on Central",
        text: ministryName
          ? `Join ${ministryName} on Central — use code ${inviteCode}`
          : `Join us on Central — use code ${inviteCode}`,
        url: link,
      })
      setShared(true)
    } catch {
      // An AbortError is the user dismissing the sheet, which is not a failure and
      // must not surface as one.
    }
  }

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(null), 1800)
    return () => clearTimeout(t)
  }, [copied])

  async function copy(what: "link" | "code") {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : inviteCode)
      setCopied(what)
    } catch {
      /* clipboard unavailable — the value is on screen to read */
    }
  }

  return (
    <CentralModal onClose={onClose} eyebrow="Invite" title="Share Central">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--body)", margin: "0 0 20px", maxWidth: 380 }}>
          {isCustomCode ? (
            <>Anyone who scans this or opens the link can ask to join {ministryName ?? "your ministry"} — an admin lets them in.</>
          ) : (
            <>Anyone who scans this or opens the link joins {ministryName ?? "your ministry"} straight
            away — they never have to type a code.</>
          )}
        </p>

        {/* THE CODE, FIRST AND BIG. Someone standing at large group needs to read it
            aloud without tapping anything, and a code you have to hunt for is a code
            nobody shares. The link and QR are for the people who can see the screen. */}
        <button
          onClick={() => copy("code")}
          aria-label="Copy invite code"
          style={{
            width: "100%", padding: "16px 18px", borderRadius: 14,
            background: "var(--ivory)", border: "1px solid var(--line-2)",
            cursor: "pointer", marginBottom: 20,
          }}
        >
          <span style={{ ...EYEBROW_STYLE, display: "block", marginBottom: 6 }}>
            {copied === "code" ? "Copied" : "Join code"}
          </span>
          <span style={{
            display: "block", fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: 26, letterSpacing: 3, fontWeight: 500, color: "var(--ink)",
            overflowWrap: "anywhere",
          }}>
            {inviteCode}
          </span>
        </button>

        <div
          style={{
            padding: 14,
            borderRadius: 14,
            background: "var(--cream)",
            border: "1px solid var(--line-2)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <QrSvg text={link} />
        </div>

        <div style={{ width: "100%", marginTop: 22 }}>
          <span style={{ ...EYEBROW_STYLE, display: "block", marginBottom: 8, textAlign: "left" }}>
            Invite link
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 10,
              background: "var(--ivory)",
              border: "1px solid var(--line-2)",
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 0,
                textAlign: "left",
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 13,
                color: "var(--ink)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {link}
            </span>
            <button
              onClick={() => copy("link")}
              aria-label="Copy invite link"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--line-2)",
                background: "transparent",
                color: "var(--body)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {copied === "link" ? <Check size={14} /> : <Copy size={14} />}
              {copied === "link" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {canShare && (
          <CentralButton variant="primary" onClick={shareNative} style={{ marginTop: 20, width: "100%" }}>
            {shared ? "Shared" : "Share…"}
          </CentralButton>
        )}

        <CentralButton
          variant="secondary"
          onClick={onClose}
          style={{ marginTop: canShare ? 10 : 22, width: "100%" }}
        >
          Done
        </CentralButton>
      </div>
    </CentralModal>
  )
}
