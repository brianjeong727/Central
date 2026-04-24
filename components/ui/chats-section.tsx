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
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "26px", color: "#13101A", fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1, margin: 0 }}>
          Your chats
          {totalUnread > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-6 h-6 bg-[#C9A34B] text-[#13101A] rounded-full text-[11px] font-bold align-middle" style={{ verticalAlign: "middle", marginBottom: 2 }}>
              {totalUnread}
            </span>
          )}
        </h3>
        {onSeeAll && (
          <button
            onClick={onSeeAll}
            className="text-[13px] text-[#5A5466] font-medium flex items-center gap-0.5 hover:text-[#3E1540] transition-colors"
          >
            See all
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {chats.map((chat, i) => (
          <ChatCard key={chat.id} chat={chat} index={i} onClick={onOpenChat ? () => onOpenChat(chat.id, chat.groupName) : undefined} />
        ))}
      </div>
    </section>
  )
}

function ChatCard({ chat, index, onClick }: { chat: ChatPreview; index: number; onClick?: () => void }) {
  const avatarBg = index % 2 === 0 ? "#3E1540" : "#13101A"
  const firstInitial = chat.groupName.charAt(0)

  return (
    <button
      onClick={onClick}
      className="w-full bg-[#FBF8F2] border border-[#ECE8DE] rounded-[18px] p-4 hover:bg-[#F5F0E8] transition-colors text-left group"
    >
      <div className="flex items-center gap-3.5">
        <Avatar className="w-12 h-12 rounded-2xl flex-shrink-0" style={{ background: avatarBg, borderRadius: "16px" }}>
          <AvatarFallback
            className="text-[#F6F4EF] bg-transparent"
            style={{ fontFamily: "var(--font-instrument-serif)", fontSize: "22px", fontWeight: 400 }}
          >
            {firstInitial}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold text-[#13101A] text-[15px] truncate pr-2 tracking-tight">{chat.groupName}</h3>
            <span className="text-[11px] text-[#8A8497] font-medium flex-shrink-0">{chat.time}</span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] text-[#5A5466] truncate">
              {chat.lastMessageSender ? (
                <>
                  <span className="font-semibold text-[#5A5466]">{chat.lastMessageSender}:</span>{" "}
                  {chat.lastMessage}
                </>
              ) : (
                chat.lastMessage || <span className="italic text-[#8A8497]">No messages yet</span>
              )}
            </p>
            {chat.unreadCount > 0 && (
              <span className="w-6 h-6 bg-[#C9A34B] rounded-full text-[11px] font-bold text-[#13101A] flex items-center justify-center flex-shrink-0">
                {chat.unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
