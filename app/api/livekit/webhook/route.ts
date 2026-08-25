// ─── LiveKit webhook — the thing that makes call state honest ────────────────
//
// Clients report their own hang-ups, and clients lie by omission: a tab that is
// closed, a phone that loses signal, a browser the OS kills in the background
// all leave a call row saying "active" with nobody in it. Because at most one
// call may be live per chat (calls_one_live_per_group), ONE such row would block
// calling in that chat forever.
//
// LiveKit knows the truth — it holds the media connections — so it is the
// authority on when a room is actually empty. `room_finished` fires once the
// last participant leaves, and that is what closes the row.
//
// Configure in the LiveKit project settings: POST to
//   https://www.joincentral.app/api/livekit/webhook
// The request is authenticated by a signed JWT in the Authorization header,
// verified against the same API secret that mints join tokens, so no separate
// shared secret is involved.

import { NextResponse } from "next/server"
import { WebhookReceiver } from "livekit-server-sdk"
import { createAdminClient } from "@/lib/supabase-admin"
import { finalizeCall } from "@/lib/call-lifecycle"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY
  const apiSecret = process.env.LIVEKIT_API_SECRET
  if (!apiKey || !apiSecret) {
    return NextResponse.json({ error: "livekit-not-configured" }, { status: 503 })
  }

  const auth = req.headers.get("Authorization")
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  // receive() verifies the JWT signature AND the body hash, so the raw text has
  // to be handed over unparsed.
  const raw = await req.text()
  const receiver = new WebhookReceiver(apiKey, apiSecret)

  let event
  try {
    event = await receiver.receive(raw, auth)
  } catch {
    return NextResponse.json({ error: "bad-signature" }, { status: 401 })
  }

  const roomName = event.room?.name
  if (!roomName) return NextResponse.json({ ok: true })

  const admin = createAdminClient()

  if (event.event === "room_finished") {
    const { data: call } = await admin
      .from("calls")
      .select("id, answered_at, status")
      .eq("room_name", roomName)
      .maybeSingle()
    if (call && call.status !== "ended") {
      // Nobody ever answered → the summary line should read "Missed call", not a
      // 0:00 duration.
      await finalizeCall(admin, call.id, call.answered_at ? "completed" : "missed")
    }
    return NextResponse.json({ ok: true })
  }

  if (event.event === "participant_left") {
    const identity = event.participant?.identity
    if (!identity) return NextResponse.json({ ok: true })
    const { data: call } = await admin
      .from("calls")
      .select("id")
      .eq("room_name", roomName)
      .maybeSingle()
    if (call) {
      await admin
        .from("call_participants")
        .update({ state: "left", left_at: new Date().toISOString() })
        .eq("call_id", call.id)
        .eq("user_id", identity)
        .eq("state", "joined")
    }
    // Deliberately NOT ending the call here — `room_finished` is the signal for
    // "the room is empty", and ending on the first departure would hang up on
    // everyone else the moment one person in a group call left.
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true })
}
