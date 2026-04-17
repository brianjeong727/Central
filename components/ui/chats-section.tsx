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
          <div className="flex items-center gap-2">
            <div className="w-0.5 h-3 bg-[#6D28D9] rounded-full" />
            <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[#9CA3AF]">Your Chats</span>
          </div>
          {totalUnread > 0 && (
            <span className="w-5 h-5 bg-[#6D28D9] rounded-full text-[9px] font-bold text-white flex items-center justify-center">
              {totalUnread}
            </span>
          )}
        </div>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="text-[12px] text-[#6D28D9] font-medium flex items-center gap-0.5 hover:opacity-70 transition-opacity"
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
      <button onClick={onClick} className="w-full bg-white rounded-2xl border border-[#EFEFEF] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-all text-left group">
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
              <span className="w-5 h-5 bg-[#6D28D9] rounded-full text-[9px] font-bold text-white flex items-center justify-center flex-shrink-0 shadow-sm shadow-[#6D28D9]/30">
                {chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
