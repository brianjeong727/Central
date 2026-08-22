"use client"

// ─── Move-and-scale photo cropper ────────────────────────────────────────────
//
// Pick a photo → drag it under a circular window, scale it, confirm. The
// Instagram/iOS arrangement, and the point is CONTROL: before this, choosing a
// photo uploaded the whole frame and let CSS `object-fit: cover` centre-crop it,
// so anyone whose face was not dead-centre got their chin or their shoulder.
//
// It renders inside `CentralModal` rather than a hand-rolled overlay — §4.17 is
// explicit that a bespoke fixed panel is design debt, and the modal already owns
// the veil, the X, Escape, backdrop-click and Android back.
//
// The geometry is deliberately a PURE function of {scale, offset} kept in one
// place (`clampOffset` + `sourceRect` below) rather than smeared across the
// pointer handlers. Panning, wheel-zoom, pinch and the slider all funnel through
// the same clamp, so no gesture can put the image somewhere the export cannot
// reproduce — the classic "the preview and the saved photo disagree" bug.
//
// Contract: `onConfirm` receives a SQUARE JPEG blob at OUT_SIZE. Decode failures
// surface through `onError` so the caller can fall back to uploading the raw
// file, which is the same best-effort contract lib/downscale-image.ts has.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { CentralModal } from "./central-modal"
import { CentralButton } from "./button"

/** Edge of the exported square, in px. Matches downscaleToJpeg's 512 cap. */
const OUT_SIZE = 512
/** How far in you may scale, as a multiple of "just covers the window". */
const MAX_ZOOM = 4
const JPEG_QUALITY = 0.9

type Offset = { x: number; y: number }

/**
 * Keep the image covering the window. `offset` is the image's top-left corner
 * relative to the window's top-left, so both axes are <= 0 and no further
 * negative than the overhang.
 */
export function clampOffset(offset: Offset, natW: number, natH: number, scale: number, side: number): Offset {
  const w = natW * scale
  const h = natH * scale
  const minX = Math.min(0, side - w)
  const minY = Math.min(0, side - h)
  return {
    x: Math.min(0, Math.max(minX, offset.x)),
    y: Math.min(0, Math.max(minY, offset.y)),
  }
}

/** The window, expressed in SOURCE pixels — what gets drawn to the export canvas. */
export function sourceRect(offset: Offset, scale: number, side: number) {
  return { sx: -offset.x / scale, sy: -offset.y / scale, sSide: side / scale }
}

export function ImageCropper({
  file,
  title = "Move and scale",
  eyebrow = "Profile photo",
  confirmLabel = "Use photo",
  busy = false,
  onCancel,
  onConfirm,
  onError,
}: {
  file: File
  title?: string
  eyebrow?: string
  confirmLabel?: string
  /** Caller is uploading — the footer locks rather than the modal closing early. */
  busy?: boolean
  onCancel: () => void
  onConfirm: (blob: Blob) => void
  /** The browser could not decode this file (HEIC is the usual one). */
  onError: (message: string) => void
}) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  // The window's CSS side. Measured, not assumed: this modal is ~420 wide on a
  // laptop and the best part of 350 on a phone, and a fixed square would either
  // overflow the narrow case or waste the wide one.
  const [side, setSide] = useState(280)
  const [scale, setScale] = useState(1)
  const [minScale, setMinScale] = useState(1)
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)
    createImageBitmap(file)
      .then((bmp) => {
        if (cancelled) { bmp.close?.(); return }
        bitmapRef.current = bmp
        setNat({ w: bmp.width, h: bmp.height })
      })
      .catch(() => { if (!cancelled) onError("That image couldn't be opened. Try a different one.") })
    return () => {
      cancelled = true
      URL.revokeObjectURL(objectUrl)
      bitmapRef.current?.close?.()
      bitmapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // ── Fit the window to the panel ────────────────────────────────────────────
  useLayoutEffect(() => {
    const el = frameRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      if (w > 0) setSide(Math.max(200, Math.min(320, w)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [url])

  // ── Start at "just covers", centred ────────────────────────────────────────
  useEffect(() => {
    if (!nat) return
    const min = side / Math.min(nat.w, nat.h)
    setMinScale(min)
    setScale(min)
    setOffset(clampOffset(
      { x: (side - nat.w * min) / 2, y: (side - nat.h * min) / 2 },
      nat.w, nat.h, min, side,
    ))
  }, [nat, side])

  /** Zoom about a point in WINDOW coordinates, so the pixel under it stays put. */
  const zoomAbout = useCallback((next: number, px: number, py: number) => {
    if (!nat) return
    const clamped = Math.max(minScale, Math.min(minScale * MAX_ZOOM, next))
    setScale((prev) => {
      if (clamped === prev) return prev
      setOffset((o) => clampOffset(
        { x: px - ((px - o.x) / prev) * clamped, y: py - ((py - o.y) / prev) * clamped },
        nat.w, nat.h, clamped, side,
      ))
      return clamped
    })
  }, [nat, minScale, side])

  // ── Pointer: one finger pans, two pinch ────────────────────────────────────
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values())
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId)
    if (!prev || !nat) return
    const next = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, next)

    if (pointers.current.size >= 2 && pinchRef.current) {
      const [a, b] = Array.from(pointers.current.values())
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const rect = frameRef.current?.getBoundingClientRect()
      const midX = (a.x + b.x) / 2 - (rect?.left ?? 0)
      const midY = (a.y + b.y) / 2 - (rect?.top ?? 0)
      zoomAbout(pinchRef.current.scale * (dist / pinchRef.current.dist), midX, midY)
      return
    }
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    setOffset((o) => clampOffset({ x: o.x + dx, y: o.y + dy }, nat.w, nat.h, scale, side))
  }

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinchRef.current = null
  }

  // Wheel is attached natively, not via onWheel: React's synthetic wheel handler
  // is passive, so preventDefault() there is a no-op and the page scrolls behind
  // the modal while you are trying to zoom.
  useEffect(() => {
    const el = frameRef.current
    if (!el || !nat) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      zoomAbout(scale * (e.deltaY < 0 ? 1.06 : 1 / 1.06), e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener("wheel", handler, { passive: false })
    return () => el.removeEventListener("wheel", handler)
  }, [nat, scale, zoomAbout])

  // ── Export ─────────────────────────────────────────────────────────────────
  const confirm = useCallback(async () => {
    const bmp = bitmapRef.current
    if (!bmp || !nat) return
    const { sx, sy, sSide } = sourceRect(offset, scale, side)
    const canvas = document.createElement("canvas")
    canvas.width = OUT_SIZE
    canvas.height = OUT_SIZE
    const ctx = canvas.getContext("2d")
    if (!ctx) { onError("Couldn't prepare that image."); return }
    // The source rect can round a hair outside the bitmap at the extremes of a
    // clamp; drawImage treats out-of-bounds as transparent, which would show as a
    // sliver of nothing along one edge. Pull it back inside.
    const cx = Math.max(0, Math.min(sx, nat.w - 1))
    const cy = Math.max(0, Math.min(sy, nat.h - 1))
    const cSide = Math.max(1, Math.min(sSide, Math.min(nat.w - cx, nat.h - cy)))
    ctx.drawImage(bmp, cx, cy, cSide, cSide, 0, 0, OUT_SIZE, OUT_SIZE)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", JPEG_QUALITY))
    if (!blob) { onError("Couldn't prepare that image."); return }
    onConfirm(blob)
  }, [nat, offset, scale, side, onConfirm, onError])

  const ready = !!nat && !!url

  return (
    <CentralModal
      onClose={() => { if (!busy) onCancel() }}
      eyebrow={eyebrow}
      title={title}
      maxWidth={420}
      footer={
        <>
          <CentralButton variant="secondary" size="md" onClick={onCancel} disabled={busy}>Cancel</CentralButton>
          <CentralButton size="md" onClick={confirm} disabled={!ready || busy}>
            {busy ? "Saving…" : confirmLabel}
          </CentralButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
        <div
          ref={frameRef}
          // Marker, not styling: the drag surface is a bare div between a slider
          // and an image, with nothing else stable to grab it by from a test.
          data-crop-frame
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 320,
            height: side,
            overflow: "hidden",
            borderRadius: 12,
            background: "var(--ivory)",
            // The browser must not claim the gesture — this surface pans in both
            // axes and pinches, all of which the default touch behaviour eats.
            touchAction: "none",
            cursor: ready ? "grab" : "default",
            userSelect: "none",
          }}
        >
          {ready && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url!}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: offset.x, top: offset.y,
                width: nat!.w * scale, height: nat!.h * scale,
                maxWidth: "none",
                pointerEvents: "none",
              }}
            />
          )}
          {/* The circular window. A ring of veil OUTSIDE a transparent circle —
              one element, no clip-path support questions, and it cannot drift out
              of alignment with the frame because it IS the frame. */}
          <div
            aria-hidden
            style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "var(--veil-soft)",
              // Punch the circle: the mask keeps the veil only outside it.
              WebkitMaskImage: "radial-gradient(circle at 50% 50%, transparent 0 49.5%, #000 50%)",
              maskImage: "radial-gradient(circle at 50% 50%, transparent 0 49.5%, #000 50%)",
            }}
          />
          <div
            aria-hidden
            style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              borderRadius: 999,
              border: "1px solid var(--cream-on-dark)",
              opacity: 0.7,
            }}
          />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", maxWidth: 320 }}>
          <span style={{ fontSize: 12, color: "var(--muted-text)", flexShrink: 0 }}>Zoom</span>
          {/* The slider is not decoration: dragging is a pointer-only gesture, and
              this is the keyboard route to the same control. */}
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={minScale > 0 ? scale / minScale : 1}
            disabled={!ready}
            onChange={(e) => zoomAbout(minScale * parseFloat(e.target.value), side / 2, side / 2)}
            aria-label="Zoom"
            style={{ flex: 1, accentColor: "var(--plum)", cursor: ready ? "pointer" : "default" }}
          />
        </label>

        <p style={{ margin: 0, fontSize: 12.5, color: "var(--muted-text)", textAlign: "center" }}>
          Drag to reposition · scroll or pinch to zoom
        </p>
      </div>
    </CentralModal>
  )
}
