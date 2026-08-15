# Android / Google Play — state of play (paused 2026-08-15)

**Where this stopped:** the app is code-complete and merged to `main`. Everything
remaining is Google Console work, and it is blocked on ONE thing: Play Console
requires the account owner to verify **access to a real Android device** (install the
Play Console app, sign in as owner). Brian owns no Android device as of 2026-08-15.
Nothing in the codebase is waiting on anything.

---

## What shipped

| PR | Commit on main | What |
|---|---|---|
| #302 | `40c2608` | The Android shell: platform scaffold, back-intent layer, FCM lane, Firebase crash guard, assetlinks route, `scripts/android.sh` |
| #303 | `7fc53af` | Unstuck 3 e2e specs left behind by the 2026-07-27 back-chevron ratification (unrelated to Android; found while verifying) |

Architecture is unchanged from iOS: a **remote-URL Capacitor shell** loading
`https://www.joincentral.app`. No code fork. Android-specific behavior is either a key
under `android:` in `capacitor.config.ts` or a branch inside a module that already asks
the container what it is.

### Verified on an Android 36 emulator (not assumed)

- **Routing** — the app opens on `/login`, not the marketing page. `proxy.ts` needed no
  change; its shell detection was already a UA substring test, so
  `android.appendUserAgent: "CentralShell"` was the entire fix.
- **Back button** — sign-in form → welcome step; announcement detail → list; chat →
  chats tab → home; and back at the root **minimizes with the process alive**.
- **Keyboard** — measured, not assumed: `--kb-inset: 0`, `data-kb-open: true`,
  viewport natively shrunk (527 vs screen 915), chat composer bottom at 505 inside a
  527px viewport. Android lands in `lib/keyboard-inset.ts`'s "native already made the
  room" branch and contributes nothing. **Zero keyboard-layer changes were needed** —
  that is the finding, not an omission.
- **Migration** — probed live: a legacy 2-arg iOS call still writes `apns:` /
  `ios-native` byte-identically; ACL restored to its exact prior posture.
- **Release AAB** — builds signed, and the ARTIFACT was asserted to embed the
  production URL (the source file is not the authority — see the lesson below).

### Crash found and fixed (would have shipped)

`PushNotifications.register()` with no `google-services.json` throws
`IllegalStateException` on Capacitor's **native** plugin thread — `FATAL EXCEPTION`,
process dead, uncatchable by any JS `try/catch`. Tapping "Turn on notifications" killed
the app, and `getNativePushState()` calls `register()` too, so merely opening
notification settings would have. Guarded by a native probe
(`android/app/src/main/java/app/joincentral/FirebaseReadyPlugin.java`) that fails
closed. A build-time flag would NOT have worked: the remote bundle lands in whatever
binary is installed, so only the binary can answer (Convention #28's rule).

---

## Blocked on: Android device verification

Play Console → "Verify that you have access to an Android mobile device". Install the
Play Console app on a real Android, sign in **as the account owner** (Brian), verify.

- **Fastest:** borrow a student's phone for 5 minutes; add the account, verify, remove it.
- **Better:** buy a cheap Android ($50–80 used). Not just for this checkbox — we are
  shipping an Android app with zero Android devices to test on. The emulator caught a
  hard crash but will not catch OEM skins, real FCM delivery, or real Google sign-in.
- The emulator built here uses a `google_apis` image, which has **no Play Store**, so
  the Play Console app cannot be installed on it as-is. A `google_apis_playstore` image
  might work but is explicitly against the intent of this check — do not count on it.

---

## Still undecided: organization vs personal account

Not yet chosen as of 2026-08-15. The decision rule:

- **Organization** is exempt from the closed-testing requirement (12 testers /
  14 continuous days) — but requires a **D-U-N-S number** and org verification, which
  can take longer than the test it saves. Only worth it if the legal entity already
  exists.
- **Yourself** is faster (ID verification only) but subject to the closed test.
- **The choice is effectively permanent** — a personal account cannot be converted to
  an organization one; moving later means an app transfer.
- If organization: create it under a **Workspace account on `joincentral.app`**, NOT
  `brianjeong13@gmail.com`. A business asset on a personal Gmail has to be unwound later.

Either way, **12 real Android testers for 14 continuous days** is the long pole for a
personal account. Recruit those students before the listing is ready, not after.

---

## Remaining console checklist

1. **Device verification** (above) — blocks everything.
2. **Firebase** → create project, add Android app `app.joincentral`, download
   `google-services.json` → `android/app/google-services.json` (gitignored; the Gradle
   plugin self-activates on its presence). Service-account key → Vercel:
   `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY_BASE64`.
   Until then push is **cleanly disabled, not broken** (the native probe reports
   unavailable and the UI offers no button).
3. **Google Cloud** → in the project behind `NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID`, add an
   **Android** OAuth client: package `app.joincentral`, SHA-1 below. Then set
   `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID` on Vercel to the **Web** client ID.
   (Counter-intuitive but correct: Android passes the *Web* client ID to
   `SocialLogin.initialize`; the Android client only has to exist. See the comment in
   `lib/native-auth.ts`.) Today the Google button correctly HIDES on Android.
4. **Optional — Android password autofill** → set
   `ANDROID_CERT_SHA256_FINGERPRINTS`. Until set, `/.well-known/assetlinks.json` serves
   an empty statement list, which is the honest "this domain authorizes no Android app".
5. **Upload** `scripts/android.sh aab` → `android/app/build/outputs/bundle/release/app-release.aab`
   (~6.5 MB, signed). Data safety form; privacy policy `https://www.joincentral.app/privacy` (live).
6. **AFTER the first upload** — Play re-signs with its OWN key under Play App Signing.
   Copy the app-signing SHA-1 from Play Console → Setup → App signing back into the
   Google Cloud Android OAuth client, or Google sign-in works locally and silently fails
   in production. Same for the SHA-256 → `ANDROID_CERT_SHA256_FINGERPRINTS`.

### Upload key (generated 2026-08-15)

Lives **outside the repo** at `~/.central-android/` (`central-upload.keystore` +
`keystore.env`, chmod 600). Gitignored and never committed.

```
SHA1:   06:DC:A8:CD:EE:FF:79:DF:E9:BD:8D:81:73:61:C3:2A:6A:4A:1C:0C
SHA256: DA:DF:45:5D:8E:0B:B2:62:C1:4F:E2:F8:B2:0D:6F:FB:53:E1:13:AA:61:E2:33:21:A0:E7:07:B1:22:0D:E0:B1
```

**BACK THIS UP.** Recoverable via Play App Signing's upload-key reset if lost, but that
is friction you do not want. Reprint any time with `scripts/android.sh fingerprint`.

---

## Toolchain (installed 2026-08-15 on this machine)

Three non-obvious things, each of which costs a confusing hour if hit cold — all
encoded in `scripts/android.sh`, so use it rather than raw gradle/cap:

1. The **Capacitor CLI needs Node ≥ 22**; the project runs Node 20. `scripts/android.sh`
   switches to 24 for `cap` commands only.
2. **openjdk@21 is keg-only** — `JAVA_HOME` must be set explicitly or Gradle reports
   "Unable to locate a Java Runtime".
3. The SDK is at `/opt/homebrew/share/android-commandlinetools`, not
   `~/Library/Android/sdk` (installed without Android Studio).

```
scripts/android.sh doctor       # verify the toolchain
scripts/android.sh emulator     # boot the central_test AVD (also enables the soft IME)
scripts/android.sh dev 3001     # point the shell at a slot dev server + install
scripts/android.sh aab          # clean signed release AAB + artifact assertions
scripts/android.sh fingerprint  # SHA-1 / SHA-256 of the upload key
```

---

## Open items deliberately NOT done

- **a11y: back-label inconsistency.** `SubpageShell` labels its back button
  "Back to {parent}", but `PocketHubChrome` and five other call sites render a bare
  `BackChevron` whose accessible name is just "Back" — screen-reader users lose the
  destination. Flagged 2026-08-15, left alone because it is a design-contract call, not
  a test fix. Fixing it would also mean revisiting the specs that now assert `name: "Back"`.
- **`.vercelignore`.** `android/` (1.2 MB tracked) now ships to Vercel on every deploy,
  as `ios/` (636 KB) already did. Left as-is for consistency; no `.vercelignore` exists.
- **Full e2e suite** was never run to completion on the Android branch — it was killed
  to free the slot port for the ship build. `verify.sh` passed and the targeted specs
  passed (13, then 27 after the spec fixes).

## Lessons written (in `tasks/lessons/inbox/`, awaiting `/lessons-gc`)

- `2026-08-14-a-native-plugin-throw-cannot-be-caught-in-js.md`
- `2026-08-14-adding-a-defaulted-rpc-param-needs-drop-and-create.md`
- `2026-08-14-the-shipped-artifact-embeds-the-config-not-reads-it.md`
