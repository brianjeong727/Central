import { Bell } from "lucide-react"

interface HeaderProps {
  userName: string
  role: string
}

export function Header({ userName, role }: HeaderProps) {
  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  return (
    <header className="px-5 pt-14 pb-2">
      {/* Minimal Logo Bar */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#6D28D9] flex items-center justify-center shadow-lg shadow-[#6D28D9]/20">
            <span className="text-white font-bold text-base">C</span>
          </div>
          <span className="text-[#6D28D9] font-semibold text-lg tracking-tight">CENTRAL</span>
        </div>
        <button className="w-10 h-10 rounded-full bg-[#6D28D9]/8 flex items-center justify-center hover:bg-[#6D28D9]/12 transition-colors relative">
          <Bell className="w-[18px] h-[18px] text-[#6D28D9] stroke-[1.5px]" />
          <span className="absolute -top-0.5 -right-0.5 w-[18px] h-[18px] bg-[#6D28D9] rounded-full text-[9px] font-bold text-white flex items-center justify-center shadow-sm">
            3
          </span>
        </button>
      </div>

      {/* Greeting */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-[13px] text-muted-foreground/70 font-medium tracking-wide mb-1">
            {getGreeting()}
          </p>
          <h1 className="text-[28px] font-bold text-foreground tracking-tight leading-tight">
            {userName}
          </h1>
        </div>
        <span className="mt-2 px-2.5 py-1 bg-[#6D28D9]/8 text-[#6D28D9] text-[10px] font-semibold rounded-full tracking-wide uppercase">
          {role}
        </span>
      </div>
    </header>
  )
}
