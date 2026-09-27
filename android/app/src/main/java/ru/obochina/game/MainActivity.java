package ru.obochina.game;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

// Полноэкранный режим без системных панелей (они выезжают свайпом с края), экран не гаснет во время игры.
// Вырез камеры: размеры отдаются странице через AndroidInsets.insets() (см. index.html), интерфейс обходит вырез.
public class MainActivity extends BridgeActivity {
    private volatile String cutout = "0,0,0,0";

    // Объект для страницы: возвращает "лево,верх,право,низ" в css-пикселях
    private class InsetsBridge {
        @JavascriptInterface
        public String insets() { return cutout; }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().addJavascriptInterface(new InsetsBridge(), "AndroidInsets");
        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            Insets c = insets.getInsets(WindowInsetsCompat.Type.displayCutout());
            float d = getResources().getDisplayMetrics().density;
            cutout = (c.left / d) + "," + (c.top / d) + "," + (c.right / d) + "," + (c.bottom / d);
            return insets;
        });
        hideBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    private void hideBars() {
        View decor = getWindow().getDecorView();
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), decor);
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
