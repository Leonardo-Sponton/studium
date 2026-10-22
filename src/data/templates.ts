import { parse, type Data } from "./frontmatter";
import { safeFileName } from "./school";
import type { Storage } from "../storage/types";

// Templates, like Obsidian's core Templates plugin: Markdown files in templates/ inserted at the
// caret. {{title}}, {{date}}, {{time}} and {{date:DD/MM/YYYY}} / {{time:HH:mm}} are filled in when
// inserted. A template's header (properties) is added to the note's header instead of the text.

export const TEMPLATES = "templates";

export interface Template {
  path: string;
  name: string;
}

export async function listTemplates(s: Storage): Promise<Template[]> {
  const list = await s.list(TEMPLATES);
  return list
    .filter(f => !f.isDir && f.name.endsWith(".md"))
    .map(f => ({ path: `${TEMPLATES}/${f.name}`, name: f.name.slice(0, -3) }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Moment.js-like tokens (as Obsidian uses): YYYY YY MM M DD D HH H mm ss, the rest kept. */
export function formatDate(d: Date, fmt: string): string {
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    YY: String(d.getFullYear()).slice(-2),
    MM: pad(d.getMonth() + 1),
    M: String(d.getMonth() + 1),
    DD: pad(d.getDate()),
    D: String(d.getDate()),
    HH: pad(d.getHours()),
    H: String(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };
  return fmt.replace(/YYYY|YY|MM|M|DD|D|HH|H|mm|ss/g, t => map[t]);
}

/** Fills {{title}}, {{date}}, {{time}}, {{date:FORMAT}}, {{time:FORMAT}}. */
export function fillTemplate(text: string, vars: { title: string; now?: Date }): string {
  const now = vars.now ?? new Date();
  return text.replace(/\{\{\s*(title|date|time)\s*(?::([^}]*))?\}\}/gi, (_m, key: string, fmt?: string) => {
    const k = key.toLowerCase();
    if (k === "title") return vars.title;
    return formatDate(now, fmt?.trim() || (k === "date" ? "YYYY-MM-DD" : "HH:mm"));
  });
}

/** The template filled in: its header (properties) and its text. */
export async function readTemplate(s: Storage, path: string, vars: { title: string; now?: Date }): Promise<{ data: Data; body: string }> {
  const p = parse(fillTemplate(await s.read(path), vars));
  return { data: p.data, body: p.body.replace(/^\n+/, "") };
}

/** Properties from a template added to a header: existing values are kept, empty ones filled. */
export function mergeProperties(header: Data, add: Data): Data {
  const out: Data = {};
  for (const [k, v] of Object.entries(add)) {
    const old = header[k];
    if (old === undefined || old === null || old === "") out[k] = v;
  }
  return out;
}

export async function createTemplate(s: Storage, name: string): Promise<string> {
  const base = safeFileName(name.trim() || "Template").replace(/\.md$/i, "");
  let path = `${TEMPLATES}/${base}.md`;
  for (let i = 2; await s.stat(path); i++) path = `${TEMPLATES}/${base} ${i}.md`;
  await s.write(path, "");
  return path;
}
