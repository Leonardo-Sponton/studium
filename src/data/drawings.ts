import LZString from "lz-string";
import { baseName, type Storage } from "../storage/types";
import { walkFiles, isHidden } from "./files";
import { findAttachment, saveAttachment } from "./attachments";

// Drawings made with Excalidraw (MIT, the editor itself), saved the way the Obsidian Excalidraw
// plugin saves them (own code; the plugin is AGPL, only its file format is followed), so the
// same files open in both: drawings/<name>.excalidraw.md with a "## Text Elements" list (the
// words of the drawing, which search finds) and the scene as LZ-String compressed JSON. Pictures
// inside a drawing are files in attachments/, listed under "## Embedded Files". A note shows a
// drawing with ![[name.excalidraw]], as in Obsidian.

export const DRAWINGS = "drawings";
export const DRAWING_EXT = ".excalidraw.md";

/** Excalidraw scene parts kept in the file (elements and files are Excalidraw's own objects). */
export interface Scene {
  elements: any[];
  appState: Record<string, unknown>;
  files: Record<string, { id: string; mimeType: string; dataURL: string; created: number }>;
}

export interface DrawingFile {
  scene: Scene;
  /** fileId → "[[Pasted Image.png]]" (pictures stored beside, as the plugin does). */
  embedded: Record<string, string>;
  /** The YAML front matter as written, kept when saving again. */
  front: string;
}

export const isDrawingPath = (p: string) => /\.excalidraw(\.md)?$/i.test(p);

/** "drawings/Drawing 2026-10-18 10.00.00.excalidraw.md" → "Drawing 2026-10-18 10.00.00". */
export const drawingTitle = (p: string) => baseName(p).replace(/\.md$/i, "").replace(/\.excalidraw$/i, "");

const pad = (n: number) => String(n).padStart(2, "0");

/** "Drawing 2026-10-18 21.45.00", the plugin's default name. */
export const drawingName = (at = new Date()) =>
  `Drawing ${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}.${pad(at.getMinutes())}.${pad(at.getSeconds())}`;

/** What a note writes to show the drawing: ![[Drawing ….excalidraw]]. */
export const drawingEmbed = (path: string) => `![[${baseName(path).replace(/\.md$/i, "")}]]`;

const FRONT = "---\n\nexcalidraw-plugin: parsed\ntags: [excalidraw]\n\n---";
const WARNING =
  "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠== You can decompress Drawing data with the command palette: 'Decompress current Excalidraw file'. For more info check in plugin settings under 'Saving'";

const emptyScene = (): Scene => ({ elements: [], appState: {}, files: {} });

/** Reads a .excalidraw.md file (or a plain .excalidraw JSON file from excalidraw.com). */
export function parseDrawing(text: string): DrawingFile {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return { scene: sceneOf(JSON.parse(trimmed)), embedded: {}, front: FRONT };
  const front = /^---\n[\s\S]*?\n---/.exec(text)?.[0] ?? FRONT;
  const embedded: Record<string, string> = {};
  const files = sectionText(text, "## Embedded Files");
  for (const m of files.matchAll(/^([0-9a-f]{20,64}|[\w-]{8,64}): (.+)$/gim)) embedded[m[1]] = m[2].trim();
  const at = text.lastIndexOf("## Drawing");
  const block = /```(compressed-json|json)\n([\s\S]*?)\n```/.exec(at < 0 ? text : text.slice(at));
  if (!block) return { scene: emptyScene(), embedded, front };
  const json = block[1] === "compressed-json" ? LZString.decompressFromBase64(block[2].replace(/\s+/g, "")) : block[2];
  if (!json) throw new Error("The drawing data could not be read");
  return { scene: sceneOf(JSON.parse(json)), embedded, front };
}

function sceneOf(data: any): Scene {
  return { elements: Array.isArray(data?.elements) ? data.elements : [], appState: data?.appState ?? {}, files: data?.files ?? {} };
}

/** The text of a "## Section" up to the next heading or "%%". */
function sectionText(text: string, head: string) {
  const at = text.indexOf(`${head}\n`);
  if (at < 0) return "";
  const rest = text.slice(at + head.length + 1);
  const end = rest.search(/^(#{1,2} |%%)/m);
  return end < 0 ? rest : rest.slice(0, end);
}

/** LZ-String base64, in lines of 256 characters with a blank line between (as the plugin writes). */
export function compressScene(json: string) {
  const all = LZString.compressToBase64(json);
  const lines: string[] = [];
  for (let i = 0; i < all.length; i += 256) lines.push(all.slice(i, i + 256));
  return lines.join("\n\n");
}

/** The file text for a scene. Pictures must already be saved (`embedded` has them). */
export function serializeDrawing(d: DrawingFile): string {
  const live = d.scene.elements.filter(e => !e.isDeleted);
  const texts = live.filter(e => e.type === "text" && (e.originalText ?? e.text));
  const links = live.filter(e => typeof e.link === "string" && e.link);
  const parts = [d.front || FRONT, WARNING, "", "", "# Excalidraw Data", "", "## Text Elements"];
  for (const e of texts) parts.push(`${e.originalText ?? e.text} ^${e.id}`, "");
  if (links.length) {
    parts.push("## Element Links");
    for (const e of links) parts.push(`${e.id}: ${e.link}`, "");
  }
  const used = new Set(live.filter(e => e.fileId).map(e => e.fileId));
  const files = Object.entries(d.embedded).filter(([id]) => used.has(id));
  if (files.length) {
    parts.push("## Embedded Files");
    for (const [id, link] of files) parts.push(`${id}: ${link}`, "");
  }
  // The pictures themselves are in their own files: the JSON keeps only their ids.
  const json = JSON.stringify({ type: "excalidraw", version: 2, source: "studium", elements: live, appState: d.scene.appState, files: {} }, null, "\t");
  parts.push("%%", "## Drawing", "```compressed-json", compressScene(json), "```", "%%");
  return parts.join("\n") + "\n";
}

export const newDrawingText = () => serializeDrawing({ scene: emptyScene(), embedded: {}, front: FRONT });

// ---- Files ----

export interface DrawingInfo {
  path: string;
  title: string;
  modified: number;
}

/** The drawings in drawings/ (and its folders), newest change first. */
export async function listDrawings(s: Storage): Promise<DrawingInfo[]> {
  const out: DrawingInfo[] = [];
  for (const p of await walkFiles(s, DRAWINGS)) {
    if (!p.toLowerCase().endsWith(DRAWING_EXT)) continue;
    const st = await s.stat(p);
    out.push({ path: p, title: drawingTitle(p), modified: st?.mtime ?? 0 });
  }
  return out.sort((a, b) => b.modified - a.modified);
}

/** A free drawings/<name>.excalidraw.md path. */
async function freePath(s: Storage, name: string) {
  const clean = name.replace(/[\\/:*?"<>|\n\r\t]/g, "-").replace(/^\.+/, "").trim() || drawingName();
  let p = `${DRAWINGS}/${clean}${DRAWING_EXT}`;
  for (let i = 2; await s.stat(p); i++) p = `${DRAWINGS}/${clean} (${i})${DRAWING_EXT}`;
  return p;
}

export async function createDrawing(s: Storage, name = drawingName()): Promise<string> {
  const p = await freePath(s, name);
  await s.write(p, newDrawingText());
  index.delete(s);
  return p;
}

export async function renameDrawing(s: Storage, path: string, name: string): Promise<string> {
  if (name.trim() === drawingTitle(path)) return path;
  const to = await freePath(s, name);
  await s.move(path, to);
  index.delete(s);
  return to;
}

/** Every drawing of the folder by the names a note may use for it (built once, rebuilt on a miss). */
const index = new WeakMap<Storage, { at: number; byName: Map<string, string> }>();

async function drawingIndex(s: Storage, fresh: boolean) {
  const old = index.get(s);
  if (old && !(fresh && Date.now() - old.at > 5_000)) return old.byName;
  const byName = new Map<string, string>();
  for (const p of await walkFiles(s, "", p => isHidden(p))) {
    if (!isDrawingPath(p)) continue;
    const lower = p.toLowerCase();
    const keys = [lower, lower.replace(/\.md$/, ""), baseName(lower), baseName(lower).replace(/\.md$/, ""), drawingTitle(lower)];
    for (const k of keys) if (!byName.has(k) || p.startsWith(`${DRAWINGS}/`)) byName.set(k, p);
  }
  index.set(s, { at: Date.now(), byName });
  return byName;
}

/** The drawing a note means by `name` ("Drawing x.excalidraw", "Excalidraw/JDBC", "x.excalidraw.md"), or null. */
export async function findDrawing(s: Storage, name: string): Promise<string | null> {
  const key = name.trim().replace(/^\/+/, "").toLowerCase();
  if (!key) return null;
  const look = (m: Map<string, string>) => m.get(key) ?? m.get(baseName(key)) ?? m.get(baseName(key).replace(/\.md$/, "").replace(/\.excalidraw$/, ""));
  return look(await drawingIndex(s, false)) ?? look(await drawingIndex(s, true)) ?? null;
}

export const forgetDrawingIndex = (s: Storage) => index.delete(s);

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp" };
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/bmp": "bmp" };

/** "[[Pasted Image.png|100%]]" → "Pasted Image.png"; null for formulas, URLs and the like. */
export function embeddedName(link: string): string | null {
  const m = /^!?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/.exec(link.trim());
  return m ? m[1].trim() : null;
}

const toBase64 = (data: Uint8Array) => {
  let bin = "";
  for (let i = 0; i < data.length; i += 0x8000) bin += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** Reads a drawing with its pictures (as data URLs, the form Excalidraw takes). */
export async function loadDrawing(s: Storage, path: string): Promise<DrawingFile> {
  const d = parseDrawing(await s.read(path));
  for (const [id, link] of Object.entries(d.embedded)) {
    if (d.scene.files[id]) continue;
    const name = embeddedName(link);
    const at = name && (await findAttachment(s, name, path));
    if (!at) continue;
    const ext = at.slice(at.lastIndexOf(".") + 1).toLowerCase();
    const mimeType = MIME[ext] ?? "image/png";
    d.scene.files[id] = { id, mimeType, dataURL: `data:${mimeType};base64,${toBase64(await s.readBinary(at))}`, created: Date.now() };
  }
  return d;
}

/** Writes a drawing: new pictures go to attachments/ first. */
export async function saveDrawing(s: Storage, path: string, d: DrawingFile): Promise<void> {
  const used = new Set(d.scene.elements.filter(e => !e.isDeleted && e.fileId).map(e => e.fileId as string));
  for (const id of used) {
    if (d.embedded[id]) continue;
    const f = d.scene.files[id];
    const m = f && /^data:([^;]+);base64,(.*)$/.exec(f.dataURL);
    if (!m) continue;
    const bytes = Uint8Array.from(atob(m[2]), ch => ch.charCodeAt(0));
    const name = await saveAttachment(s, `Pasted Image ${id.slice(0, 8)}.${EXT[m[1]] ?? "png"}`, m[1], bytes);
    d.embedded[id] = `[[${name}]]`;
  }
  await s.write(path, serializeDrawing(d));
}

// ---- Import from an Obsidian vault ----

export interface PickedFile {
  /** Path inside the picked folder ("Excalidraw/Drawing x.excalidraw.md"), or the bare name. */
  path: string;
  read(): Promise<Uint8Array>;
}

/** Copies the vault's drawings into drawings/ with the pictures they use (to attachments/).
 *  Drawings whose name is taken are left out, never overwritten. */
export async function importDrawings(s: Storage, picked: PickedFile[]): Promise<{ added: string[]; skipped: string[] }> {
  const byName = new Map(picked.map(f => [baseName(f.path).toLowerCase(), f]));
  const added: string[] = [];
  const skipped: string[] = [];
  for (const f of picked) {
    if (!isDrawingPath(f.path) || f.path.split("/").some(p => p.startsWith("."))) continue;
    const title = drawingTitle(f.path);
    const to = `${DRAWINGS}/${title}${DRAWING_EXT}`;
    if (await s.stat(to)) {
      skipped.push(title);
      continue;
    }
    const text = new TextDecoder().decode(await f.read());
    let d: DrawingFile;
    try {
      d = parseDrawing(text);
    } catch {
      skipped.push(title);
      continue;
    }
    for (const link of Object.values(d.embedded)) {
      const name = embeddedName(link);
      const src = name && byName.get(baseName(name).toLowerCase());
      if (!src || (await findAttachment(s, baseName(name!)))) continue;
      const data = await src.read();
      const ext = name!.slice(name!.lastIndexOf(".") + 1).toLowerCase();
      await saveAttachment(s, baseName(name!), MIME[ext] ?? "application/octet-stream", data);
    }
    // A .md drawing is copied as it is; a plain .excalidraw (JSON) is turned into one.
    await s.write(to, /\.md$/i.test(f.path) ? text : serializeDrawing(d));
    added.push(title);
  }
  index.delete(s);
  return { added, skipped };
}
