package com.example.chembalanceai;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.ref.WeakReference;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String APP_URL = "file:///android_asset/index.html";
    private static final String APP_ASSET_PREFIX = "file:///android_asset/";

    private WebView webView;
    private AndroidBridge androidBridge;
    private ExecutorService networkExecutor;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(17, 94, 89));
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        // Gemini requests are made by the validated native bridge below. The
        // local HTML therefore does not need unrestricted file-to-web access.
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setTextZoom(100);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        networkExecutor = Executors.newCachedThreadPool();
        androidBridge = new AndroidBridge(this, webView, networkExecutor);
        webView.setWebViewClient(new LocalOnlyWebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(androidBridge, "Android");
        webView.loadUrl(APP_URL);
    }

    private boolean isTrustedAppUrl(String url) {
        return url != null && url.startsWith(APP_ASSET_PREFIX);
    }

    private void openExternalUrl(String url) {
        if (url == null || url.trim().isEmpty()) {
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (ActivityNotFoundException | SecurityException error) {
            Toast.makeText(this, "Không có ứng dụng phù hợp để mở liên kết", Toast.LENGTH_SHORT).show();
        }
    }

    private final class LocalOnlyWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            String url = request.getUrl().toString();
            if (isTrustedAppUrl(url)) {
                return false;
            }
            if (request.isForMainFrame()) {
                openExternalUrl(url);
                return true;
            }
            return false;
        }

        @SuppressWarnings("deprecation")
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (isTrustedAppUrl(url)) {
                return false;
            }
            openExternalUrl(url);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            super.onPageStarted(view, url, favicon);
            if (isTrustedAppUrl(url)) {
                view.addJavascriptInterface(androidBridge, "Android");
            } else {
                // Defense in depth: an untrusted page must never retain access
                // to native clipboard/share/network/system-bar methods.
                view.removeJavascriptInterface("Android");
                view.stopLoading();
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (androidBridge != null) {
            androidBridge.cancelAllGeminiRequests();
        }
        if (webView != null) {
            webView.removeJavascriptInterface("Android");
            webView.destroy();
            webView = null;
        }
        if (networkExecutor != null) {
            networkExecutor.shutdownNow();
            networkExecutor = null;
        }
        super.onDestroy();
    }

    public static class AndroidBridge {
        private static final String GEMINI_HOST = "generativelanguage.googleapis.com";
        private static final int CONNECT_TIMEOUT_MS = 12_000;
        private static final int READ_TIMEOUT_MS = 32_000;
        private static final int MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
        private static final int MAX_REQUEST_BYTES = 512 * 1024;

        private final Context context;
        private final WeakReference<WebView> webViewRef;
        private final ExecutorService networkExecutor;
        private final Map<String, HttpURLConnection> activeGeminiConnections = new ConcurrentHashMap<>();
        private final Set<String> cancelledGeminiRequests = ConcurrentHashMap.newKeySet();

        AndroidBridge(Context context, WebView webView, ExecutorService networkExecutor) {
            this.context = context;
            this.webViewRef = new WeakReference<>(webView);
            this.networkExecutor = networkExecutor;
        }

        private void runOnUiThread(Runnable action) {
            if (context instanceof Activity) {
                ((Activity) context).runOnUiThread(action);
            }
        }

        @JavascriptInterface
        public void copyText(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager clipboard = (ClipboardManager) context.getSystemService(Context.CLIPBOARD_SERVICE);
                    if (clipboard == null) {
                        Toast.makeText(context, "Không thể truy cập bộ nhớ tạm", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    clipboard.setPrimaryClip(ClipData.newPlainText("Phương trình", text));
                    Toast.makeText(context, "Đã sao chép", Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void shareText(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(Intent.ACTION_SEND);
                        intent.setType("text/plain");
                        intent.putExtra(Intent.EXTRA_TEXT, text);
                        context.startActivity(Intent.createChooser(intent, "Chia sẻ phương trình"));
                    } catch (ActivityNotFoundException | SecurityException error) {
                        Toast.makeText(context, "Không có ứng dụng phù hợp để chia sẻ", Toast.LENGTH_SHORT).show();
                    }
                }
            });
        }

        @JavascriptInterface
        public void toast(final String message) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Toast.makeText(context, message, Toast.LENGTH_SHORT).show();
                }
            });
        }

        @JavascriptInterface
        public void geminiRequest(final String requestId, final String method, final String endpoint,
                                  final String apiKey, final String requestBody, final int timeoutMs) {
            if (requestId == null || requestId.trim().isEmpty()) {
                return;
            }
            if (networkExecutor == null || networkExecutor.isShutdown()) {
                deliverGeminiResponse(requestId, 0, errorJson("Kết nối mạng của ứng dụng đã đóng"), 0L);
                return;
            }
            cancelledGeminiRequests.remove(requestId);
            final int safeTimeoutMs = Math.max(1000, Math.min(timeoutMs, 60_000));
            networkExecutor.execute(new Runnable() {
                @Override
                public void run() {
                    performGeminiRequest(requestId, method, endpoint, apiKey, requestBody, safeTimeoutMs);
                }
            });
        }

        @JavascriptInterface
        public void cancelGeminiRequest(String requestId) {
            if (requestId == null) {
                return;
            }
            cancelledGeminiRequests.add(requestId);
            HttpURLConnection connection = activeGeminiConnections.remove(requestId);
            if (connection != null) {
                connection.disconnect();
            }
        }

        void cancelAllGeminiRequests() {
            for (HttpURLConnection connection : activeGeminiConnections.values()) {
                if (connection != null) {
                    connection.disconnect();
                }
            }
            activeGeminiConnections.clear();
            cancelledGeminiRequests.clear();
        }

        private void performGeminiRequest(String requestId, String method, String endpoint,
                                           String apiKey, String requestBody, int timeoutMs) {
            HttpURLConnection connection = null;
            try {
                if (cancelledGeminiRequests.remove(requestId)) {
                    return;
                }
                String normalizedMethod = method == null ? "GET" : method.trim().toUpperCase(Locale.US);
                if (!"GET".equals(normalizedMethod) && !"POST".equals(normalizedMethod)) {
                    throw new SecurityException("Phương thức mạng không được hỗ trợ");
                }
                if (apiKey == null || apiKey.trim().isEmpty() || apiKey.length() > 512) {
                    deliverGeminiResponse(requestId, 401, errorJson("Chưa có Gemini API key hợp lệ"), 0L);
                    return;
                }
                if (!isAllowedGeminiEndpoint(endpoint)) {
                    throw new SecurityException("Địa chỉ Gemini không được phép");
                }

                byte[] bodyBytes = requestBody == null
                        ? new byte[0]
                        : requestBody.getBytes(StandardCharsets.UTF_8);
                if (bodyBytes.length > MAX_REQUEST_BYTES) {
                    deliverGeminiResponse(requestId, 413, errorJson("Yêu cầu gửi tới Gemini quá lớn"), 0L);
                    return;
                }

                connection = (HttpURLConnection) new URL(endpoint).openConnection();
                activeGeminiConnections.put(requestId, connection);
                if (cancelledGeminiRequests.remove(requestId)) {
                    activeGeminiConnections.remove(requestId);
                    connection.disconnect();
                    return;
                }
                connection.setRequestMethod(normalizedMethod);
                connection.setConnectTimeout(Math.min(CONNECT_TIMEOUT_MS, timeoutMs));
                connection.setReadTimeout(Math.min(READ_TIMEOUT_MS, timeoutMs));
                connection.setUseCaches(false);
                connection.setInstanceFollowRedirects(false);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("x-goog-api-key", apiKey.trim());

                if ("POST".equals(normalizedMethod)) {
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    connection.setFixedLengthStreamingMode(bodyBytes.length);
                    try (OutputStream output = connection.getOutputStream()) {
                        output.write(bodyBytes);
                    }
                }

                int status = connection.getResponseCode();
                InputStream stream = status >= 200 && status < 400
                        ? connection.getInputStream()
                        : connection.getErrorStream();
                String responseBody = stream == null ? "" : readLimited(stream, MAX_RESPONSE_BYTES);
                long retryAfterMs = parseRetryAfterMs(connection.getHeaderField("Retry-After"));
                deliverGeminiResponse(requestId, status, responseBody, retryAfterMs);
            } catch (Exception error) {
                deliverGeminiResponse(requestId, 0,
                        errorJson(error.getMessage() == null ? "Không thể kết nối Gemini" : error.getMessage()), 0L);
            } finally {
                activeGeminiConnections.remove(requestId);
                cancelledGeminiRequests.remove(requestId);
                if (connection != null) {
                    connection.disconnect();
                }
            }
        }

        private boolean isAllowedGeminiEndpoint(String endpoint) {
            if (endpoint == null || endpoint.length() > 2048) {
                return false;
            }
            Uri uri = Uri.parse(endpoint);
            String scheme = uri.getScheme();
            String host = uri.getHost();
            String path = uri.getPath();
            return "https".equalsIgnoreCase(scheme)
                    && GEMINI_HOST.equalsIgnoreCase(host)
                    && path != null
                    && path.startsWith("/v1beta/models");
        }

        private String readLimited(InputStream stream, int maxBytes) throws IOException {
            try (InputStream input = stream; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int total = 0;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > maxBytes) {
                        throw new IOException("Phản hồi Gemini quá lớn");
                    }
                    output.write(buffer, 0, count);
                }
                return output.toString(StandardCharsets.UTF_8.name());
            }
        }

        private long parseRetryAfterMs(String value) {
            if (value == null) {
                return 0L;
            }
            try {
                return Math.max(0L, Long.parseLong(value.trim())) * 1000L;
            } catch (NumberFormatException ignored) {
                return 0L;
            }
        }

        private String errorJson(String message) {
            try {
                JSONObject root = new JSONObject();
                JSONObject error = new JSONObject();
                error.put("message", message == null ? "Không thể kết nối Gemini" : message);
                root.put("error", error);
                return root.toString();
            } catch (JSONException ignored) {
                return "{\"error\":{\"message\":\"Không thể kết nối Gemini\"}}";
            }
        }

        private void deliverGeminiResponse(String requestId, int status, String responseBody, long retryAfterMs) {
            final WebView webView = webViewRef.get();
            if (webView == null) {
                return;
            }
            final String script = "window.__nativeGeminiResolve && window.__nativeGeminiResolve("
                    + JSONObject.quote(requestId == null ? "" : requestId) + ","
                    + status + ","
                    + JSONObject.quote(responseBody == null ? "" : responseBody) + ","
                    + retryAfterMs + ");";
            webView.post(new Runnable() {
                @Override
                public void run() {
                    if (context instanceof Activity && ((Activity) context).isDestroyed()) {
                        return;
                    }
                    webView.evaluateJavascript(script, null);
                }
            });
        }

        @JavascriptInterface
        public void setSystemBarsColor(final String statusColorHex, final String navColorHex,
                                       final boolean lightStatus, final boolean lightNav) {
            if (context instanceof Activity) {
                ((Activity) context).runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            Activity act = (Activity) context;
                            act.getWindow().setStatusBarColor(Color.parseColor(statusColorHex));
                            act.getWindow().setNavigationBarColor(Color.parseColor(navColorHex));

                            int flags = act.getWindow().getDecorView().getSystemUiVisibility();
                            if (lightStatus) {
                                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                            } else {
                                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                            }
                            if (lightNav) {
                                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                            } else {
                                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                            }
                            act.getWindow().getDecorView().setSystemUiVisibility(flags);
                        } catch (Exception error) {
                            error.printStackTrace();
                        }
                    }
                });
            }
        }
    }
}
