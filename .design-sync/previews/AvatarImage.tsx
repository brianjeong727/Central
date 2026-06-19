import { Avatar, AvatarImage, AvatarFallback } from "central"

export function WithValidImage() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 24, background: "#FBF8F2" }}>
      <Avatar>
        <AvatarImage src="https://avatars.githubusercontent.com/u/1?v=4" alt="Member" />
        <AvatarFallback style={{ background: "#3E1540", color: "#F6F4EF" }}>M</AvatarFallback>
      </Avatar>
    </div>
  )
}

export function FallbackOnBrokenImage() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 24, background: "#FBF8F2" }}>
      <Avatar>
        <AvatarImage src="/broken.jpg" alt="Member" />
        <AvatarFallback style={{ background: "#3E1540", color: "#F6F4EF", fontFamily: "serif" }}>SK</AvatarFallback>
      </Avatar>
    </div>
  )
}
