import { Avatar, AvatarFallback } from "central"

export function MinistryMemberFallback() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 24, background: "#FBF8F2", flexWrap: "wrap" }}>
      <Avatar>
        <AvatarFallback style={{ background: "#3E1540", color: "#F6F4EF", fontFamily: "serif", fontSize: 18 }}>BJ</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback style={{ background: "#13101A", color: "#F6F4EF", fontFamily: "serif", fontSize: 18 }}>SK</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback style={{ background: "#3E1540", color: "#F6F4EF", fontFamily: "serif", fontSize: 18 }}>TL</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback style={{ background: "#9D7B4F", color: "#F6F4EF", fontFamily: "serif", fontSize: 18 }}>JK</AvatarFallback>
      </Avatar>
    </div>
  )
}
