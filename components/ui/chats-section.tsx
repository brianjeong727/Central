import { ChevronRight } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

export interface ChatPreview {
  id: string
  groupName: string
  lastMessage: string
  lastMessageSender: string
  unreadCount: number
  avatarColor: string
  initials: string
  time: string
}

interface ChatsSectionProps {
  chats: ChatPreview[]
  totalUnread: number
  onSeeAll?: () => void
  onOpenChat?: (id: string, name: string) => void
}

export function ChatsSection({ chats, totalUnread, onSeeAll, onOpenChat }: ChatsSectionProps) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-[0.1em]">Your Chats</h2>
          {totalUnread > 0 && (
            <span className="w-5 h-5 bg-[#F59E0B] rounded-full text-[9px] font-bold text-[#6D28D9] flex items-center justify-center">
              {totalUnread}
            </span>
          )}
        </div>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="text-[11px] text-[#F59E0B] font-semibold flex items-center gap-0.5 hover:opacity-70 transition-opacity"
          >
            See all
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {chats.map((chat) => (
          <ChatCard key={chat.id} chat={chat} onClick={onOpenChat ? () => onOpenChat(chat.id, chat.groupName) : undefined} />
        ))}
      </div>
    </section>
  )
}

function ChatCard({ chat, onClick }: { chat: ChatPreview; onClick?: () => void }) {
  return (
      <button onClick={onClick} className="w-full bg-white rounded-2xl border border-[#F59E0B]/15 p-4 shadow-[0_2px_16px_rgba(245,158,11,0.06)] hover:shadow-[0_4px_24px_rgba(245,158,11,0.12)] hover:border-[#F59E0B]/25 transition-all text-left group">
      <div className="flex items-center gap-3.5">
        <Avatar className={`w-11 h-11 ${chat.avatarColor} shadow-md shadow-[#6D28D9]/15`}>
          <AvatarFallback className="text-white font-bold text-[11px] bg-transparent tracking-wide">
            {chat.initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-foreground text-[14px] truncate pr-2 tracking-tight">{chat.groupName}</h3>
            <span className="text-[10px] text-muted-foreground/50 font-medium flex-shrink-0">{chat.time}</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-muted-foreground/70 truncate">
              <span className="font-medium text-muted-foreground">{chat.lastMessageSender}:</span>{" "}
              {chat.lastMessage}
            </p>
            {chat.unreadCount > 0 && (
              <span className="w-5 h-5 bg-[#F59E0B] rounded-full text-[9px] font-bold text-[#6D28D9] flex items-center justify-center flex-shrink-0 shadow-sm shadow-[#F59E0B]/30">
                {chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
