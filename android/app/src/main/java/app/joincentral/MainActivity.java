package app.joincentral;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registered BEFORE super.onCreate so the bridge picks it up while loading
        // plugins. FirebaseReady gates PushNotifications.register() from the web
        // layer — see FirebaseReadyPlugin for why the check must be native.
        registerPlugin(FirebaseReadyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
