package com.form.gym;

import android.os.Bundle;
import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.graphics.drawable.ColorDrawable;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GymAppearancePlugin.class);
        super.onCreate(savedInstanceState);
        String appearance = getSharedPreferences("form-native", Context.MODE_PRIVATE).getString("appearance", "dark");
        applyAppearance(this, appearance);
    }

    static void applyAppearance(Activity activity, String appearance) {
        boolean light = "light".equals(appearance);
        int background = Color.parseColor(light ? "#F2F2F0" : "#101217");
        activity.getWindow().setBackgroundDrawable(new ColorDrawable(background));
        activity.getWindow().setStatusBarColor(background);
        activity.getWindow().setNavigationBarColor(light && Build.VERSION.SDK_INT < 26 ? Color.parseColor("#252b36") : background);
        WindowInsetsControllerCompat bars = new WindowInsetsControllerCompat(activity.getWindow(), activity.getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(light);
        bars.setAppearanceLightNavigationBars(light);
    }
}
