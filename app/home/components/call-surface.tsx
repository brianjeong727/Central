"use client"

// The single mount point for everything calling puts on screen. Kept separate
// from CallProvider so the provider stays pure state: this component is the only
// thing that re-renders on a speaking-indicator change, and it sits at the shell
// root rather than inside any tab, because a call outlives the conversation it
// started in.

import { useCall } from "../call-context"
import { CallOverlay } from "./call-overlay"
import { IncomingCall } from "./incoming-call"
import { Toast } from "@/components/central"

export function CallSurface({ selfId }: { selfId: string }) {
  const {
    active, incoming, peers, micOn, camOn, screenOn, canShareScreen, facingUser,
    needsAudioUnlock, error,
    accept, decline, hangUp, toggleMic, toggleCamera, toggleScreenShare, flipCamera,
    unlockAudio, dismissError,
  } = useCall()

  return (
    <>
      {active && (
        <CallOverlay
          call={active}
          peers={peers}
          selfId={selfId}
          micOn={micOn}
          camOn={camOn}
          screenOn={screenOn}
          canShareScreen={canShareScreen}
          facingUser={facingUser}
          needsAudioUnlock={needsAudioUnlock}
          onToggleMic={toggleMic}
          onToggleCamera={toggleCamera}
          onToggleScreenShare={toggleScreenShare}
          onFlipCamera={flipCamera}
          onHangUp={hangUp}
          onUnlockAudio={unlockAudio}
        />
      )}
      {/* An incoming ring outranks a call already in progress on screen — you
          can only be in one, and the provider refuses a second, so in practice
          these are mutually exclusive. */}
      {incoming && <IncomingCall call={incoming} onAccept={accept} onDecline={decline} />}
      {error && <Toast message={error} onDismiss={dismissError} />}
    </>
  )
}
