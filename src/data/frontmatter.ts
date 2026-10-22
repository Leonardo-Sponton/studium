import { Document, isMap, parseDocument, Scalar } from "yaml";

// A Markdown file with a YAML header ("frontmatter") between two "---" lines.
// The header is kept as a YAML Document so that keys the app does not know, their order and
// comments survive a save untouched (SPEC 3.1: hand edits are never lost).

export type Data = Record<string, unknown>;

export interface Parsed {
  data: Data;
  body: string;
  doc: Document;
  /** The header text exactly as read, used when nothing in it changes. */
  raw?: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n?---[ \t]*(?:\r?\n|$)/;

export function parse(text: string): Parsed {
  const m = FENCE.exec(text);
  if (!m) return { data: {}, body: text, doc: new Document({}) };
  const doc = parseDocument(m[1]);
  // A broken header must not lose the file: treat the whole text as body.
  if (doc.errors.length || !(isMap(doc.contents) || doc.contents === null)) {
    return { data: {}, body: text, doc: new Document({}) };
  }
  if (doc.contents === null) doc.contents = doc.createNode({}) as never;
  return { data: (doc.toJS() ?? {}) as Data, body: text.slice(m[0].length), doc, raw: m[0] };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Builds the file text. `data` is the full wished header: keys missing from it are removed,
 * changed keys are updated in place, untouched keys keep their original formatting.
 * Keys with value undefined are removed too.
 */
/** Times like 17:00 are quoted: older YAML readers take them for numbers (base 60). */
function node(value: unknown): unknown {
  if (typeof value !== "string" || !/^\d+(:\d+)+$/.test(value)) return value;
  const s = new Scalar(value);
  s.type = Scalar.QUOTE_DOUBLE;
  return s;
}

export function stringify(data: Data, body: string, original?: { doc: Document; raw?: string }): string {
  const doc = original ? (original.doc.clone() as Document) : new Document({});
  const old = (doc.toJS() ?? {}) as Data;
  const clean = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
  if (original?.raw && same(Object.keys(old), Object.keys(clean)) && same(old, clean)) return original.raw + body;
  for (const key of Object.keys(old)) {
    if (!(key in data) || data[key] === undefined) doc.delete(key);
  }
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (!(key in old) || !same(old[key], value)) doc.set(key, node(value));
  }
  const yaml = Object.keys(data).some(k => data[k] !== undefined)
    ? doc.toString({ lineWidth: 0, flowCollectionPadding: false })
    : "";
  return `---\n${yaml}---\n${body}`;
}

/** The text of the first "# " heading, or "" when there is none. */
export function titleOf(body: string): string {
  const m = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(body);
  return m ? m[1].trim() : "";
}

/** What a list row shows: the title, or else the first line without Markdown symbols. */
export function previewOf(body: string): string {
  const t = titleOf(body);
  if (t) return t;
  const first = body.split("\n").find(l => l.trim()) ?? "";
  return first.replace(/^\s*(#+|>|[-*+]( \[[ xX]\])?|\d+\.)\s*/, "").replace(/[*_~`]/g, "").trim();
}

/** Replaces (or adds) the first "# " heading. */
export function withTitle(body: string, title: string): string {
  const line = `# ${title.trim()}`;
  if (/^#[ \t]+.*$/m.test(body)) return body.replace(/^#[ \t]+.*$/m, line);
  return body ? `${line}\n\n${body}` : `${line}\n`;
}
