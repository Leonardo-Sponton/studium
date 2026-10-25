import { addDays, isoDate, slugify } from "./dates";
import { parse } from "./frontmatter";
import type { Notes } from "./notes";
import { findAttachment, saveAttachment } from "./attachments";
import { importDrawings, isDrawingPath, type PickedFile } from "./drawings";
import { baseName } from "../storage/types";
import { writeState, type CardState } from "./cards";
import { readReview } from "./recall";
import { createMaterial, createSubject, isSchool, materialName, orderOf, SUBJECT_FILE, type Material, type StudyNote, type Subject } from "./study";

// "My notebook": a subject's own notes written as numbered chapters ("00. Introdução",
// "08. Transações em JDBC"), the way a folder of Obsidian notes that follows a book is written.
// The number at the start of the title is the order; nothing else marks a note as a chapter.
// Where reading stopped is the subject's `notebook_at` (the note's file name).
//
// A folder brought in keeps its shape: its .md files become the notebook (or, for a ready-made
// handout split in files, one material with a chapter per file), its sub-folders sub-subjects,
// `_meuResumo.md` (or any "_…resumo/summary") the "in my own words" text, its drawings and
// pictures go where the app keeps them (drawings/, attachments/).

/** The notebook of a subject: its numbered notes, in order. */
export function notebookOf(s: Subject): StudyNote[] {
  return s.notes
    .filter(n => n.kind === "note" && n.order !== null)
    .sort((a, b) => a.order! - b.order! || a.title.localeCompare(b.title, undefined, { numeric: true }));
}

/** The notebook chapter where the subject's reading stopped, or null. */
export function notebookAt(s: Subject): StudyNote | null {
  if (!s.notebookAt) return null;
  return notebookOf(s).find(n => materialName(n.path) === s.notebookAt) ?? null;
}

/** The title prefix of the next chapter ("16. "), two digits like the rest. */
export function nextChapterPrefix(s: Subject): string {
  const last = notebookOf(s).at(-1)?.order;
  const n = last === undefined ? 0 : (last ?? 0) + 1;
  return `${String(n).padStart(2, "0")}. `;
}

/** Remembers the notebook chapter opened (no write when it is the same). */
export async function setNotebookAt(notes: Notes, s: Subject, notePath: string): Promise<void> {
  const name = materialName(notePath);
  if (s.notebookAt !== name) await notes.patchHeader(s.path, { notebook_at: name });
}

export { orderOf };

// ---- Bringing a folder in ----

export type ImportMode = "notebook" | "material";

export interface ImportResult {
  notes: number;
  subjects: number;
  /** Notes left out because one with that title is already in the subject. */
  skipped: string[];
  drawings: number;
  files: number;
  summary: boolean;
  material?: string;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const isNoteFile = (p: string) => /\.(md|markdown)$/i.test(p) && !isDrawingPath(p);
const FILE_KINDS = /\.(png|jpe?g|gif|webp|svg|bmp|avif|pdf)$/i;
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", avif: "image/avif", pdf: "application/pdf" };
const isSummaryName = (name: string) => /^_/.test(name) && /resumo|summary/i.test(name);
const titleOfFile = (path: string) => baseName(path).replace(/\.(md|markdown)$/i, "").trim();

/** Paths inside the picked folder, without the folder's own name; hidden ones (".obsidian/…") left out. */
export function relativePaths(picked: PickedFile[]): { root: string; files: { rel: string; f: PickedFile }[] } {
  const parts = picked.map(f => f.path.split("/").filter(Boolean));
  const first = parts[0]?.[0] ?? "";
  const shared = parts.length > 0 && parts.every(p => p.length > 1 && p[0] === first);
  const files = picked
    .map((f, i) => ({ rel: (shared ? parts[i].slice(1) : parts[i]).join("/"), f }))
    .filter(x => x.rel && !x.rel.split("/").some(p => p.startsWith(".")))
    .sort((a, b) => a.rel.localeCompare(b.rel, undefined, { numeric: true }));
  return { root: shared ? first : "", files };
}

/** A note's text as brought in: no header, and "# <file name>" on top so the title keeps its number. */
export function notebookBody(text: string, title: string): string {
  const body = parse(text.replace(/\r\n/g, "\n")).body.replace(/^\s*\n/, "");
  const first = body.split("\n").find(l => l.trim()) ?? "";
  const m = /^#[ \t]+(.+?)[ \t#]*$/.exec(first);
  if (m && fold(m[1]) === fold(title)) return body;
  return `# ${title}\n\n${body}`.replace(/\s*$/, "\n");
}

/** Every heading one level down (outside code), so a file's own "#" headings sit under its chapter. */
export function demoteHeadings(body: string): string {
  let fence = false;
  return body
    .split("\n")
    .map(l => {
      if (/^\s*(```|~~~)/.test(l)) fence = !fence;
      return !fence && /^#{1,5}[ \t]/.test(l) ? `#${l}` : l;
    })
    .join("\n");
}

const decode = async (f: PickedFile) => new TextDecoder().decode(await f.read());

/** Pictures, PDFs and drawings of the folder, into the app's places (a name already there is kept). */
async function bringFiles(notes: Notes, files: { rel: string; f: PickedFile }[]): Promise<{ drawings: number; files: number }> {
  const s = notes.storage;
  const drawings = await importDrawings(
    s,
    files.filter(x => isDrawingPath(x.rel) || FILE_KINDS.test(x.rel)).map(x => ({ path: x.rel, read: x.f.read })),
  );
  let copied = 0;
  for (const x of files) {
    if (!FILE_KINDS.test(x.rel) || isDrawingPath(x.rel)) continue;
    const name = baseName(x.rel);
    if (await findAttachment(s, name)) continue;
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    await saveAttachment(s, name, MIME[ext] ?? "application/octet-stream", await x.f.read());
    copied++;
  }
  return { drawings: drawings.added.length, files: copied };
}

/**
 * Brings a picked folder into a subject. "notebook": each .md a note (sub-folders become
 * sub-subjects); "material": all the .md files, in name order, one material whose chapters are
 * the files. Notes whose title the subject already has are skipped, so bringing the same folder
 * again only adds what is new.
 */
export async function importFolder(notes: Notes, subject: Subject, all: Subject[], picked: PickedFile[], mode: ImportMode): Promise<ImportResult> {
  const { root, files } = relativePaths(picked);
  const docs = files.filter(x => isNoteFile(x.rel));
  const out: ImportResult = { notes: 0, subjects: 0, skipped: [], drawings: 0, files: 0, summary: false };

  if (mode === "material") {
    const parts: string[] = [];
    for (const x of docs) {
      const title = titleOfFile(x.rel);
      const body = parse((await decode(x.f)).replace(/\r\n/g, "\n")).body.trim();
      parts.push(`# ${title}\n\n${demoteHeadings(body)}`);
    }
    const title = root || titleOfFile(docs[0]?.rel ?? "") || subject.title;
    const n = await createMaterial(notes, subject.dir, { title, kind: "handout", body: `${parts.join("\n\n")}\n` });
    out.material = n.path;
  } else {
    // Sub-folder path → its subject (made on first use; an existing child with that name is reused).
    const dirs = new Map<string, { dir: string; slug: string; titles: Set<string> }>();
    const titlesOf = (s: Subject) => new Set(s.notes.map(n => fold(n.title)));
    dirs.set("", { dir: subject.dir, slug: subject.slug, titles: titlesOf(subject) });
    const known = all.filter(x => !isSchool(x));
    const subjectFor = async (folder: string) => {
      const have = dirs.get(folder);
      if (have) return have;
      const up = folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : "";
      const parent = await subjectFor(up);
      const name = folder.slice(folder.lastIndexOf("/") + 1);
      const existing = known.find(x => x.parent === parent.slug && fold(x.title) === fold(name));
      let got: { dir: string; slug: string; titles: Set<string> };
      if (existing) got = { dir: existing.dir, slug: existing.slug, titles: titlesOf(existing) };
      else {
        const n = await createSubject(notes, { title: name, parent: parent.slug });
        const dir = n.path.slice(0, -(SUBJECT_FILE.length + 1));
        got = { dir, slug: dir.slice(dir.lastIndexOf("/") + 1), titles: new Set() };
        out.subjects++;
      }
      dirs.set(folder, got);
      return got;
    };
    for (const x of docs) {
      const folder = x.rel.includes("/") ? x.rel.slice(0, x.rel.lastIndexOf("/")) : "";
      const at = await subjectFor(folder);
      const name = baseName(x.rel);
      const text = await decode(x.f);
      if (isSummaryName(name)) {
        const path = `${at.dir}/${SUBJECT_FILE}`;
        const s = await notes.load(path);
        const own = parse(text.replace(/\r\n/g, "\n")).body.replace(/^\s*\n/, "");
        if (!s.body.trim()) {
          await notes.save(s, s.data, own);
          out.summary = true;
          continue;
        }
        // Brought in before: the same text is already there.
        if (s.body.trim() === own.trim()) continue;
      }
      const title = isSummaryName(name) ? titleOfFile(name).replace(/^_+/, "") : titleOfFile(name);
      if (at.titles.has(fold(title))) {
        out.skipped.push(title);
        continue;
      }
      at.titles.add(fold(title));
      const path = await notes.freePath(`${at.dir}/notes`, slugify(title, 60) || "note");
      await notes.create(path, { type: "study-note" }, notebookBody(text, title));
      out.notes++;
    }
  }
  const brought = await bringFiles(notes, files);
  out.drawings = brought.drawings;
  out.files = brought.files;
  return out;
}

// ---- What to do today ----

export type Pick =
  | { kind: "continue-material"; subject: Subject; material: Material; chapter: number; title: string }
  | { kind: "continue-notebook"; subject: Subject; note: StudyNote }
  | { kind: "recall"; subject: Subject; note: StudyNote; due: boolean }
  | { kind: "todo"; subject: Subject; note: StudyNote };

/** A note worth trying to recall: written down, more than a few lines. */
const recallable = (n: StudyNote) => n.kind !== "cards" && !n.empty && n.chars >= 400;

/**
 * At most three things for today, never a count: where reading stopped, one note to try to
 * recall (one whose review day came, or else one written some days ago that was never
 * reviewed, a different one each day) and the next notebook chapter still to write.
 */
export function todayPicks(subjects: Subject[], today = isoDate()): Pick[] {
  const out: Pick[] = [];
  const live = subjects.filter(s => !s.course || s.result === "taking");

  // Continue: the newest of "a material stopped at" and "a notebook chapter stopped at".
  let cont: { when: string; pick: Pick } | null = null;
  for (const s of live) {
    for (const m of s.materials) {
      const ch = m.at === null ? undefined : m.chapters.find(c => c.n === m.at);
      const ids = new Set(m.chapters.map(c => c.n));
      if (!ch || m.done.filter(n => ids.has(n)).length === m.chapters.length) continue;
      if (!cont || m.modified > cont.when)
        cont = { when: m.modified, pick: { kind: "continue-material", subject: s, material: m, chapter: ch.n, title: ch.title } };
    }
    const n = notebookAt(s);
    // A finished chapter is not where to go on: the next one to write is (below).
    if (n && !n.finished && (!cont || s.notebookWhen > cont.when)) cont = { when: s.notebookWhen, pick: { kind: "continue-notebook", subject: s, note: n } };
  }
  if (cont) out.push(cont.pick);
  const busy = cont?.pick.kind === "continue-notebook" ? cont.pick.note.path : "";

  // Recall: a note whose day came (oldest first), else one left alone for 3 to 60 days.
  const notes = live.flatMap(s => s.notes.filter(n => n.path !== busy && recallable(n)).map(n => ({ s, n })));
  const due = notes.filter(x => x.n.review && x.n.review.due <= today).sort((a, b) => a.n.review!.due.localeCompare(b.n.review!.due));
  if (due.length) out.push({ kind: "recall", subject: due[0].s, note: due[0].n, due: true });
  else {
    const from = isoDate(addDays(new Date(`${today}T00:00`), -60));
    const to = isoDate(addDays(new Date(`${today}T00:00`), -3));
    const fresh = notes
      .filter(x => !x.n.review && x.n.modified.slice(0, 10) >= from && x.n.modified.slice(0, 10) <= to)
      .sort((a, b) => Number(b.n.points.some(p => p.kind === "difficulty")) - Number(a.n.points.some(p => p.kind === "difficulty")) || b.n.modified.localeCompare(a.n.modified));
    if (fresh.length) {
      const day = Math.round(Date.parse(`${today}T00:00Z`) / 86400000);
      const x = fresh[day % Math.min(fresh.length, 5)];
      out.push({ kind: "recall", subject: x.s, note: x.n, due: false });
    }
  }

  // To write: the next chapter not finished of the subject being read, else of another one.
  const order = cont ? [cont.pick.subject, ...live.filter(s => s !== cont!.pick.subject)] : live;
  for (const s of order) {
    const book = notebookOf(s);
    const at = notebookAt(s);
    const after = at ? book.slice(book.indexOf(at) + 1) : book;
    const todo = (n: StudyNote) => !n.finished && n.path !== busy;
    const next = after.find(todo) ?? book.find(todo);
    if (next) {
      out.push({ kind: "todo", subject: s, note: next });
      break;
    }
  }
  return out;
}

// ---- Whole-note review state ----

/** Marks a notebook chapter finished or not (`finished: true` in its header), `modified` untouched. */
export async function setFinished(notes: Notes, path: string, finished: boolean): Promise<void> {
  const n = await notes.load(path);
  await notes.save(n, { ...n.data, finished: finished || undefined }, n.body, { touch: false });
}

/** Saves a note's review state (undefined clears it) without touching `modified`. Returns the old one, for Undo. */
export async function setNoteReview(notes: Notes, path: string, state: CardState | undefined): Promise<CardState | undefined> {
  const n = await notes.load(path);
  const old = readReview(n.data.review);
  await notes.save(n, { ...n.data, review: state ? writeState(state) : undefined }, n.body, { touch: false });
  return old;
}
