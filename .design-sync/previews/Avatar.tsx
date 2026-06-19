import { Avatar, AvatarFallback, AvatarImage } from "central"

export function AvatarWithFallback() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 24, background: "#FBF8F2", alignItems: "center" }}>
      <Avatar>
        <AvatarFallback style={{ background: "#3E1540", color: "#F6F4EF", fontFamily: "serif", fontSize: 18 }}>BJ</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback style={{ background: "#13101A", color: "#F6F4EF", fontFamily: "serif", fontSize: 18 }}>SK</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarFallback style={{ background: "#3E1540", color: "#F6F4EF", fontFamily: "serif", fontSize: 18 }}>PT</AvatarFallback>
      </Avatar>
    </div>
  )
}

export function AvatarSizes() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 24, background: "#FBF8F2", alignItems: "center" }}>
      <Avatar style={{ width: 32, height: 32 }}>
        <AvatarFallback style={{ background: "#3E1540", color: "#F6F4EF", fontSize: 12 }}>BJ</AvatarFallback>
      </Avatar>
      <Avatar style={{ width: 40, height: 40 }}>
        <AvatarFallback style={{ background: "#3E1540", color: "#F6F4EF", fontSize: 16 }}>BJ</AvatarFallback>
      </Avatar>
      <Avatar style={{ width: 56, height: 56 }}>
        <AvatarFallback style={{ background: "#3E1540", color: "#F6F4EF", fontSize: 22 }}>BJ</AvatarFallback>
      </Avatar>
    </div>
  )
}

export function AvatarWithImage() {
  return (
    <div style={{ display: "flex", gap: 16, padding: 24, background: "#FBF8F2", alignItems: "center" }}>
      <Avatar>
        <AvatarImage src="https://avatars.githubusercontent.com/u/1?v=4" alt="User" />
        <AvatarFallback style={{ background: "#3E1540", color: "#F6F4EF" }}>U</AvatarFallback>
      </Avatar>
      <Avatar>
        <AvatarImage src="/broken.jpg" alt="User" />
        <AvatarFallback style={{ background: "#13101A", color: "#F6F4EF" }}>SK</AvatarFallback>
      </Avatar>
    </div>
  )
}
