import { App } from "@capacitor/app";
import { t } from "../i18n";
import { registerPlugin } from "@capacitor/core";
import type { FileInfo, Storage } from "../storage/types";
import type { Platform } from "./types";

// Native side: android/app/src/main/java/.../StudiumFilesPlugin.java
interface StudiumFiles {
  hasAccess(): Promise<{ granted: boolean }>;
  openAccessSettings(): Promise<void>;
  openAppSettings(): Promise<void>;
  storageRoot(): Promise<{ path: string }>;
  list(o: { root: string; path: string }): Promise<{ entries: FileInfo[] }>;
  stat(o: { root: string; path: string }): Promise<{ info: FileInfo | null }>;
  read(o: { root: string; path: string }): Promise<{ text: string }>;
  readBase64(o: { root: string; path: string }): Promise<{ data: string }>;
  write(o: { root: string; path: string; text: string }): Promise<void>;
  writeBase64(o: { root: string; path: string; data: string }): Promise<void>;
  move(o: { root: string; from: string; to: string }): Promise<void>;
  remove(o: { root: string; path: string }): Promise<void>;
  showKeyboard(): Promise<void>;
  openLink(o: { url: string }): Promise<void>;
  printPage(o: { name: string; pageSize: string; landscape: boolean }): Promise<void>;
  openFile(o: { root: string; path: string }): Promise<void>;
  addListener(event: "printDone", cb: () => void): Promise<{ remove(): Promise<void> }>;
  addListener(event: "open", cb: (e: { target: string }) => void): Promise<{ remove(): Promise<void> }>;
}

const Native = registerPlugin<StudiumFiles>("StudiumFiles");
const KEY = "studium.dataDir";

function toBase64(data: Uint8Array) {
  let s = "";
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function androidPlatform(): Platform {
  // The folder is a per-device choice, so it is kept in the WebView's own storage.
  const root = () => {
    const r = localStorage.getItem(KEY);
    if (!r) throw new Error(t.errors.noDataFolder);
    return r;
  };
  const storage: Storage = {
    list: async path => (await Native.list({ root: root(), path })).entries,
    stat: async path => (await Native.stat({ root: root(), path })).info,
    read: async path => (await Native.read({ root: root(), path })).text,
    readBinary: async path => fromBase64((await Native.readBase64({ root: root(), path })).data),
    write: (path, text) => Native.write({ root: root(), path, text }),
    writeBinary: (path, data) => Native.writeBase64({ root: root(), path, data: toBase64(data) }),
    move: (from, to) => Native.move({ root: root(), from, to }),
    remove: path => Native.remove({ root: root(), path }),
  };
  return {
    name: "android",
    storage,
    getDataDir: async () => localStorage.getItem(KEY),
    defaultDataDir: async () => `${(await Native.storageRoot()).path}/Documents/Studium`,
    setDataDir: async dir => localStorage.setItem(KEY, dir.replace(/\/+$/, "")),
    hasFileAccess: async () => (await Native.hasAccess()).granted,
    openFileAccessSettings: () => Native.openAccessSettings(),
    // Backups go to the phone's Download folder, outside the data folder.
    saveBackup: async (name, data) => {
      const dir = `${(await Native.storageRoot()).path}/Download`;
      await Native.writeBase64({ root: dir, path: name, data: toBase64(data) });
      return `${dir}/${name}`;
    },
    showKeyboard: () => Native.showKeyboard(),
    openLink: url => Native.openLink({ url }),
    // Resolves when the print screen closes (the page keeps the note until then).
    printPdf: async o => {
      let stop: (() => void) | undefined;
      const done = new Promise<void>(r => {
        const handle = Native.addListener("printDone", () => r());
        stop = () => void handle.then(h => h.remove());
      });
      try {
        await Native.printPage({ name: o.name, pageSize: o.pageSize, landscape: o.landscape });
        await done;
      } finally {
        stop?.();
      }
      return null;
    },
    openFile: path => Native.openFile({ root: root(), path }),
    onResume: cb => {
      const on = () => document.visibilityState === "visible" && cb();
      document.addEventListener("visibilitychange", on);
      return () => document.removeEventListener("visibilitychange", on);
    },
    onOpenRequest: cb => {
      const handle = Native.addListener("open", e => cb(e.target));
      return () => void handle.then(h => h.remove());
    },
    // With a listener, Capacitor no longer closes the app on back; the app decides (ui/useBack).
    onBackButton: cb => {
      const handle = App.addListener("backButton", cb);
      return () => void handle.then(h => h.remove());
    },
    leaveApp: () => App.minimizeApp(),
  };
}
