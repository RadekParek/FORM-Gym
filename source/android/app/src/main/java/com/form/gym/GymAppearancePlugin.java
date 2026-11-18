package com.form.gym;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "GymAppearance")
public class GymAppearancePlugin extends Plugin {
    @PluginMethod
    public void setAppearance(PluginCall call) {
        String appearance = call.getString("appearance");
        if (!"dark".equals(appearance) && !"light".equals(appearance)) {
            call.reject("Invalid appearance");
            return;
        }
        getActivity().runOnUiThread(() -> {
            getContext().getSharedPreferences("form-native", Context.MODE_PRIVATE).edit().putString("appearance", appearance).apply();
            MainActivity.applyAppearance(getActivity(), appearance);
            getBridge().getWebView().setBackgroundColor(android.graphics.Color.parseColor("light".equals(appearance) ? "#F7F7F4" : "#111713"));
            call.resolve();
        });
    }
}
