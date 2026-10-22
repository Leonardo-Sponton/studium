package io.github.leonardo_sponton.studium;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(StudiumFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
