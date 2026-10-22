import { addFile, safeFileName } from "./school";
import { walkFiles, isHidden } from "./files";
import { baseName, parentOf, type Storage } from "../storage/types";

// Pictures and files kept beside the notes, as Obsidian does: pasted or dropped into a note they
// go to attachments/ ("Pasted image 20261018214500.png") and the note gets ![[that name]].
// ![[name]] finds a file by name: next to the note, in attachments/, or anywhere in the folder.

export const ATTACHMENTS = "attachments";

const pad = (n: number) => String(n).padStart(2, "0");

/** "Pasted image 20261018214500.png", like Obsidian names pasted pictures. */
export function pastedName(type: string, at = new Date()): string {
  const ext = { "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg" }[type] ?? "png";
  const s = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return `Pasted image ${s}.${ext}`;
}

/** Saves a file in attachments/ (a new name when taken) and gives the name to embed. */
export async function saveAttachment(s: Storage, name: string, type: string, data: Uint8Array): Promise<string> {
  // Pictures from the clipboard come as "image.png": give them a dated name.
  const plain = !name || /^image\.\w+$/i.test(name);
  const path = await addFile(s, ATTACHMENTS, plain ? pastedName(type) : safeFileName(name), data);
  indexes.delete(s);
  return baseName(path);
}

// ---- Finding a file by the name written in a note ----

/** Every file of the folder by lowercase name (built once, rebuilt when a name is not found). */
const indexes = new WeakMap<Storage, { at: number; byName: Map<string, string> }>();

async function index(s: Storage, fresh: boolean) {
  const old = indexes.get(s);
  if (old && !(fresh && Date.now() - old.at > 20_000)) return old.byName;
  const byName = new Map<string, string>();
  for (const p of await walkFiles(s, "", p => isHidden(p))) {
    if (p.endsWith(".md")) continue;
    const key = baseName(p).toLowerCase();
    if (!byName.has(key) || p.startsWith(`${ATTACHMENTS}/`)) byName.set(key, p);
  }
  indexes.set(s, { at: Date.now(), byName });
  return byName;
}

/** Where `name` is ("a.png", "imgs/a.png", "../a.png"), looking from the note at `from`; null when nowhere. */
export async function findAttachment(s: Storage, name: string, from?: string): Promise<string | null> {
  const clean = name.replace(/^\.\//, "").replace(/^\/+/, "");
  const dir = from ? parentOf(from) : "";
  const tries = [joinUp(dir, clean), `${ATTACHMENTS}/${clean}`, dir && `${dir}/${ATTACHMENTS}/${clean}`, clean].filter((p): p is string => !!p);
  for (const p of new Set(tries)) {
    try {
      if ((await s.stat(p))?.isDir === false) return p;
    } catch {
      // Not a valid path: try the next one.
    }
  }
  const key = baseName(clean).toLowerCase();
  return (await index(s, false)).get(key) ?? (await index(s, true)).get(key) ?? null;
}

/** "notes/x" + "../a.png" → "a.png"; null when it leaves the folder. */
function joinUp(dir: string, rel: string): string | null {
  const parts = dir ? dir.split("/") : [];
  for (const p of rel.split("/")) {
    if (p === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else if (p && p !== ".") parts.push(p);
  }
  return parts.join("/");
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  avif: "image/avif",
};

const urls = new Map<string, { size: number; mtime: number; url: string }>();

/** A picture of the data folder as an object URL (kept while the file does not change). */
export async function imageURL(s: Storage, path: string): Promise<string | null> {
  const info = await s.stat(path);
  if (!info || info.isDir) return null;
  const old = urls.get(path);
  if (old && old.size === info.size && old.mtime === info.mtime) return old.url;
  const data = await s.readBinary(path);
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: MIME[ext] ?? "application/octet-stream" }));
  if (old) URL.revokeObjectURL(old.url);
  urls.set(path, { size: info.size, mtime: info.mtime, url });
  return url;
}
