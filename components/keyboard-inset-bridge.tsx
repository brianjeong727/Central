"use client"

import { useEffect } from "react"
import { startKeyboardInset } from "@/lib/keyboard-inset"

// Mounted once in the ROOT layout so `--kb-inset` / `[data-kb-open]` are live on
// EVERY route — the chat overlay is the surface that motivated it, but auth
// forms, search fields and modals sit on the same keyboard. Renders nothing.
export default function KeyboardInsetBridge() {
  useEffect(() => { startKeyboardInset() }, [])
  return null
}
