import { Calendar, ChevronRight } from "lucide-react"

interface AnnouncementCardProps {
  title: string
  preview: string
  date: string
}

export function AnnouncementCard({ title, preview, date }: AnnouncementCardProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-[0.1em]">Latest Announcement</h2>
        <button className="text-[11px] text-[#6D28D9] font-semibold flex items-center gap-0.5 hover:opacity-70 transition-opacity">
          View all
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      
      <div className="bg-white rounded-2xl border border-[#6D28D9]/8 p-5 shadow-[0_4px_24px_rgba(109,40,217,0.08)]">
        <div className="flex items-center gap-2 text-muted-foreground/60 text-[11px] font-medium mb-3">
          <Calendar className="w-3.5 h-3.5" />
          <span>{date}</span>
        </div>
        
        <h3 className="text-[17px] font-bold text-foreground tracking-tight mb-2">{title}</h3>
        
        <p className="text-[13px] text-muted-foreground leading-relaxed mb-5 line-clamp-2">
          {preview}
        </p>
        
        <div className="flex items-center gap-3">
          <button className="flex-1 bg-[#F59E0B] hover:bg-[#E18D07] text-[#1A1A2E] font-bold py-3 px-4 rounded-xl transition-colors text-[13px] tracking-wide shadow-lg shadow-[#F59E0B]/20">
            RSVP Now
          </button>
          <button className="py-3 px-4 rounded-xl border border-[#6D28D9]/12 text-[#6D28D9] font-semibold hover:bg-[#6D28D9]/4 transition-colors text-[13px]">
            Details
          </button>
        </div>
      </div>
    </section>
  )
}
