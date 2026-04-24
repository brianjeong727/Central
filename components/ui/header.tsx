import { Bell } from "lucide-react"

export function Header() {
  return (
    <header className="px-5 pt-14 pb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <svg width="26" height="26" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="#3E1540" strokeWidth="6" />
            <rect x="47" y="22" width="6" height="56" fill="#3E1540" />
            <rect x="22" y="47" width="56" height="6" fill="#3E1540" />
          </svg>
          <span style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "28px", color: "#13101A", letterSpacing: "-0.01em", lineHeight: 1 }}>
            Central
          </span>
        </div>
        <button className="size-9 bg-[#FBF8F2] rounded-xl border border-[#ECE8DE] flex items-center justify-center hover:bg-[#F2EDE0] transition-colors relative">
          <Bell className="size-4 text-[#13101A] stroke-[1.5px]" />
          <span className="absolute top-1.5 right-1.5 size-2 bg-[#C9A34B] rounded-full" />
        </button>
      </div>
    </header>
  )
}
