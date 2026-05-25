"use client"

import { Eye, EyeOff } from "lucide-react"

export const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
    <path d="M43.6 20.5H42V20.4H24v7.2h11.3C33.9 31.6 29.4 34.4 24 34.4c-5.7 0-10.4-4.7-10.4-10.4S18.3 13.6 24 13.6c2.7 0 5.2 1 7.1 2.7l5.1-5.1C33.1 8.5 28.8 6.8 24 6.8 13.8 6.8 5.6 15 5.6 25.2S13.8 43.6 24 43.6c10.2 0 18.4-8.2 18.4-18.4 0-1.2-.1-2.4-.3-3.7z" fill="#FFC107"/>
    <path d="M7.3 15.5l5.9 4.3C14.8 16.5 19.1 13.6 24 13.6c2.7 0 5.2 1 7.1 2.7l5.1-5.1C33.1 8.5 28.8 6.8 24 6.8c-7.2 0-13.4 4.1-16.7 10.2z" fill="#FF3D00"/>
    <path d="M24 43.6c4.7 0 9-1.7 12.2-4.5l-5.6-4.7c-1.8 1.3-4.1 2-6.6 2-5.3 0-9.8-3.6-11.4-8.5l-5.9 4.6C8.4 39.3 15.7 43.6 24 43.6z" fill="#4CAF50"/>
    <path d="M43.6 20.5H42V20.4H24v7.2h11.3c-.7 2-2.1 3.7-3.8 4.9l5.6 4.7c-.4.4 6.7-4.9 6.7-13.6 0-1.2-.1-2.4-.3-3.7z" fill="#1976D2"/>
  </svg>
)

export function PasswordToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? "Hide password" : "Show password"}
      style={{
        position: "absolute",
        right: 12,
        top: "50%",
        transform: "translateY(-50%)",
        background: "none",
        border: "none",
        padding: 4,
        cursor: "pointer",
        color: "#8A8497",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {show ? <EyeOff size={16} /> : <Eye size={16} />}
    </button>
  )
}
