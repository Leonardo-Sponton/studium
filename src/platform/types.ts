import type { Storage } from "../storage/types";
import type { Hashes } from "../data/sync";

/** A device seen by `adb devices`. state: "device" (ready), "unauthorized", "offline"… */
export interface Device {
  serial: string;
  state: string;
  model: string;
}

/** PC side of the USB sync (SPEC 6). */
export interface SyncBridge {
  /** adb: false when the adb program was not found. */
  devices(): Promise<{ adb: boolean; list: Device[] }>;
  pcName(): Promise<string>;
  /** Every file of this data folder (the trash left out). */
  localHashes(): Promise<Hashes>;
  deviceHashes(serial: string, dir: string): Promise<Hashes>;
  /** The device's data folder `dir`, as a Storage. */
  deviceStorage(serial: string, dir: string): Storage;
}

// What each launcher (Electron, Android) gives the app besides file access.

export interface Platform {
  name: "electron" | "android" | "memory";
  /** Absolute data folder, or null before the first-run choice. */
  getDataDir(): Promise<string | null>;
  defaultDataDir(): Promise<string>;
  setDataDir(dir: string): Promise<void>;
  /** Native folder picker (desktop). Returns null when canceled or not available. */
  pickFolder?(): Promise<string | null>;
  /** Android "All files access" (see SPEC 2.3). */
  hasFileAccess?(): Promise<boolean>;
  openFileAccessSettings?(): Promise<void>;
  openDataFolder?(): Promise<void>;
  /** PC: opens .studium/snippets in the file manager (CSS snippets). */
  openSnippetsFolder?(): Promise<void>;
  /** PC: font families installed on the system. */
  listFonts?(): Promise<string[]>;
  /** PC: zoom of the whole page (1 = 100 %). Without it the page uses CSS zoom. */
  setZoom?(z: number): Promise<void>;
  /** PC: Ctrl+= / Ctrl+- / Ctrl+0 pressed (kept from the page by the main process). */
  onZoomKey?(cb: (key: string) => void): () => void;
  /** Opens a web link in the system browser (http/https only). */
  openLink?(url: string): Promise<void>;
  /** Opens a file of the data folder in the system's app for its type (assignment files). */
  openFile?(path: string): Promise<void>;
  /** Prints the page (which then shows only the note, see ui/pdf.ts) to a PDF. PC: asks where
   *  to save and gives the file's path (null if canceled). Android: opens the system print
   *  screen ("Save as PDF") and gives null. */
  printPdf?(o: { name: string; pageSize: string; landscape: boolean }): Promise<string | null>;
  /** PC: opens the PDF saved last. */
  openLastPdf?(): Promise<void>;
  /** Saves a backup .zip outside the data folder. Returns where it went, or null if canceled. */
  saveBackup?(name: string, data: Uint8Array): Promise<string | null>;
  storage: Storage;
  /** Desktop: USB sync with Android devices. */
  sync?: SyncBridge;
  /** Calls back when a file changes outside the app. Returns a function that stops it. */
  onFileChanged?(cb: (path: string) => void): () => void;
  /** Desktop: the window is closing; `flush` writes unsaved edits first. */
  onClosing?(flush: () => Promise<void>): void;
  /** Android: opens the keyboard for the focused field (focus() alone does not without a tap). */
  showKeyboard?(): Promise<void>;
  /** Android: the app came back to the front (files may have changed meanwhile, e.g. by sync). */
  onResume?(cb: () => void): () => void;
  /** Android: a home-screen shortcut asks to open a place in the app (ui/Shell OpenRequest). */
  onOpenRequest?(cb: (target: string) => void): () => void;
  /** Android: the back button or back swipe. Returns a function that stops it. */
  onBackButton?(cb: () => void): () => void;
  /** Android: leaves the app (sends it to the background, as Android does by default). */
  leaveApp?(): Promise<void>;
}
