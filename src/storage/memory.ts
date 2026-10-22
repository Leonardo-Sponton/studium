import { checkPath, type FileInfo, type Storage } from "./types";

// Storage kept in a Map. Used by the automated tests so they never touch real files.
export class MemoryStorage implements Storage {
  files = new Map<string, { data: Uint8Array; mtime: number }>();
  private last = 0;

  private now() {
    this.last = Math.max(Date.now(), this.last + 1); // strictly increasing, even within one millisecond
    return this.last;
  }

  async list(dir: string): Promise<FileInfo[]> {
    const prefix = dir ? checkPath(dir) + "/" : "";
    const out = new Map<string, FileInfo>();
    for (const [path, f] of this.files) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash < 0) out.set(rest, { name: rest, isDir: false, size: f.data.length, mtime: f.mtime });
      else {
        const name = rest.slice(0, slash);
        if (!out.has(name)) out.set(name, { name, isDir: true, size: 0, mtime: 0 });
      }
    }
    return [...out.values()];
  }

  async stat(path: string): Promise<FileInfo | null> {
    path = checkPath(path);
    const f = this.files.get(path);
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (f) return { name, isDir: false, size: f.data.length, mtime: f.mtime };
    for (const p of this.files.keys()) if (p.startsWith(path + "/")) return { name, isDir: true, size: 0, mtime: 0 };
    return null;
  }

  async read(path: string) {
    return new TextDecoder().decode(await this.readBinary(path));
  }

  async readBinary(path: string) {
    const f = this.files.get(checkPath(path));
    if (!f) throw new Error(`Not found: ${path}`);
    return f.data;
  }

  async write(path: string, text: string) {
    await this.writeBinary(path, new TextEncoder().encode(text));
  }

  async writeBinary(path: string, data: Uint8Array) {
    this.files.set(checkPath(path), { data: data.slice(), mtime: this.now() });
  }

  async move(from: string, to: string) {
    from = checkPath(from);
    to = checkPath(to);
    const moved = [...this.files].filter(([p]) => p === from || p.startsWith(from + "/"));
    if (!moved.length) throw new Error(`Not found: ${from}`);
    for (const [p, f] of moved) {
      this.files.delete(p);
      this.files.set(to + p.slice(from.length), f);
    }
  }

  async remove(path: string) {
    path = checkPath(path);
    for (const p of [...this.files.keys()]) if (p === path || p.startsWith(path + "/")) this.files.delete(p);
  }
}
