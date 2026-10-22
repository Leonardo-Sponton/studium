import type { Notes } from "./notes";
import { addDays, isoDate } from "./dates";
import { areaOf, isHidden, walkFiles } from "./files";
import { previewOf, titleOf } from "./frontmatter";

// Global search (SPEC 4.4): a plain scan of every note, ignoring accents and case.
// Fast enough for thousands of short files; a real index (MiniSearch) only if it ever is not.

export interface Doc {
  path: string;
  area: string;
  title: string;
  body: string;
  /** Last change (2026-10-17 or 2026-10-17T21:52), from the header. */
  date: string;
  folded: string;
  /** folded[i] came from body[map[i]]. */
  map: number[];
  foldedTitle: string;
}

export interface Hit {
  doc: Doc;
  /** A piece of the body around the first match, split so the match can be highlighted. */
  snippet: { before: string; match: string; after: string } | null;
}

export type Since = "any" | "week" | "month" | "year";

/** Lowercase without accents, remembering where each folded character came from. */
export function fold(text: string): { folded: string; map: number[] } {
  let folded = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // Plain ASCII (most of any text, and all of code) needs no accent folding.
    if (c < 128) {
      folded += c >= 65 && c <= 90 ? String.fromCharCode(c + 32) : text[i];
      map.push(i);
      continue;
    }
    const f = text[i].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    folded += f;
    for (let k = 0; k < f.length; k++) map.push(i);
  }
  return { folded, map };
}

const plain = (text: string) => fold(text).folded;

export async function loadDocs(notes: Notes): Promise<Doc[]> {
  const paths = (await walkFiles(notes.storage, "", p => isHidden(p))).filter(p => p.endsWith(".md") && !isHidden(p));
  const docs: Doc[] = [];
  for (const path of paths) {
    try {
      const n = await notes.load(path);
      // Books keep title and author in the header (SPEC 3.3).
      const title =
        n.data.type === "book" ? [n.data.title, n.data.author].filter(Boolean).join(" · ") : previewOf(n.body);
      // The "# Title" line is searched as the title; the snippet shows the rest.
      const body = titleOf(n.body) ? n.body.replace(/^#[ \t]+.*$/m, "").trim() : n.body;
      const date = String(n.data.modified ?? n.data.created ?? "");
      docs.push({ path, area: areaOf(path), title, body, date, ...fold(body), foldedTitle: plain(title) });
    } catch {
      /* unreadable files are skipped */
    }
  }
  return docs;
}

export function sinceDate(since: Since, today = new Date()): string {
  const days = { any: 0, week: 7, month: 31, year: 366 }[since];
  return days ? isoDate(addDays(today, -days)) : "";
}

/**
 * Every doc that has all the words of the query. Title matches come first, then the newest.
 * `area` "" means all areas.
 */
export function search(docs: Doc[], query: string, opts: { area?: string; since?: Since; today?: Date } = {}): Hit[] {
  const words = plain(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const from = sinceDate(opts.since ?? "any", opts.today);
  const hits: { hit: Hit; score: number }[] = [];
  for (const doc of docs) {
    if (opts.area && doc.area !== opts.area) continue;
    if (from && doc.date.slice(0, 10) < from) continue;
    if (!words.every(w => doc.foldedTitle.includes(w) || doc.folded.includes(w))) continue;
    const score = words.filter(w => doc.foldedTitle.includes(w)).length;
    hits.push({ hit: { doc, snippet: snippet(doc, words) }, score });
  }
  return hits
    .sort((a, b) => b.score - a.score || b.hit.doc.date.localeCompare(a.hit.doc.date))
    .map(h => h.hit);
}

const AROUND = 60;

function snippet(doc: Doc, words: string[]): Hit["snippet"] {
  let at = -1;
  let word = "";
  for (const w of words) {
    const i = doc.folded.indexOf(w);
    if (i >= 0 && (at < 0 || i < at)) [at, word] = [i, w];
  }
  if (at < 0) return null;
  const start = doc.map[at];
  const end = doc.map[at + word.length - 1] + 1;
  let from = Math.max(0, start - AROUND);
  let to = Math.min(doc.body.length, end + AROUND);
  // Cut at spaces so words stay whole.
  const sp1 = doc.body.indexOf(" ", from);
  if (from > 0 && sp1 >= 0 && sp1 < start) from = sp1 + 1;
  const sp2 = doc.body.lastIndexOf(" ", to);
  if (to < doc.body.length && sp2 > end) to = sp2;
  const flat = (s: string) => s.replace(/\s+/g, " ");
  return {
    before: (from > 0 ? "…" : "") + flat(doc.body.slice(from, start)).trimStart(),
    match: doc.body.slice(start, end),
    after: flat(doc.body.slice(end, to)).trimEnd() + (to < doc.body.length ? "…" : ""),
  };
}
