## The shipped artifact EMBEDS capacitor.config, so verify the artifact, not the source (2026-08-14)

**What happened.** To test the Android shell against this slot's dev server I patched
`capacitor.config.ts` to `http://10.0.2.2:3001` (the emulator's host-loopback alias),
the same dev-only overlay `/sim` uses for iOS. Afterwards I restored the file from a
pristine copy, confirmed `git diff` was clean, and built the release AAB.

The AAB pointed at **`http://10.0.2.2:3001`**. A Play upload that could never load.

`npx cap sync` COPIES the config into
`android/app/src/main/assets/capacitor.config.json`, and the build reads that copy.
Reverting the TypeScript source changes nothing until a sync runs. `git status` is
clean and the artifact is still wrong, because the generated JSON is gitignored — the
one file that decides what the app does is the one file version control is not
watching.

**Second bite: Gradle said UP-TO-DATE.** After re-running `cap sync android` I rebuilt
and got `BUILD SUCCESSFUL`, `packageReleaseBundle UP-TO-DATE`, and an AAB that STILL
had the dev URL. The asset change did not invalidate the task graph, so a plain
`bundleRelease` re-emitted the previous artifact. `./gradlew clean bundleRelease`
produced the correct one. A green build is not evidence that the thing on disk is new.

**The rule.** For a shell release, assert against the ARTIFACT:

```bash
unzip -p app/build/outputs/bundle/release/app-release.aab base/assets/capacitor.config.json \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['server'])"
```

Expect the production URL and NO `cleartext`. Do it after every release build, not
once — the failure is invisible in `git status`, invisible in the build log, and
fatal at the store.

**Corollary — the Capacitor CLI edits `ios/` when you touch Android.** `npx cap add
android` rewrote `ios/App/App.xcodeproj/project.pbxproj` (`LastUpgradeCheck 0920` →
`920`) as a side effect of parsing both platforms. Cosmetic, but it violates the
"iOS is untouched" guarantee. After any `cap add`/`cap sync`, check `git status ios/`
and revert stray churn.

Related: [[a-native-plugin-throw-cannot-be-caught-in-js]]
