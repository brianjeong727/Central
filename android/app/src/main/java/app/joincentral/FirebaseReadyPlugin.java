package app.joincentral;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.JSObject;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.content.Context;

import java.lang.reflect.Method;
import java.util.List;

/**
 * Reports whether a default FirebaseApp actually initialized in THIS process.
 *
 * WHY THIS EXISTS — it prevents a hard crash, not a warning:
 *
 *   PushNotifications.register() calls FirebaseMessaging.getInstance(), which throws
 *   IllegalStateException("Default FirebaseApp is not initialized") when the app was
 *   built without google-services.json. That throw happens on Capacitor's native
 *   plugin thread, so it surfaces as FATAL EXCEPTION and kills the process. A
 *   JavaScript try/catch around register() CANNOT catch it — verified on an
 *   emulator, where tapping "Turn on notifications" killed the app outright.
 *
 * WHY A NATIVE PROBE RATHER THAN AN ENV FLAG:
 *
 *   Central's shell is a REMOTE-URL WebView, so one web deploy lands inside every
 *   installed binary at once. A build-time flag in the bundle describes the build
 *   that produced the bundle, not the binary running it — the exact failure mode
 *   CLAUDE.md Convention #28 documents for the keyboard layer ("the binary, not
 *   capacitor.config.ts, is the authority on what it does"). Firebase config is
 *   baked into the APK, so only the APK can answer. This asks it.
 *
 * getApps() is used rather than getInstance() because getInstance() is precisely the
 * call that throws; getApps() returns an empty list instead.
 *
 * REFLECTION rather than a direct import: firebase-common reaches :app only as a
 * transitive dependency of the push-notifications plugin module, so importing it here
 * would mean pinning a Firebase version in this module and keeping it in step with
 * whatever the plugin resolves. Reflection needs no dependency, and it degrades the
 * right way — if the Firebase classes are absent entirely, ClassNotFoundException
 * lands in the catch below and we report "not available", which is the truth.
 */
@CapacitorPlugin(name = "FirebaseReady")
public class FirebaseReadyPlugin extends Plugin {

    @PluginMethod
    public void check(PluginCall call) {
        boolean available;
        try {
            Class<?> firebaseApp = Class.forName("com.google.firebase.FirebaseApp");
            Method getApps = firebaseApp.getMethod("getApps", Context.class);
            Object apps = getApps.invoke(null, getContext());
            available = (apps instanceof List) && !((List<?>) apps).isEmpty();
        } catch (Throwable t) {
            // Never let the probe itself become the crash it exists to prevent.
            available = false;
        }
        JSObject ret = new JSObject();
        ret.put("available", available);
        call.resolve(ret);
    }
}
