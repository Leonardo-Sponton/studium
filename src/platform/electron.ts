import type { FileInfo, Storage } from "../storage/types";
import type { Device, Platform, SyncBridge } from "./types";

// Functions exposed by electron/preload.cjs.
interface StudiumBridge {
  config: {
    get(): Promise<{ dataDir: string | null; defaultDataDir: string }>;
    setDataDir(dir: string): Promise<string>;
  };
  pickFolder(): Promise<string | null>;
  openFolder(): Promise<void>;
  openSnippets(): Promise<void>;
  listFonts(): Promise<string[]>;
  printPdf(o: { name: string; pageSize: string; landscape: boolean }): Promise<string | null>;
  openLastPdf(): Promise<void>;
  setZoom(z: number): void;
  onZoomKey(cb: (key: string) => void): () => void;
  openLink(url: string): Promise<void>;
  openFile(path: string): Promise<void>;
  saveBackup(name: string, data: Uint8Array): Promise<string | null>;
  sync: {
    devices(): Promise<{ adb: boolean; list: Device[] }>;
    pcName(): Promise<string>;
    localHashes(): Promise<Record<string, string>>;
    deviceHashes(serial: string, dir: string): Promise<Record<string, string>>;
    /** The same functions as `fs`, with the device serial and folder first. */
    fs: Record<keyof Storage, (serial: string, dir: string, ...args: any[]) => Promise<any>>;
  };
  fs: {
    list(dir: string): Promise<FileInfo[]>;
    stat(path: string): Promise<FileInfo | null>;
    read(path: string): Promise<string>;
    readBinary(path: string): Promise<Uint8Array>;
    write(path: string, text: string): Promise<void>;
    writeBinary(path: string, data: Uint8Array): Promise<void>;
    move(from: string, to: string): Promise<void>;
    remove(path: string): Promise<void>;
  };
  onFileChanged(cb: (path: string) => void): () => void;
  onClosing(flush: () => Promise<void>): void;
}

declare global {
  interface Window {
    studium?: StudiumBridge;
  }
}

export function isElectron() {
  return !!window.studium;
}

function syncBridge(b: StudiumBridge): SyncBridge {
  const map = (o: Record<string, string>) => new Map(Object.entries(o));
  return {
    devices: () => b.sync.devices(),
    pcName: () => b.sync.pcName(),
    localHashes: async () => map(await b.sync.localHashes()),
    deviceHashes: async (serial, dir) => map(await b.sync.deviceHashes(serial, dir)),
    deviceStorage: (serial, dir) => {
      const f = b.sync.fs;
      return {
        list: p => f.list(serial, dir, p),
        stat: p => f.stat(serial, dir, p),
        read: p => f.read(serial, dir, p),
        readBinary: p => f.readBinary(serial, dir, p),
        write: (p, text) => f.write(serial, dir, p, text),
        writeBinary: (p, data) => f.writeBinary(serial, dir, p, data),
        move: (from, to) => f.move(serial, dir, from, to),
        remove: p => f.remove(serial, dir, p),
      };
    },
  };
}

export function electronPlatform(): Platform {
  const b = window.studium!;
  const storage: Storage = { ...b.fs };
  return {
    name: "electron",
    storage,
    getDataDir: async () => (await b.config.get()).dataDir,
    defaultDataDir: async () => (await b.config.get()).defaultDataDir,
    setDataDir: async dir => void (await b.config.setDataDir(dir)),
    pickFolder: () => b.pickFolder(),
    openDataFolder: () => b.openFolder(),
    openLink: url => b.openLink(url),
    openSnippetsFolder: () => b.openSnippets(),
    listFonts: () => b.listFonts(),
    printPdf: o => b.printPdf(o),
    openLastPdf: () => b.openLastPdf(),
    setZoom: async z => b.setZoom(z),
    onZoomKey: cb => b.onZoomKey(cb),
    openFile: path => b.openFile(path),
    onFileChanged: cb => b.onFileChanged(cb),
    onClosing: flush => b.onClosing(flush),
    saveBackup: (name, data) => b.saveBackup(name, data),
    sync: syncBridge(b),
  };
}
