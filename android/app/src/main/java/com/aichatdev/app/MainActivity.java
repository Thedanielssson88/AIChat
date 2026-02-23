package com.aichatdev.app; // Ändrat till motesapp för att matcha mappen och pluginet

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registrera pluginet
        registerPlugin(GeminiNanoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
