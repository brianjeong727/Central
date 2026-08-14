## A Capacitor plugin's native throw is uncatchable from JS — probe the capability natively (2026-08-14)

**What happened.** Wiring Android push, `lib/native-push.ts` called
`PushNotifications.register()` inside a `try/catch` that returned a tidy
`{ ok: false, reason }` on failure. On an emulator build without
`google-services.json` the tap on "Turn on notifications" **killed the app**:

```
E AndroidRuntime: FATAL EXCEPTION: CapacitorPlugins
Caused by: java.lang.IllegalStateException: Default FirebaseApp is not initialized
  at com.google.firebase.messaging.FirebaseMessaging.getInstance
```

`register()` dispatches to a native plugin thread and returns before the native work
runs. The `IllegalStateException` is thrown on **that** thread, not inside the
promise, so it never becomes a rejection — the JS `catch` is not merely unhelpful, it
is unreachable. The process dies. The same call also sat in `getNativePushState()`,
which runs on every mount of the notifications UI, so merely OPENING settings would
have crashed it.

**The tell.** `FATAL EXCEPTION: CapacitorPlugins` (or any thread name that is not
your JS thread) in logcat, with a stack that contains no JS frames. If the exception
had been marshalled back to the bridge it would appear as a rejected promise with a
`message`, and the app would still be running. A crashed process means no amount of
JS error handling will ever help.

**The rule.** When a native plugin call can fail because of how the BINARY was built,
gate it on a native capability probe — never on a JS try/catch, and never on a
build-time env flag in the bundle. Central's shell is remote-URL, so one web deploy
lands inside every installed binary at once; a flag in the bundle describes the build
that produced the bundle, not the binary running it. This is the same reasoning
Convention #28 already applies to the keyboard layer ("the binary, not
`capacitor.config.ts`, is the authority on what it does") — push is the second
instance of that class, which is a good sign it is really a general rule.

The probe here is `android/app/src/main/java/app/joincentral/FirebaseReadyPlugin.java`
(`FirebaseApp.getApps(ctx)` — NOT `getInstance()`, which is the throwing call), read
by `canRegisterNatively()` in `lib/native-push.ts`. It fails CLOSED on Android: a
missing or throwing probe reports "cannot register" rather than gambling on the call.

**Corollary — write the probe with reflection.** `firebase-common` reaches `:app`
only transitively via the push plugin, so a direct import means pinning a Firebase
version in the app module and keeping it in step with the plugin's. Reflection needs
no dependency and degrades correctly: if the classes are absent entirely,
`ClassNotFoundException` lands in the catch and "not available" is the honest answer.

Related: [[the-binary-is-the-authority-not-the-config]]
