package io.github.leonardo_sponton.studium;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Base64;
import android.view.inputmethod.InputMethodManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;


import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Comparator;
import java.util.stream.Stream;

/**
 * File access for the web app (src/platform/android.ts), rooted at the data folder.
 * Every path from the web side is relative to that folder and may never leave it.
 * Writes are atomic: the text goes to a temp file, which is then renamed over the target.
 */
@CapacitorPlugin(name = "StudiumFiles")
public class StudiumFilesPlugin extends Plugin {

    /** Action of the "Review" home-screen shortcut (res/xml/shortcuts.xml). */
    static final String ACTION_REVIEW = "io.github.leonardo_sponton.studium.REVIEW";

    // ---- "Review" shortcut ----

    /**
     * Capacitor hands every intent to the plugins, also the one that started the app. The event
     * is kept until the web side listens, so a cold start through the shortcut is not missed.
     */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null || !ACTION_REVIEW.equals(intent.getAction())) return;
        intent.setAction(Intent.ACTION_MAIN); // handled once, not again after a reload
        JSObject e = new JSObject();
        e.put("target", "review"); // src/ui/Shell.tsx OpenRequest
        notifyListeners("open", e, true);
    }

    /**
     * Opens the keyboard for the focused field: WebView focus() alone does not, without a tap.
     * Coming back from the home screen the window gets its focus a moment after the intent, and
     * the keyboard is refused until then, so it retries for up to about a second.
     */
    @PluginMethod
    public void showKeyboard(PluginCall call) {
        android.view.View v = getBridge().getWebView();
        InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        Runnable[] tryShow = new Runnable[1];
        int[] left = { 10 };
        tryShow[0] = () -> {
            if (v.hasWindowFocus()) {
                v.requestFocus();
                imm.showSoftInput(v, InputMethodManager.SHOW_IMPLICIT);
            } else if (--left[0] > 0) {
                v.postDelayed(tryShow[0], 100);
            }
        };
        v.post(tryShow[0]);
        call.resolve();
    }

    // ---- PDF export ----

    /**
     * Opens Android's print screen for the page as it is now; the page shows only the note to
     * export when printed (its print CSS). "Save as PDF" there writes the file. "printDone" tells
     * the page when the print screen is closed, so it can take the note away again.
     */
    @PluginMethod
    public void printPage(PluginCall call) {
        String name = call.getString("name", "Studium");
        boolean landscape = Boolean.TRUE.equals(call.getBoolean("landscape", false));
        String size = call.getString("pageSize", "A4");
        getActivity().runOnUiThread(() -> {
            try {
                android.print.PrintManager pm = (android.print.PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                android.print.PrintDocumentAdapter inner = getBridge().getWebView().createPrintDocumentAdapter(name);
                android.print.PrintDocumentAdapter adapter = new android.print.PrintDocumentAdapter() {
                    @Override
                    public void onStart() {
                        inner.onStart();
                    }

                    @Override
                    public void onLayout(android.print.PrintAttributes oldAttrs, android.print.PrintAttributes newAttrs,
                            android.os.CancellationSignal cancel, LayoutResultCallback cb, android.os.Bundle extras) {
                        inner.onLayout(oldAttrs, newAttrs, cancel, cb, extras);
                    }

                    @Override
                    public void onWrite(android.print.PageRange[] pages, android.os.ParcelFileDescriptor dest,
                            android.os.CancellationSignal cancel, WriteResultCallback cb) {
                        inner.onWrite(pages, dest, cancel, cb);
                    }

                    @Override
                    public void onFinish() {
                        inner.onFinish();
                        notifyListeners("printDone", new JSObject());
                    }
                };
                android.print.PrintAttributes.MediaSize media = mediaSize(size);
                if (landscape) media = media.asLandscape();
                android.print.PrintAttributes attrs = new android.print.PrintAttributes.Builder()
                        .setMediaSize(media)
                        .setMinMargins(android.print.PrintAttributes.Margins.NO_MARGINS)
                        .build();
                pm.print(name, adapter, attrs);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    private static android.print.PrintAttributes.MediaSize mediaSize(String name) {
        switch (name) {
            case "A3": return android.print.PrintAttributes.MediaSize.ISO_A3;
            case "A5": return android.print.PrintAttributes.MediaSize.ISO_A5;
            case "Letter": return android.print.PrintAttributes.MediaSize.NA_LETTER;
            case "Legal": return android.print.PrintAttributes.MediaSize.NA_LEGAL;
            case "Tabloid": return android.print.PrintAttributes.MediaSize.NA_TABLOID;
            default: return android.print.PrintAttributes.MediaSize.ISO_A4;
        }
    }

    // ---- Web links ----

    /**
     * Opens a web link (a book's buy link) in the browser. The app itself has no INTERNET
     * permission; the browser is a separate app. Only http/https links are passed on.
     */
    @PluginMethod
    public void openLink(PluginCall call) {
        String url = call.getString("url", "");
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) {
            call.reject("Not a web link");
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(i);
            call.resolve();
        } catch (android.content.ActivityNotFoundException e) {
            call.reject("No app can open this link");
        }
    }

    /** Opens a data-folder file (an assignment's PDF, a photo…) in the app chosen for its type. */
    @PluginMethod
    public void openFile(PluginCall call) {
        try {
            Path p = resolve(call, "path");
            if (!Files.isRegularFile(p)) {
                call.reject("Not a file");
                return;
            }
            String name = p.getFileName().toString();
            String ext = name.contains(".") ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(java.util.Locale.ROOT) : "";
            String mime = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            Uri uri = androidx.core.content.FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", p.toFile());
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(uri, mime != null ? mime : "*/*");
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(Intent.createChooser(i, name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (IOException | IllegalArgumentException e) {
            call.reject(e.getMessage());
        } catch (android.content.ActivityNotFoundException e) {
            call.reject("No app can open this file");
        }
    }

    // ---- "All files access" (SPEC 2.3) ----

    @PluginMethod
    public void hasAccess(PluginCall call) {
        boolean granted;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            granted = Environment.isExternalStorageManager();
        } else {
            granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    == PackageManager.PERMISSION_GRANTED;
        }
        JSObject r = new JSObject();
        r.put("granted", granted);
        call.resolve(r);
    }

    @PluginMethod
    public void openAccessSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(i);
        } else {
            ActivityCompat.requestPermissions(getActivity(), new String[] {
                    Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE }, 1);
        }
        call.resolve();
    }

    /** The app's own Android settings page (notifications refused before can be allowed there). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void storageRoot(PluginCall call) {
        JSObject r = new JSObject();
        r.put("path", Environment.getExternalStorageDirectory().getAbsolutePath());
        call.resolve(r);
    }

    // ---- Files ----

    /** Resolves a relative path inside the root, refusing anything that would leave it. */
    private Path resolve(PluginCall call, String key) throws IOException {
        String root = call.getString("root");
        String rel = call.getString(key, "");
        if (root == null || root.isEmpty()) throw new IOException("No data folder");
        if (rel.startsWith("/")) throw new IOException("Invalid path: " + rel);
        for (String part : rel.split("/")) {
            if (part.equals("..") || part.equals(".")) throw new IOException("Invalid path: " + rel);
        }
        Path base = Paths.get(root).normalize();
        Path p = base.resolve(rel).normalize();
        if (!p.startsWith(base)) throw new IOException("Invalid path: " + rel);
        return p;
    }

    private static JSObject info(Path p, BasicFileAttributes a) {
        JSObject o = new JSObject();
        o.put("name", p.getFileName().toString());
        o.put("isDir", a.isDirectory());
        o.put("size", a.size());
        o.put("mtime", a.lastModifiedTime().toMillis());
        return o;
    }

    private interface Action {
        void run() throws Exception;
    }

    /** Runs file work and turns any exception into a rejected promise on the web side. */
    private void guard(PluginCall call, Action a) {
        try {
            a.run();
        } catch (NoSuchFileException e) {
            call.reject("Not found: " + e.getFile(), "ENOENT");
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        guard(call, () -> {
            Path dir = resolve(call, "path");
            JSArray entries = new JSArray();
            if (Files.isDirectory(dir)) {
                try (DirectoryStream<Path> s = Files.newDirectoryStream(dir)) {
                    for (Path p : s) {
                        if (p.getFileName().toString().contains(".tmp-")) continue;
                        try {
                            entries.put(info(p, Files.readAttributes(p, BasicFileAttributes.class)));
                        } catch (NoSuchFileException ignored) {
                            // removed while listing
                        }
                    }
                }
            }
            JSObject r = new JSObject();
            r.put("entries", entries);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void stat(PluginCall call) {
        guard(call, () -> {
            Path p = resolve(call, "path");
            JSObject r = new JSObject();
            if (Files.exists(p)) r.put("info", info(p, Files.readAttributes(p, BasicFileAttributes.class)));
            else r.put("info", JSObject.NULL);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void read(PluginCall call) {
        guard(call, () -> {
            byte[] bytes = Files.readAllBytes(resolve(call, "path"));
            JSObject r = new JSObject();
            r.put("text", new String(bytes, StandardCharsets.UTF_8));
            call.resolve(r);
        });
    }

    @PluginMethod
    public void readBase64(PluginCall call) {
        guard(call, () -> {
            byte[] bytes = Files.readAllBytes(resolve(call, "path"));
            JSObject r = new JSObject();
            r.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(r);
        });
    }

    private static void atomicWrite(Path target, byte[] data) throws IOException {
        Files.createDirectories(target.getParent());
        Path tmp = target.resolveSibling(target.getFileName() + ".tmp-" + System.nanoTime());
        try (FileOutputStream out = new FileOutputStream(tmp.toFile())) {
            out.write(data);
            out.getFD().sync();
        }
        try {
            Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            Files.deleteIfExists(tmp);
            throw e;
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        guard(call, () -> {
            atomicWrite(resolve(call, "path"), call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            call.resolve();
        });
    }

    @PluginMethod
    public void writeBase64(PluginCall call) {
        guard(call, () -> {
            atomicWrite(resolve(call, "path"), Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            call.resolve();
        });
    }

    @PluginMethod
    public void move(PluginCall call) {
        guard(call, () -> {
            Path from = resolve(call, "from");
            Path to = resolve(call, "to");
            Files.createDirectories(to.getParent());
            Files.move(from, to); // never replaces an existing file
            call.resolve();
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        guard(call, () -> {
            Path p = resolve(call, "path");
            if (Files.exists(p)) {
                try (Stream<Path> walk = Files.walk(p)) {
                    for (Path x : (Iterable<Path>) walk.sorted(Comparator.reverseOrder())::iterator) {
                        Files.delete(x);
                    }
                }
            }
            call.resolve();
        });
    }
}
