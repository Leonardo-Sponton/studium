// The only way the app touches files. Each platform (Electron, Android, tests) implements it.
// All paths are relative to the data folder and use "/" as separator.

export interface FileInfo {
  name: string;
  isDir: boolean;
  size: number;
  mtime: number; // last modification, milliseconds since epoch
}

export interface Storage {
  /** Entries of a folder. A missing folder gives an empty list. */
  list(dir: string): Promise<FileInfo[]>;
  /** Info about one path, or null when it does not exist. */
  stat(path: string): Promise<FileInfo | null>;
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  /** Atomic: writes a temp file, then renames it. Creates parent folders. */
  write(path: string, text: string): Promise<void>;
  writeBinary(path: string, data: Uint8Array): Promise<void>;
  /** Rename or move a file or folder. Creates the target's parent folders. */
  move(from: string, to: string): Promise<void>;
  /** Delete a file, or a folder with everything inside. */
  remove(path: string): Promise<void>;
  /** External changes (desktop only). Returns a function that stops watching. */
  watch?(onChange: (path: string) => void): () => void;
}

export function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function joinPath(...parts: string[]): string {
  return parts.filter(Boolean).join("/").replace(/\/+/g, "/");
}

/** Rejects absolute paths and ".." so a path can never leave the data folder. */
export function checkPath(path: string): string {
  if (path.startsWith("/") || path.split("/").some(p => p === ".." || p === ".")) {
    throw new Error(`Invalid path: ${path}`);
  }
  return path.replace(/\/+$/, "");
}
