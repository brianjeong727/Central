## A web feature needing a NATIVE permission ships into every old binary (2026-08-25)

Calling shipped to the web. The `NSMicrophoneUsageDescription` and `RECORD_AUDIO`
permissions it needs were committed in the same PR — and were therefore live in
the repo and dead on every phone, because **native config only reaches a device
in a new binary, while a web deploy reaches every installed app at once.**

So the deploy put a call button inside a shell that cannot legally open a
microphone. On iOS that is not a dead end: touching a TCC-protected resource with
no usage description **terminates the app**. The feature would have crashed the
iPhone app for real users, on a build we had already merged.

Convention #28 states this exact asymmetry ("a web deploy DOES reach every
installed binary at once, so the bundle must be correct in all of them") — it was
written after the keyboard inset shipped the same way. Knowing the rule did not
prevent repeating it, because the rule reads as being about *the keyboard*.

**The general form, which is what to check for:**

> Any feature whose web half needs a native half must ship DARK in the shell
> until the binary carrying that half is live. Committing the plist/manifest
> change in the same PR does nothing — it is not in the deployed artifact.

**Gate at the CAPABILITY, not the button.** Hiding the call button was not
sufficient: the ring arrives over realtime regardless of what the UI renders, and
answering it calls `getUserMedia`. Two exposures, one root cause. The gate went
into `CallProvider` (the thing that can reach for the mic) as well as the header.

**How to spot it before shipping:** if a diff touches `ios/App/App/Info.plist`,
`AndroidManifest.xml`, or `capacitor.config.ts`, then the web code in that same
diff must be inert under `isNativeShell()` until the binary ships. That is a
mechanical check and a good candidate for a `verify.sh` gate.

Related: [[keyboard-inset-native-config-needs-a-build]] — same asymmetry, and the
reason Convention #28 says what it says.
