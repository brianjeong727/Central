#!/usr/bin/env bash
#
# android.sh — one entry point for the Android shell, so the toolchain paths are
# written down once instead of rediscovered every session.
#
# Three things about this machine's setup are non-obvious, and each one costs a
# session's worth of confusing errors if you hit it cold:
#
#   1. The Capacitor CLI requires Node >= 22, but the project's default is Node 20
#      (`nvm use 20`, what next dev runs on). `npx cap` fails with a bare
#      "[fatal] The Capacitor CLI requires NodeJS >=22.0.0". We switch to 24 for
#      cap commands ONLY — the web build stays on the project's Node.
#   2. openjdk@21 is KEG-ONLY (Homebrew does not symlink it), so JAVA_HOME must be
#      set explicitly or Gradle reports "Unable to locate a Java Runtime".
#   3. The SDK lives under Homebrew's cmdline-tools prefix, not ~/Library/Android/sdk,
#      because it was installed without Android Studio.
#
# Usage:
#   scripts/android.sh doctor            # verify the toolchain is present
#   scripts/android.sh sync              # cap sync android (run after config edits)
#   scripts/android.sh debug             # build + install the debug APK on a device
#   scripts/android.sh aab               # clean signed release AAB (the Play upload)
#   scripts/android.sh dev [port]        # point the shell at a slot dev server + install
#   scripts/android.sh emulator          # boot the central_test AVD
#   scripts/android.sh fingerprint       # SHA-1/SHA-256 of the upload key
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}"
export ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

KEYSTORE_ENV="$HOME/.central-android/keystore.env"

# Capacitor CLI only — see note 1 above.
cap() {
  # shellcheck disable=SC1090
  export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 24 >/dev/null 2>&1
  npx cap "$@"
}

doctor() {
  local ok=0
  command -v java >/dev/null && echo "✓ java     $(java -version 2>&1 | head -1)" || { echo "✗ java — brew install openjdk@21"; ok=1; }
  [ -d "$ANDROID_HOME/platforms" ] && echo "✓ sdk      $ANDROID_HOME" || { echo "✗ android sdk — brew install --cask android-commandlinetools"; ok=1; }
  command -v adb >/dev/null && echo "✓ adb      $(adb --version | head -1)" || { echo "✗ adb"; ok=1; }
  [ -f "$KEYSTORE_ENV" ] && echo "✓ keystore $KEYSTORE_ENV" || echo "• keystore absent — release builds will be UNSIGNED"
  [ -f android/app/google-services.json ] && echo "✓ firebase google-services.json present (FCM active)" \
    || echo "• firebase google-services.json ABSENT — push is disabled and the native probe reports unavailable (by design, not a crash)"
  return $ok
}

# Write android/keystore.properties from the out-of-repo credentials. Both files are
# gitignored; the keystore itself never lives in the repo.
write_signing() {
  [ -f "$KEYSTORE_ENV" ] || return 0
  # shellcheck disable=SC1090
  . "$KEYSTORE_ENV"
  cat > android/keystore.properties <<EOF
storeFile=$CENTRAL_KEYSTORE
storePassword=$CENTRAL_KEYSTORE_PASSWORD
keyAlias=$CENTRAL_KEY_ALIAS
keyPassword=$CENTRAL_KEYSTORE_PASSWORD
EOF
  chmod 600 android/keystore.properties
}

case "${1:-doctor}" in
  doctor) doctor ;;

  sync) cap sync android ;;

  debug)
    cap sync android
    (cd android && ./gradlew assembleDebug) || exit 1
    adb install -r android/app/build/outputs/apk/debug/app-debug.apk
    ;;

  aab)
    cap sync android
    write_signing
    # `clean` is NOT optional. Gradle's up-to-date check does not notice a changed
    # capacitor.config.json, so a plain bundleRelease can re-emit the PREVIOUS
    # artifact — including a dev server URL. See tasks/lessons/inbox/
    # 2026-08-14-the-shipped-artifact-embeds-the-config-not-reads-it.md
    (cd android && ./gradlew clean bundleRelease) || exit 1
    AAB=android/app/build/outputs/bundle/release/app-release.aab
    echo
    echo "▶ artifact assertions (the source file is NOT the authority — the AAB is)"
    unzip -p "$AAB" base/assets/capacitor.config.json \
      | python3 -c "import sys,json;d=json.load(sys.stdin);s=d['server'];print('  url        ',s['url']);print('  cleartext  ',s.get('cleartext','(absent — correct)'));print('  android UA ',d.get('android',{}).get('appendUserAgent'))"
    jarsigner -verify "$AAB" >/dev/null 2>&1 && echo "  signature   verified" || echo "  signature   UNSIGNED"
    echo "  path        $AAB"
    ;;

  dev)
    PORT="${2:-3001}"
    # 10.0.2.2 is the emulator's alias for the host loopback; localhost inside the
    # emulator is the emulator itself. cleartext is required because it is http.
    echo "▶ pointing the shell at http://10.0.2.2:$PORT (DEV ONLY — never commit this)"
    cp capacitor.config.ts /tmp/capacitor.config.ts.pristine
    python3 - "$PORT" <<'PY'
import sys, re
port = sys.argv[1]
p = "capacitor.config.ts"
s = open(p).read()
s = s.replace('url: "https://www.joincentral.app",', f'url: "http://10.0.2.2:{port}",\n    cleartext: true,')
open(p, "w").write(s)
PY
    cap sync android
    (cd android && ./gradlew assembleDebug) && adb install -r android/app/build/outputs/apk/debug/app-debug.apk
    cp /tmp/capacitor.config.ts.pristine capacitor.config.ts
    cap sync android >/dev/null
    echo "▶ capacitor.config.ts restored and re-synced (the installed APK keeps the dev URL)"
    adb shell am start -n app.joincentral/.MainActivity >/dev/null 2>&1
    ;;

  emulator)
    if ! avdmanager list avd 2>/dev/null | grep -q central_test; then
      echo no | avdmanager create avd -n central_test -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_7
    fi
    emulator -avd central_test -no-snapshot -no-boot-anim -gpu swiftshader_indirect >/tmp/central-emulator.log 2>&1 &
    adb wait-for-device
    adb shell 'while [[ -z $(getprop sys.boot_completed) ]]; do sleep 2; done'
    # The AVD ships with a hardware keyboard, which suppresses the soft IME and makes
    # every keyboard-layout test silently pass by never opening a keyboard.
    adb shell settings put secure show_ime_with_hard_keyboard 1
    echo "▶ emulator ready"
    ;;

  fingerprint)
    [ -f "$KEYSTORE_ENV" ] || { echo "no keystore at $KEYSTORE_ENV"; exit 1; }
    # shellcheck disable=SC1090
    . "$KEYSTORE_ENV"
    keytool -list -v -keystore "$CENTRAL_KEYSTORE" -storepass "$CENTRAL_KEYSTORE_PASSWORD" \
      -alias "$CENTRAL_KEY_ALIAS" 2>/dev/null | grep -E "SHA1:|SHA256:"
    echo
    echo "SHA-1   → the Android OAuth client in Google Cloud (native Google sign-in)"
    echo "SHA-256 → ANDROID_CERT_SHA256_FINGERPRINTS (assetlinks.json)"
    echo
    echo "NOTE: this is the UPLOAD key. Under Play App Signing, Google re-signs with"
    echo "its own key, so after the first upload you must ALSO register the"
    echo "app-signing SHA-1/SHA-256 from Play Console → Setup → App signing."
    ;;

  *) grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
